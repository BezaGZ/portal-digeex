import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';

import { MyDSpaceApiService } from '../../../../core/api/my-dspace-api.service';
import { MyDSpaceObject } from '../../../../core/api/models/my-dspace.model';
import { IsoDateLocalPipe } from '../../../../core/i18n/iso-date-local.pipe';
import { EmptyState } from '../../../../shared';
import { LoadingSpinner } from '../../../../shared/components/loading-spinner/loading-spinner';
import { ItemAdminFacade } from '../../content/services/item-admin-facade';
import { LoadingService, withLoading } from '../../../../core/loading';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import {
  coverUrlOf as coverUrlOfUtil,
  entityTypeOf as entityTypeOfUtil,
  isWithdrawn as isWithdrawnUtil,
  issuedOf as issuedOfUtil,
  publicRouteOf as publicRouteOfUtil,
  resourceTypeOf as resourceTypeOfUtil,
  stateOf as stateOfUtil,
  titleOf as titleOfUtil,
} from '../../shared/services/my-dspace-object.util';

/** Opciones del dropdown de orden; coinciden con los `sortFields` declarados en `workspaceConfiguration`. */
const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Modificación reciente', value: 'lastModified,desc' },
  { label: 'Título A → Z', value: 'dc.title,asc' },
  { label: 'Fecha de publicación', value: 'dc.date.issued,desc' },
];

/**
 * Bandeja personal del usuario logueado: lista lo que él subió al portal.
 * Reusable para todos los roles (SuperAdmin, Admin Subdirección, Personal
 * Delegado). El listado se arma con el endpoint MyDSpace de DSpace
 * (`configuration=workspace`) que junta drafts, en-revisión y archivados
 * en una sola consulta paginada. Los filtros expuestos al usuario son los
 * que el bean nativo `workspaceConfiguration` declara: texto libre, rango
 * de fecha de publicación y orden.
 */
