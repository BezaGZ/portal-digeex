import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { MyDSpaceObject } from '../../../core/api/models/my-dspace.model';
import { IsoDateLocalPipe } from '../../../core/i18n/iso-date-local.pipe';
import { EmptyState } from '../../../shared';
import { LoadingSpinner } from '../../../shared/components/loading-spinner/loading-spinner';
import { ItemAdminFacade } from '../content/services/item-admin-facade';
import { LoadingService, withLoading } from '../../../core/loading';
import { ResourcesAdminFacade } from '../content/services/resources-admin-facade';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { DangerousDeleteDialog } from '../../../shared/components/dangerous-delete-dialog/dangerous-delete-dialog';
import { isSuperadmin } from '../../../core/auth/role-capabilities';
import {
  coverUrlOf as coverUrlOfUtil,
  entityTypeOf as entityTypeOfUtil,
  isWithdrawn as isWithdrawnUtil,
  issuedOf as issuedOfUtil,
  publicRouteOf as publicRouteOfUtil,
  resourceTypeOf as resourceTypeOfUtil,
  stateOf as stateOfUtil,
  titleOf as titleOfUtil,
} from '../shared/services/my-dspace-object.util';

/**
 * `administrativeView` declara solo `sortTitle`, `sortDateIssued` y
 * `sortDateAccessioned` (más `sortScore` por relevancia). No incluye
 * `lastModified` — mandarlo da 422 "Invalid search request".
 */
const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Subida reciente', value: 'dc.date.accessioned,desc' },
  { label: 'Subida antigua', value: 'dc.date.accessioned,asc' },
  { label: 'Fecha de publicación reciente', value: 'dc.date.issued,desc' },
  { label: 'Fecha de publicación antigua', value: 'dc.date.issued,asc' },
  { label: 'Título A-Z', value: 'dc.title,asc' },
  { label: 'Título Z-A', value: 'dc.title,desc' },
];

const ENTITY_TYPE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'Todos', value: null },
  { label: 'Documento', value: 'Documento' },
  { label: 'Galería', value: 'Galeria' },
  { label: 'Estadística', value: 'Estadistica' },
];

type ResourcesTab = 'activos' | 'eliminados';

/**
 * Pantalla `/administrador/recursos`. Lista global del admin con tabs
 * Activos / Eliminados. SuperAdmin ve todo; admin_subdireccion ve sólo
 * los items dentro de su sub-community (scope resuelto en el facade).
 * Soporta filtros por texto, rango de años, entity-type y orden.
 */
@Component({
  selector: 'app-resources-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resources-admin.html',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    RouterLink,
    SelectModule,
    TooltipModule,
    LoadingSpinner,
    EmptyState,
    IsoDateLocalPipe,
    DangerousDeleteDialog,
  ],
})
export class ResourcesAdmin {
  private readonly facade = inject(ResourcesAdminFacade);
  private readonly itemFacade = inject(ItemAdminFacade);
  private readonly confirmation = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authCaller = inject(AuthCallerService);
  private readonly loadingService = inject(LoadingService);

  readonly objects = signal<MyDSpaceObject[]>([]);
  readonly loading = signal(true);
  readonly totalElements = signal(0);
  readonly currentPage = signal(0);
  readonly pageSize = signal(20);

  readonly tab = signal<ResourcesTab>('activos');
  readonly query = signal('');
  readonly dateFrom = signal<number | null>(null);
  readonly dateTo = signal<number | null>(null);
  readonly sortBy = signal<string>(SORT_OPTIONS[0].value);
  readonly entityType = signal<string | null>(null);

  readonly sortOptions = SORT_OPTIONS;
  readonly entityTypeOptions = ENTITY_TYPE_OPTIONS;

