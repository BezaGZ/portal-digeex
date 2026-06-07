import {
  Component,
  ChangeDetectionStrategy,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { TableLazyLoadEvent } from 'primeng/table';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';
import { CardModule } from 'primeng/card';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { Community, CommunityCreateBody } from '../../../core/api/models/community.model';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { CommunityFacade } from '../content/services/community-facade';
import { JsonPatchEntry } from '../../../core/api/json-patch.util';
import { CommunityTable } from './components/community-table/community-table';
import { CommunityDialog } from './components/community-dialog/community-dialog';
import { SubdireccionView } from './models/subdireccion-view.model';

interface SubdireccionFormPayload {
  nombreCorto: string;
  tituloCompleto: string;
  sufijo: string;
  description: string;
}

interface PaginatedSubsView {
  items: SubdireccionView[];
  totalElements: number;
}

const EMPTY_PAGE: PaginatedSubsView = { items: [], totalElements: 0 };

/**
 * Pantalla de gestión de subdirecciones (sub-comunidades top-level de la
 * community raíz DIGEEX). Asume que el bootstrap (`setup-dspace.sh`) ya
 * corrió y la raíz existe; si `searchTop` devuelve vacío, deja la lista
 * en blanco y la UI mostrará un mensaje de sistema no inicializado.
 */
@Component({
  selector: 'app-communities',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './communities.html',
  imports: [ButtonModule, CardModule, ToastModule, ConfirmDialogModule, MessageModule, LoadingSpinnerComponent, CommunityTable, CommunityDialog],
})
export class Communities {
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly dspaceApi = inject(DSpaceApiService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly facade = inject(CommunityFacade);
  private readonly confirmation = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  readonly rootUuid = signal<string | null>(null);
  readonly loading = signal<boolean>(true);
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  /** Solo SuperAdmin puede crear subdirecciones top-level (RN-40). */
  readonly canCreateTopLevel = computed(() => this.caller()?.role === 'superadmin');

  /** Estado del dialog de crear/editar. La UI lo lee para mostrar/ocultar. */
  readonly dialogMode = signal<'closed' | 'create' | 'edit'>('closed');
  readonly editTarget = signal<Community | null>(null);

  /** Sufijo del target en edición, derivado de digeex.sufijo del metadata. */
  readonly editTargetSufijo = computed(() => {
    const t = this.editTarget();
    return t ? this.extractSufijo(t) : '';
  });

  /**
   * Nombre corto de la subdirección. Se guarda en `dc.title.alternative`
   * (qualifier nativo del schema dc): es semánticamente "título alternativo"
   * — la forma corta del título oficial — y sobrevive el quirk de DSpace
   * 9.x que sobrescribe `name` con `dc.title` al consultar el recurso.
   * Mismo campo que se usa para la sigla del programa.
   */
  readonly editTargetNombreCorto = computed(() => {
    const t = this.editTarget();
    return t?.metadata?.['dc.title.alternative']?.[0]?.value ?? t?.name ?? '';
  });

  /** Título completo de la subdirección, leído de dc.title del metadata. */
  readonly editTargetTituloCompleto = computed(() => {
    const t = this.editTarget();
    return t?.metadata?.['dc.title']?.[0]?.value ?? t?.name ?? '';
  });

  /** Descripción del target en edición, leída de dc.description del metadata. */
  readonly editTargetDescription = computed(() => {
    const t = this.editTarget();
    return t?.metadata?.['dc.description']?.[0]?.value ?? '';
  });

  /** Página actual (0-based). La setea `onLazyLoad` desde el evento del `<p-table>`. */
  readonly currentPage = signal<number>(0);

  /** Tamaño de página. La setea `onLazyLoad` desde el evento del `<p-table>`. */
  readonly pageSize = signal<number>(10);

  /**
   * Contador de mutaciones para forzar refetch tras crear, editar o eliminar
   * sin tocar `currentPage` ni `pageSize`. Cada incremento cambia el trío de
   * dependencias del effect del fetch y obliga a re-disparar.
   */
  private readonly refreshCounter = signal<number>(0);

  /**
   * Guard del effect del fetch: recuerda el último trío
   * `{page, size, refresh}` disparado para evitar re-disparar cuando los
   * signals cambian sin valor neto. Patrón canonizado del proyecto para
   * listados admin paginados con effect signal-driven.
   */
  private readonly lastFetched = signal<{ page: number; size: number; refresh: number } | null>(null);

  /** Subdirecciones de la página actual, enriquecidas con conteos de programas e items. */
  readonly subdirecciones = signal<SubdireccionView[]>([]);

  /** Total de subdirecciones del repositorio, leído del `page.totalElements`. */
  readonly totalRecords = signal<number>(0);

  /** Helper que el template usa para inferir el sufijo de una subdirección. */
  extractSufijo(c: Community): string {
    return c.metadata?.['digeex.sufijo']?.[0]?.value ?? '';
  }

  /** Atajo de delete: el template pasa el target, el sufijo se deriva. */
  onDeleteClick(target: Community): void {
    this.handleDelete(target, this.extractSufijo(target));
  }

  /**
   * Handler del output `lazyLoad` del `<p-table>`. Convierte el offset `first`
   * de PrimeNG a índice de página 0-based y setea los signals; el effect
   * dispara el fetch cuando alguno cambia.
   */
  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? 10;
    const first = event.first ?? 0;
    const page = rows > 0 ? Math.floor(first / rows) : 0;
    this.pageSize.set(rows);
    this.currentPage.set(page);
  }

  openCreateDialog(): void {
    this.editTarget.set(null);
    this.dialogMode.set('create');
  }

  openEditDialog(target: Community): void {
    this.editTarget.set(target);
    this.dialogMode.set('edit');
  }

  closeDialog(): void {
    this.editTarget.set(null);
    this.dialogMode.set('closed');
  }

  constructor() {
    // Effect del fetch del listado: única fuente de verdad de "qué pedir
    // al backend". Observa la página, el tamaño y el contador de refresh;
    // cuando alguno cambia y el trío difiere del último fetcheado, sube
    // `loading` y dispara `fetchPaginated`. El guard `lastFetched` previene
    // re-disparar cuando los signals cambian sin valor neto. `untracked`
    // aísla las escrituras del effect para que no se autorretroalimente.
    effect(() => {
      const page = this.currentPage();
      const size = this.pageSize();
      const refresh = this.refreshCounter();
      const last = untracked(() => this.lastFetched());
      if (last && last.page === page && last.size === size && last.refresh === refresh) {
        return;
      }
      untracked(() => {
        this.lastFetched.set({ page, size, refresh });
        this.loading.set(true);
        this.fetchPaginated(page, size);
      });
    });
  }

  handleCreateSubmit(payload: SubdireccionFormPayload): void {
    // Convención setup-dspace.sh: el nombre corto va en `name` (DSpace lo
    // termina sobreescribiendo con dc.title) y replicado en
    // `dc.title.alternative`, que es la fuente estable de lectura. El
    // título completo va en `dc.title`. Mismo campo que la sigla en
    // programas para tener un solo modelo mental.
    const metadata: CommunityCreateBody['metadata'] = {
      'dc.title': [
        { value: payload.tituloCompleto, language: null, authority: null, confidence: -1, place: 0 },
      ],
      'dc.title.alternative': [
        { value: payload.nombreCorto, language: null, authority: null, confidence: -1, place: 0 },
      ],
    };
    if (payload.description?.trim()) {
      metadata['dc.description'] = [
        { value: payload.description, language: null, authority: null, confidence: -1, place: 0 },
      ];
    }
    const body: CommunityCreateBody = {
      name: payload.nombreCorto,
      type: 'community',
      metadata,
    };
    this.facade.createSubdireccion$(body, payload.sufijo).subscribe({
      next: () => {
        this.closeDialog();
        this.refreshCounter.update((n) => n + 1);
        this.toast.add({ severity: 'success', summary: 'Subdirección creada' });
      },
      error: (err) => this.toastError(err, 'No se pudo crear la subdirección'),
    });
  }

  handleEditSubmit(payload: SubdireccionFormPayload): void {
    const target = this.editTarget();
    if (!target) {
      return;
    }
    // nombreCorto y sufijo son inmutables después de crear: nombreCorto
    // está atado a dc.title.alternative (identificador estable, espejo de
    // la sigla en programas) y sufijo rompe los grupos ADMIN_<sufijo>/
    // SUBMITTERS_<sufijo>. Solo se patchean tituloCompleto (dc.title)
    // y descripción.
    const patch: JsonPatchEntry[] = [
      { op: 'replace', path: '/metadata/dc.title/0/value', value: payload.tituloCompleto },
      // El path /metadata/dc.description con value array funciona aunque el
      // campo no exista todavía: JSON Patch add reemplaza si existe y crea
      // si no. Cubre las subdirecciones de setup que ya tienen descripción
      // y futuras creadas desde la UI sin descripción inicial.
      {
        op: 'add',
        path: '/metadata/dc.description',
        value: [
          { value: payload.description ?? '', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    ];
    this.facade.updateSubdireccion$(target.uuid, patch, payload.sufijo).subscribe({
      next: () => {
        this.closeDialog();
        this.refreshCounter.update((n) => n + 1);
        this.toast.add({ severity: 'success', summary: 'Subdirección actualizada' });
      },
      error: (err) => this.toastError(err, 'No se pudo actualizar la subdirección'),
    });
  }

  handleDelete(target: Community, sufijo: string): void {
    // Para el mensaje uso el nombre corto (dc.title.alternative) si está,
    // fallback a name. En subdirecciones backfileadas con setup-dspace.sh
    // el corto es siempre más legible que el dc.title largo (Subdirección
    // de ...).
    const labelCorto = target.metadata?.['dc.title.alternative']?.[0]?.value ?? target.name;
    this.confirmation.confirm({
      message: `¿Eliminar la subdirección "${labelCorto}"? Esta acción borra también sus colecciones, items y grupos asociados.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: 'Cancelar',
        severity: 'secondary',
        outlined: true,
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Sí, eliminar',
        severity: 'danger',
        icon: 'pi pi-trash',
        rounded: true,
        styleClass: '!text-white !font-medium',
      },
      accept: () => {
        this.facade.deleteSubdireccion$(target.uuid, sufijo).subscribe({
          next: () => {
            this.refreshCounter.update((n) => n + 1);
            this.toast.add({ severity: 'success', summary: 'Subdirección eliminada' });
          },
          error: (err) => this.toastError(err, 'No se pudo eliminar la subdirección'),
        });
      },
    });
  }

  /**
   * Suscribe al pipeline de fetch y setea `subdirecciones`, `totalRecords`
   * y `loading`. Llamado por el effect cuando el trío de dependencias
   * (`page`, `size`, `refresh`) cambia.
   */
  private fetchPaginated(page: number, size: number): void {
    this.fetchPaginated$(page, size).subscribe({
      next: (result) => {
        this.subdirecciones.set(result.items);
        this.totalRecords.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Pipeline que arma la página: `searchTop` → `listSubcommunities` con la
   * ventana pedida → `forkJoin` que enriquece cada subdirección con su
   * conteo de programas y de items archivados (vía Discovery scope-filtered).
   */
  private fetchPaginated$(page: number, size: number): Observable<PaginatedSubsView> {
    return this.communityApi.searchTop(0, 1).pipe(
      switchMap((resp) => {
        const root = resp._embedded?.['communities']?.[0];
        this.rootUuid.set(root?.uuid ?? null);
        if (!root) {
          return of(EMPTY_PAGE);
        }
        return this.communityApi.listSubcommunities(root.uuid, page, size).pipe(
          switchMap((listResp) => {
            const embedded = listResp._embedded ?? {};
            const subs = (embedded as Record<string, Community[]>)['subcommunities']
              ?? (embedded as Record<string, Community[]>)['communities']
              ?? [];
            const totalElements = listResp.page?.totalElements ?? subs.length;
            if (subs.length === 0) {
              return of({ items: [], totalElements });
            }
            return forkJoin(subs.map((sub) => this.enrichSubdireccion$(sub))).pipe(
              map((items) => ({ items, totalElements })),
            );
          }),
        );
      }),
    );
  }

  private enrichSubdireccion$(sub: Community): Observable<SubdireccionView> {
    return forkJoin({
      programas: this.collectionApi.listByCommunity(sub.uuid, 0, 1),
      items: this.dspaceApi.getItems(sub.uuid, 0, 1),
    }).pipe(
      map(({ programas, items }) => ({
        ...sub,
        programasCount: programas.page?.totalElements ?? 0,
        recursosCount: items.page?.totalElements ?? 0,
      })),
    );
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = err instanceof Error ? err.message : fallback;
    this.toast.add({ severity: 'error', summary: 'Error', detail });
  }
}
