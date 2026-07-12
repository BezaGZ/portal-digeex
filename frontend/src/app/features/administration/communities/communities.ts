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
import { catchError, map, switchMap } from 'rxjs/operators';
import { TableLazyLoadEvent } from 'primeng/table';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { CardModule } from 'primeng/card';
import { LoadingSpinner } from '../../../shared/components/loading-spinner/loading-spinner';
import { DangerousDeleteDialog } from '../../../shared/components/dangerous-delete-dialog/dangerous-delete-dialog';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { Community, CommunityCreateBody, sufijoOf } from '../../../core/api/models/community.model';
import { Collection } from '../../../core/api/models/collection.model';
import * as roleCaps from '../../../core/auth/role-capabilities';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { CommunityFacade } from '../content/services/community-facade';
import { JsonPatchEntry } from '../../../core/api/json-patch.util';
import { buildMetadataPatch } from '../../../core/api/metadata-patch.util';
import { LoadingService, withLoading } from '../../../core/loading';
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
  imports: [ButtonModule, CardModule, LoadingSpinner, EmptyState, DangerousDeleteDialog, CommunityTable, CommunityDialog],
})
export class Communities {
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly facade = inject(CommunityFacade);
  private readonly discovery = inject(DiscoveryService);
  private readonly toast = inject(MessageService);
  private readonly loadingService = inject(LoadingService);

  readonly rootUuid = signal<string | null>(null);
  readonly loading = signal<boolean>(true);
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  /** Solo SuperAdmin puede crear subdirecciones top-level (RN-40). */
  readonly canCreateTopLevel = computed(() => roleCaps.canCreateTopLevel(this.caller()));

  /** Estado del dialog de crear/editar. La UI lo lee para mostrar/ocultar. */
  readonly dialogMode = signal<'closed' | 'create' | 'edit'>('closed');
  readonly editTarget = signal<Community | null>(null);

  /**
   * Estado del diálogo de borrado peligroso. `deleteTarget` no-null = abierto.
   * Borrar una subdirección es recursivo: arrastra sus programas y los recursos
   * de todo el subárbol. El conteo de programas + sus títulos salen de
   * `listByCommunity`; el conteo recursivo de recursos, de Discovery acotado.
   */
  readonly deleteTarget = signal<Community | null>(null);
  readonly deleteProgramsCount = signal<number | null>(null);
  readonly deleteItemsCount = signal<number | null>(null);
  readonly deleteTitles = signal<string[]>([]);
  readonly deleteLoading = signal<boolean>(false);
  readonly deleteLoadError = signal<boolean>(false);
  readonly deleting = signal<boolean>(false);
  private deleteSufijo = '';

