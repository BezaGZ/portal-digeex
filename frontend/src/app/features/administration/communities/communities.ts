import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, combineLatest, forkJoin, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
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
  name: string;
  sufijo: string;
  description: string;
}

interface TablePageState {
  page: number;
  size: number;
}

interface PaginatedSubsView {
  items: SubdireccionView[];
  totalElements: number;
}

const INITIAL_PAGE_STATE: TablePageState = { page: 0, size: 10 };
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

  /** Descripción del target en edición, leída de dc.description del metadata. */
  readonly editTargetDescription = computed(() => {
    const t = this.editTarget();
    return t?.metadata?.['dc.description']?.[0]?.value ?? '';
  });

  /** Estado paginado de la tabla; lo actualiza onLazyLoad de PrimeNG. */
  private readonly tableState = signal<TablePageState>(INITIAL_PAGE_STATE);

  /** Trigger para recargar tras mutaciones. BehaviorSubject emite al suscribirse. */
  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  private readonly subdireccionesPaginated = toSignal(
    combineLatest([toObservable(this.tableState), this.refresh$]).pipe(
      tap(() => this.loading.set(true)),
      switchMap(([state]) => this.fetchPaginatedSubdirecciones$(state.page, state.size)),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: EMPTY_PAGE },
  );

  readonly subdirecciones = computed(() => this.subdireccionesPaginated().items);
  readonly totalRecords = computed(() => this.subdireccionesPaginated().totalElements);
  readonly pageSize = computed(() => this.tableState().size);

  /** Helper que el template usa para inferir el sufijo de una subdirección. */
  extractSufijo(c: Community): string {
    return c.metadata?.['digeex.sufijo']?.[0]?.value ?? '';
  }

  /** Atajo de delete: el template pasa el target, el sufijo se deriva. */
  onDeleteClick(target: Community): void {
    this.handleDelete(target, this.extractSufijo(target));
  }

  /**
   * Bind a `(onLazyLoad)` del p-table. PrimeNG emite `first` (offset) y
   * `rows` (tamaño de página, posiblemente null en el primer evento).
   * Al cambiar de página o de size, refetch con la nueva ventana.
   */
  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? INITIAL_PAGE_STATE.size;
    const first = event.first ?? 0;
    const page = rows > 0 ? Math.floor(first / rows) : 0;
    const current = this.tableState();
    if (current.page !== page || current.size !== rows) {
      this.tableState.set({ page, size: rows });
    }
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

  handleCreateSubmit(payload: SubdireccionFormPayload): void {
    const metadata: CommunityCreateBody['metadata'] = {
      'dc.title': [
        { value: payload.name, language: null, authority: null, confidence: -1, place: 0 },
      ],
    };
    if (payload.description?.trim()) {
      metadata['dc.description'] = [
        { value: payload.description, language: null, authority: null, confidence: -1, place: 0 },
      ];
    }
    const body: CommunityCreateBody = {
      name: payload.name,
      type: 'community',
      metadata,
    };
    this.facade.createSubdireccion$(body, payload.sufijo).subscribe({
      next: () => {
        this.closeDialog();
        this.refresh$.next();
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
    const patch: JsonPatchEntry[] = [
      { op: 'replace', path: '/metadata/dc.title/0/value', value: payload.name },
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
        this.refresh$.next();
        this.toast.add({ severity: 'success', summary: 'Subdirección actualizada' });
      },
      error: (err) => this.toastError(err, 'No se pudo actualizar la subdirección'),
    });
  }

  handleDelete(target: Community, sufijo: string): void {
    this.confirmation.confirm({
      message: `¿Eliminar la subdirección "${target.name}"? Esta acción borra también sus colecciones, items y grupos asociados.`,
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
            this.refresh$.next();
            this.toast.add({ severity: 'success', summary: 'Subdirección eliminada' });
          },
          error: (err) => this.toastError(err, 'No se pudo eliminar la subdirección'),
        });
      },
    });
  }

  /**
   * Pipeline que arma la página: searchTop → listSubcommunities ventana
   * pedida → forkJoin que enriquece cada subdirección con su conteo de
   * programas y de items archivados (vía Discovery scope-filtered).
   */
  private fetchPaginatedSubdirecciones$(page: number, size: number): Observable<PaginatedSubsView> {
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