  readonly imageErrors = signal<ReadonlySet<string>>(new Set());

  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });
  /** SuperAdmin: único rol que puede borrar en duro (RN-16); gobierna el botón de borrado permanente. */
  readonly esSuperadmin = computed(() => isSuperadmin(this.caller()));

  /** Estado del diálogo de borrado permanente; target no-null = abierto. */
  readonly deleteTarget = signal<MyDSpaceObject | null>(null);
  readonly deleteVisible = computed(() => this.deleteTarget() !== null);
  readonly deleting = signal(false);
  /** Nombre completo (dc.title) que el usuario teclea para confirmar el borrado. */
  readonly deleteEntityLabel = computed(() => {
    const t = this.deleteTarget();
    return t ? this.titleOf(t) : '';
  });

  private callerSufijo = '';
  private readonly queryInput$ = new Subject<string>();

  constructor() {
    this.authCaller.currentCaller$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((caller) => {
        this.callerSufijo = caller?.sufijo ?? '';
      });

    this.queryInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => {
        this.query.set(q);
        this.load(0);
      });

    this.load(0);
  }

  onTabChange(tab: ResourcesTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.load(0);
  }

  onQueryInput(value: string): void {
    this.queryInput$.next(value);
  }

  onFiltersChange(): void {
    this.load(0);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.pageSize();
    const page = rows > 0 ? Math.floor((event.first ?? 0) / rows) : 0;
    if (page === this.currentPage() && rows === this.pageSize()) return;
    this.pageSize.set(rows);
    this.load(page);
  }

  onEdit(uuid: string): void {
    this.router.navigate(['/administrador/envios', uuid, 'editar']);
  }

  /**
   * Abre la vista pública del item en pestaña nueva, para no perder los
   * filtros ni la página del listado. La URL sale de `publicRouteOf`; si el
   * item no tiene ruta resoluble el template ya ocultó el botón.
   */
  onView(o: MyDSpaceObject): void {
    const route = publicRouteOfUtil(o);
    if (!route) return;
    window.open(this.router.serializeUrl(this.router.createUrlTree(route)), '_blank', 'noopener');
  }

  onDelete(uuid: string): void {
    this.confirmation.confirm({
      message: 'Esto retira el envío del sitio público. Podés restaurarlo después.',
      header: '¿Retirar este envío?',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, retirar',
        severity: 'danger',
        icon: 'pi pi-trash',
        rounded: true,
      },
      accept: () => {
        this.itemFacade
          .withdrawItem$(uuid, this.callerSufijo)
          .pipe(
            withLoading(this.loadingService, { message: 'Retirando el recurso…' }),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(() => this.load(this.currentPage()));
      },
    });
  }

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
        this.itemFacade
          .restoreItem$(uuid, this.callerSufijo)
          .pipe(
            withLoading(this.loadingService, { message: 'Restaurando el recurso…' }),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe(() => this.load(this.currentPage()));
      },
    });
  }

  /** Abre el diálogo de borrado permanente para el recurso elegido. */
  onPermanentDeleteClick(o: MyDSpaceObject): void {
    this.deleteTarget.set(o);
  }

  /**
   * Confirma el borrado en duro: dispara deleteItem$ (el facade valida superadmin),
   * cierra el diálogo y recarga la página al terminar.
   */
  onPermanentDeleteConfirmed(): void {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.itemFacade
      .deleteItem$(target.indexableObject.uuid)
      .pipe(
        withLoading(this.loadingService, { message: 'Eliminando el recurso…' }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.deleteTarget.set(null);
          this.deleting.set(false);
          this.load(this.currentPage());
        },
        error: () => this.deleting.set(false),
      });
  }

  onPermanentDeleteCancelled(): void {
    this.deleteTarget.set(null);
  }

  hasImageError(o: MyDSpaceObject): boolean {
    return this.imageErrors().has(o.indexableObject.uuid);
  }

  onImageError(uuid: string): void {
    const next = new Set(this.imageErrors());
    next.add(uuid);
    this.imageErrors.set(next);
  }

  // Helpers de tabla delegados al util compartido.
  readonly titleOf = titleOfUtil;
  readonly coverUrlOf = coverUrlOfUtil;
  readonly issuedOf = issuedOfUtil;
  readonly resourceTypeOf = resourceTypeOfUtil;
  readonly entityTypeOf = entityTypeOfUtil;
  readonly stateOf = stateOfUtil;
  readonly isWithdrawn = isWithdrawnUtil;
  readonly publicRouteOf = publicRouteOfUtil;

  private load(page: number): void {
    this.loading.set(true);
    this.facade
      .search$({
        withdrawn: this.tab() === 'eliminados',
        query: this.query().trim() || undefined,
        dateFrom: this.dateFrom() ?? undefined,
        dateTo: this.dateTo() ?? undefined,
        sort: this.sortBy(),
        entityType: this.entityType() ?? undefined,
        page,
        size: this.pageSize(),
      })
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
}