  readonly deleteVisible = computed(() => this.deleteTarget() !== null);
  /** Nombre completo (dc.title) que el usuario debe teclear para confirmar. */
  readonly deleteEntityLabel = computed(() => {
    const t = this.deleteTarget();
    return t ? (t.metadata?.['dc.title']?.[0]?.value ?? t.name ?? '') : '';
  });

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
    return sufijoOf(c) ?? '';
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
    this.facade
      .createSubdireccion$(body, payload.sufijo)
      .pipe(withLoading(this.loadingService, { message: 'Creando subdirección…' }))
      .subscribe({
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
    const patch: JsonPatchEntry[] = buildMetadataPatch(
      {
        'dc.title': payload.tituloCompleto,
        'dc.description': payload.description,
      },
      target.metadata ?? {},
    );
    this.facade
      .updateSubdireccion$(target.uuid, patch)
      .pipe(withLoading(this.loadingService, { message: 'Guardando la subdirección…' }))
      .subscribe({
      next: () => {
        this.closeDialog();
        this.refreshCounter.update((n) => n + 1);
        this.toast.add({ severity: 'success', summary: 'Subdirección actualizada' });
      },
      error: (err) => this.toastError(err, 'No se pudo actualizar la subdirección'),
    });
  }

  /**
   * Abre el diálogo de borrado peligroso y, solo entonces, pide el detalle de
   * lo que se arrastra: los programas directos (conteo + títulos, vía
   * `listByCommunity`) y el conteo recursivo de recursos del subárbol (Discovery
   * acotado a la comunidad). Si cualquiera de las dos falla se marca el error y
   * no se muestran conteos fabricados; la confirmación por escritura es la
   * salvaguarda real, así que el borrado sigue disponible.
   */
  handleDelete(target: Community, sufijo: string): void {
    this.deleteTarget.set(target);
    this.deleteSufijo = sufijo;
    this.deleteProgramsCount.set(null);
    this.deleteItemsCount.set(null);
    this.deleteTitles.set([]);
    this.deleteLoadError.set(false);
    this.deleting.set(false);
    this.deleteLoading.set(true);
    forkJoin({
      programs: this.collectionApi
        .listByCommunity(target.uuid, 0, 20, {})
        .pipe(catchError(() => of(null))),
      items: this.discovery
        .search({ scope: target.uuid, dsoType: 'item', size: 0 })
        .pipe(catchError(() => of(null))),
    }).subscribe(({ programs, items }) => {
      if (programs) {
        const colls: Collection[] = programs._embedded?.['collections'] ?? [];
        this.deleteProgramsCount.set(programs.page?.totalElements ?? colls.length);
        this.deleteTitles.set(
          colls.map((c) => c.metadata?.['dc.title']?.[0]?.value ?? c.name ?? '').filter((t) => t.length > 0),
        );
      }
      if (items) {
        this.deleteItemsCount.set(items.totalElements);
      }
      if (!programs || !items) {
        this.deleteLoadError.set(true);
      }
      this.deleteLoading.set(false);
    });
  }

  /** Confirmación del diálogo: borra la subdirección y refresca; conserva el flujo previo. */
  onDeleteConfirmed(): void {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.facade
      .deleteSubdireccion$(target.uuid)
      .pipe(withLoading(this.loadingService, { message: 'Eliminando subdirección…' }))
      .subscribe({
        next: () => {
          this.closeDeleteDialog();
          this.refreshCounter.update((n) => n + 1);
          this.toast.add({ severity: 'success', summary: 'Subdirección eliminada' });
        },
        error: (err) => {
          this.deleting.set(false);
          this.toastError(err, 'No se pudo eliminar la subdirección');
        },
      });
  }

  onDeleteCancelled(): void {
    this.closeDeleteDialog();
  }

  private closeDeleteDialog(): void {
    this.deleteTarget.set(null);
    this.deleteSufijo = '';
    this.deleteProgramsCount.set(null);
    this.deleteItemsCount.set(null);
    this.deleteTitles.set([]);
    this.deleteLoadError.set(false);
    this.deleting.set(false);
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
   * ventana pedida. El conteo de recursos sale del campo nativo
   * `archivedItemsCount` de cada subdirección (`webui.strengths.show`), y el de
   * programas de un único `listAll` de colecciones agrupado por comunidad
   * padre, sin una petición por subdirección.
   */
  private fetchPaginated$(page: number, size: number): Observable<PaginatedSubsView> {
    return this.communityApi.searchTop(0, 1).pipe(
      switchMap((resp) => {
        const root = resp._embedded?.['communities']?.[0];
        this.rootUuid.set(root?.uuid ?? null);
        if (!root) {
          return of(EMPTY_PAGE);
        }
        return forkJoin({
          subsResp: this.communityApi.listSubcommunities(root.uuid, page, size),
          collections: this.collectionApi
            .listAll({ embed: 'parentCommunity' })
            .pipe(catchError(() => of([] as Collection[]))),
        }).pipe(
          map(({ subsResp, collections }) => {
            const embedded = subsResp._embedded ?? {};
            const subs = (embedded as Record<string, Community[]>)['subcommunities']
              ?? (embedded as Record<string, Community[]>)['communities']
              ?? [];
            const totalElements = subsResp.page?.totalElements ?? subs.length;
            if (subs.length === 0) {
              return { items: [], totalElements };
            }
            const programsByParent = new Map<string, number>();
            for (const col of collections) {
              const parentUuid = col._embedded?.parentCommunity?.uuid;
              if (!parentUuid) continue;
              programsByParent.set(parentUuid, (programsByParent.get(parentUuid) ?? 0) + 1);
            }
            const items: SubdireccionView[] = subs.map((sub) => ({
              ...sub,
              programasCount: programsByParent.get(sub.uuid) ?? 0,
              recursosCount: sub.archivedItemsCount >= 0 ? sub.archivedItemsCount : 0,
            }));
            return { items, totalElements };
          }),
        );
      }),
    );
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = err instanceof Error ? err.message : fallback;
    this.toast.add({ severity: 'error', summary: 'Error', detail });
  }
}