@Component({
  selector: 'app-my-submissions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-submissions.html',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    LoadingSpinner,
    EmptyState,
    IsoDateLocalPipe,
  ],
})
export class MySubmissions {
  private readonly api = inject(MyDSpaceApiService);
  private readonly facade = inject(ItemAdminFacade);
  private readonly authCaller = inject(AuthCallerService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadingService = inject(LoadingService);

  readonly objects = signal<MyDSpaceObject[]>([]);
  readonly totalElements = signal(0);
  readonly currentPage = signal(0);
  /** Tamaño de página actual. Se mueve con el selector del paginator. */
  readonly pageSize = signal(20);
  /** Spinner de carga; se muestra mientras el HTTP del search$ está pendiente. */
  readonly loading = signal(true);

  /** Texto libre que llega al param `query` después del debounce. */
  readonly query = signal('');
  /** Año desde inclusive (mapea a `f.dateIssued=[from TO *],equals`). */
  readonly dateFrom = signal<number | null>(null);
  /** Año hasta inclusive. */
  readonly dateTo = signal<number | null>(null);
  /** Campo,dirección que llega al param `sort`. */
  readonly sortBy = signal<string>(SORT_OPTIONS[0].value);

  readonly sortOptions = SORT_OPTIONS;

  /** UUIDs de items cuyo thumbnail falló al cargar; el template cae al placeholder. */
  readonly imageErrors = signal<ReadonlySet<string>>(new Set());

  /** Sufijo del caller capturado del AuthCallerService; lo exige el facade para scope check. */
  private callerSufijo = '';

  /** Bus interno para el debounce del input de búsqueda. */
  private readonly queryInput$ = new Subject<string>();

  constructor() {
    this.authCaller.currentCaller$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => (this.callerSufijo = c?.sufijo ?? ''));

    this.queryInput$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        this.query.set(q);
        this.load(0);
      });

    // Recarga la bandeja cuando el usuario vuelve a `/administrador/envios`.
    // El check de `loading` evita un doble-load durante el NavigationEnd de
    // la activación inicial del componente.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        filter((e) => e.urlAfterRedirects === '/administrador/envios'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.loading()) return;
        this.load(this.currentPage());
      });

    this.load(0);
  }

  /**
   * Handler del `<p-paginator>` independiente. Cuando el usuario cambia
   * el tamaño desde el selector el evento trae `rows` distinto al actual;
   * lo guardamos antes de recargar para que la request use el nuevo size.
   */
  onPageChange(event: { page?: number; rows?: number | null }): void {
    if (event.rows != null && event.rows !== this.pageSize()) {
      this.pageSize.set(event.rows);
    }
    if (event.page === undefined) return;
    this.load(event.page);
  }

  /**
   * Bind del p-table en modo lazy. PrimeNG emite `first` (offset) y `rows`;
   * los traducimos a page y delegamos en onPageChange. El primer evento al
   * montar la tabla coincide con la página y size actuales, así que se ignora
   * para no duplicar la carga inicial del flujo de arranque.
   */
  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const page = rows > 0 ? Math.floor((event.first ?? 0) / rows) : 0;
    if (page === this.currentPage() && rows === this.pageSize()) return;
    this.onPageChange({ page, rows });
  }

  /** Recibe cada keystroke del input de búsqueda y lo enruta al bus con debounce. */
  onQueryInput(value: string): void {
    this.queryInput$.next(value);
  }

  /** Disparado por los cambios inmediatos (fecha desde/hasta, sort). Recarga desde la página 0. */
  onFiltersChange(): void {
    this.load(0);
  }

  /** Navega a la pantalla de edición del item. */
  onEdit(uuid: string): void {
    this.router.navigate(['/administrador/envios', uuid, 'editar']);
  }

  /**
   * Abre la vista pública del envío en pestaña nueva, para no perder la
   * bandeja. La URL sale de `publicRouteOf`; si el envío no tiene ruta
   * resoluble (borrador, withdrawn) el template ya ocultó el botón.
   */
  onView(o: MyDSpaceObject): void {
    const route = publicRouteOfUtil(o);
    if (!route) return;
    window.open(this.router.serializeUrl(this.router.createUrlTree(route)), '_blank', 'noopener');
  }

  /**
   * Pide confirmación al usuario y ejecuta el soft delete del item. El facade
   * valida scope antes de pegar al backend; aquí pasamos el sufijo del caller
   * porque en Mis envíos los items siempre son del usuario logueado, así que
   * `caller.sufijo` cubre el assertWithinScope sin lookups extra.
   */
  onDelete(uuid: string): void {
    this.confirmation.confirm({
      message: 'Esto retira el envío del sitio público. Podés restaurarlo después.',
      header: '¿Eliminar este envío?',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, eliminar',
        severity: 'danger',
        icon: 'pi pi-trash',
        rounded: true,
      },
      accept: () => {
        this.facade
          .withdrawItem$(uuid, this.callerSufijo)
          .pipe(
            withLoading(this.loadingService, { message: 'Retirando el item…' }),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(() => this.load(0));
      },
    });
  }

  /** Restaura un item retirado; PATCH /withdrawn=false vía ItemAdminFacade. */
  onRestore(uuid: string): void {
    this.confirmation.confirm({
      message: 'El envío volverá al sitio público y aparecerá en la búsqueda.',
      header: '¿Restaurar este envío?',
      icon: 'pi pi-question-circle',
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, restaurar',
        severity: 'primary',
        icon: 'pi pi-replay',
        rounded: true,
      },
      accept: () => {
        this.facade
          .restoreItem$(uuid, this.callerSufijo)
          .pipe(
            withLoading(this.loadingService, { message: 'Restaurando el item…' }),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(() => this.load(0));
      },
    });
  }

  private load(page: number): void {
    this.loading.set(true);
    const opts = {
      query: this.query().trim() || undefined,
      dateFrom: this.dateFrom() ?? undefined,
      dateTo: this.dateTo() ?? undefined,
      sort: this.sortBy(),
    };

    this.api
      .search$(page, this.pageSize(), opts)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => {
          this.objects.set(p.items);
          this.totalElements.set(p.totalElements);
          this.currentPage.set(p.page);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  /** El template lo usa para mostrar el placeholder cuando el bitstream del thumbnail no carga. */
  hasImageError(o: MyDSpaceObject): boolean {
    return this.imageErrors().has(o.indexableObject.uuid);
  }

  /** Marca el thumbnail como roto para que el render caiga al placeholder. */
  onImageError(uuid: string): void {
    const next = new Set(this.imageErrors());
    next.add(uuid);
    this.imageErrors.set(next);
  }

  readonly titleOf = titleOfUtil;
  readonly coverUrlOf = coverUrlOfUtil;
  readonly issuedOf = issuedOfUtil;
  readonly resourceTypeOf = resourceTypeOfUtil;
  readonly entityTypeOf = entityTypeOfUtil;
  readonly stateOf = stateOfUtil;
  readonly isWithdrawn = isWithdrawnUtil;
  readonly publicRouteOf = publicRouteOfUtil;
}
