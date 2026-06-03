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
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { Select } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { CollectionTable } from './components/collection-table/collection-table';
import { CollectionDialog } from './components/collection-dialog/collection-dialog';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { Community } from '../../../core/api/models/community.model';
import { Collection, CollectionCreateBody } from '../../../core/api/models/collection.model';
import { JsonPatchEntry } from '../../../core/api/json-patch.util';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { CollectionFacade } from '../content/services/collection-facade';
import { findCallerSub } from '../shared/services/scope-resolver';
import { ProgramaView } from './models/programa-view.model';

interface ProgramaFormPayload {
  siglas: string;
  titulo: string;
  description: string;
  entityType: string;
  navLocation: string;
  orden: string;
  coverFile: File | null;
}

/**
 * Pantalla de gestión de programas (colecciones DSpace bajo cada
 * subdirección). El SuperAdmin elige una subdirección en el dropdown
 * superior y ve sus programas; admin_subdireccion queda fijado a su
 * propio sufijo. Cada acción mutativa delega al CollectionFacade.
 */
@Component({
  selector: 'app-collections',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collections.html',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    Select,
    ToastModule,
    ConfirmDialogModule,
    MessageModule,
    LoadingSpinnerComponent,
    CollectionTable,
    CollectionDialog,
  ],
})
export class Collections {
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly facade = inject(CollectionFacade);
  private readonly authCaller = inject(AuthCallerService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  readonly subdirecciones = signal<Community[]>([]);
  readonly rootUuid = signal<string | null>(null);
  readonly loading = signal<boolean>(true);
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  /** Estado del dialog de crear/editar. La UI lo lee para mostrar/ocultar. */
  readonly dialogMode = signal<'closed' | 'create' | 'edit'>('closed');
  readonly editTarget = signal<Collection | null>(null);

  /** Subdirección seleccionada en el dropdown; sus colecciones llenan la tabla. */
  readonly selectedSubdireccion = signal<Community | null>(null);

  /** Colecciones de la subdirección seleccionada, enriquecidas con recursosCount. */
  readonly collections = signal<ProgramaView[]>([]);

  /** Cambia la subdirección activa y refetcha sus colecciones con conteo de recursos. */
  selectSubdireccion(sub: Community | null): void {
    this.selectedSubdireccion.set(sub);
    if (!sub) {
      this.collections.set([]);
      return;
    }
    this.collectionApi
      .listByCommunity(sub.uuid, 0, 100, { embed: 'logo' })
      .pipe(
        // `archivedItemsCount` viaja en el listing porque DIGEEX activa
        // `webui.strengths.show=true` en `docker/local.cfg`.
        switchMap((resp) => {
          const colls: Collection[] = resp._embedded?.['collections'] ?? [];
          if (colls.length === 0) {
            return of([] as ProgramaView[]);
          }
          const views: ProgramaView[] = colls.map((coll) => ({
            ...coll,
            // Clamp defensivo: DSpace devuelve -1 si la feature strengths
            recursosCount: Math.max(0, coll.archivedItemsCount ?? 0),
          }));
          return of(views);
        }),
        // Ordeno por dc.identifier.other (orden en el menú); si falta o
        // no es numérico, queda al final.
        map((views) =>
          [...views].sort((a, b) => this.ordenValue(a) - this.ordenValue(b)),
        ),
      )
      .subscribe((views) => {
        this.collections.set(views);
      });
  }

  private ordenValue(c: Collection): number {
    const raw = c.metadata?.['dc.identifier.other']?.[0]?.value;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  openCreateDialog(): void {
    this.editTarget.set(null);
    this.dialogMode.set('create');
  }

  openEditDialog(target: Collection): void {
    this.editTarget.set(target);
    this.dialogMode.set('edit');
  }

  closeDialog(): void {
    this.editTarget.set(null);
    this.dialogMode.set('closed');
  }

  /** Helper que el template usa para inferir el sufijo de una subdirección. */
  extractSufijo(c: Community): string {
    return c.metadata?.['digeex.sufijo']?.[0]?.value ?? '';
  }

  /**
   * Pre-fill values del target en edit. La sigla se guarda en
   * `dc.title.alternative` (qualifier nativo del schema dc, semánticamente
   * "título alternativo" — la forma corta del título oficial). DSpace 9.x
   * sobrescribe el campo `name` con `dc.title` al consultar el recurso,
   * por eso no se puede leer la sigla desde `name`.
   */
  readonly editTargetSiglas = computed(
    () => this.editTarget()?.metadata?.['dc.title.alternative']?.[0]?.value ?? '',
  );
  readonly editTargetTitulo = computed(
    () => this.editTarget()?.metadata?.['dc.title']?.[0]?.value ?? this.editTarget()?.name ?? '',
  );
  readonly editTargetDescription = computed(
    () => this.editTarget()?.metadata?.['dc.description']?.[0]?.value ?? '',
  );
  readonly editTargetEntityType = computed(
    () => this.editTarget()?.metadata?.['dspace.entity.type']?.[0]?.value ?? '',
  );
  readonly editTargetNavLocation = computed(
    () => this.editTarget()?.metadata?.['digeex.navLocation']?.[0]?.value ?? '',
  );
  /** Orden en el menú; convención DIGEEX guarda este número en dc.identifier.other. */
  readonly editTargetOrden = computed(
    () => this.editTarget()?.metadata?.['dc.identifier.other']?.[0]?.value ?? '',
  );

  /** Atajo de delete: el template pasa el target, el sufijo se deriva. */
  onDeleteClick(target: Collection): void {
    const sub = this.selectedSubdireccion();
    if (!sub) return;
    this.handleDelete(target, this.extractSufijo(sub));
  }

  handleCreateSubmit(payload: ProgramaFormPayload): void {
    const sub = this.selectedSubdireccion();
    if (!sub) return;
    const sufijo = this.extractSufijo(sub);
    const metadata: CollectionCreateBody['metadata'] = {
      'dc.title': [
        { value: payload.titulo, language: null, authority: null, confidence: -1, place: 0 },
      ],
      'dc.title.alternative': [
        { value: payload.siglas, language: null, authority: null, confidence: -1, place: 0 },
      ],
      'dspace.entity.type': [
        { value: payload.entityType, language: null, authority: null, confidence: -1, place: 0 },
      ],
      'digeex.navLocation': [
        { value: payload.navLocation, language: null, authority: null, confidence: -1, place: 0 },
      ],
      'dc.identifier.other': [
        { value: payload.orden, language: null, authority: null, confidence: -1, place: 0 },
      ],
    };
    if (payload.description?.trim()) {
      metadata['dc.description'] = [
        { value: payload.description, language: null, authority: null, confidence: -1, place: 0 },
      ];
    }
    const body: CollectionCreateBody = {
      name: payload.siglas,
      type: 'collection',
      metadata,
    };
    this.facade.createColeccion$(sub.uuid, body, sufijo, payload.coverFile ?? undefined).subscribe({
      next: () => {
        this.closeDialog();
        this.refreshCollections();
        this.toast.add({ severity: 'success', summary: 'Programa creado' });
      },
      error: (err) => this.toastError(err, 'No se pudo crear el programa'),
    });
  }

  handleEditSubmit(payload: ProgramaFormPayload): void {
    const target = this.editTarget();
    const sub = this.selectedSubdireccion();
    if (!target || !sub) return;
    const sufijo = this.extractSufijo(sub);
    // dspace.entity.type y siglas (name) son inmutables después de
    // crear: el primero rompe el routing del frontend, el segundo
    // rompe los SAFs y URLs externas. Solo se patchean título completo,
    // descripción y ubicación menú.
    const patch: JsonPatchEntry[] = [
      { op: 'replace', path: '/metadata/dc.title/0/value', value: payload.titulo },
      {
        op: 'add',
        path: '/metadata/dc.description',
        value: [
          { value: payload.description ?? '', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      {
        op: 'add',
        path: '/metadata/digeex.navLocation',
        value: [
          { value: payload.navLocation, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      {
        op: 'add',
        path: '/metadata/dc.identifier.other',
        value: [
          { value: payload.orden, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    ];
    this.facade.updateColeccion$(target.uuid, patch, sufijo).subscribe({
      next: () => {
        if (payload.coverFile) {
          // El patch ya quedó aplicado: si el logo falla, mostramos toast
          // parcial y dejamos el metadata. Acá no hay rollback razonable.
          this.facade
            .replaceLogo$(target.uuid, payload.coverFile, sufijo)
            .subscribe({
              next: () => {
                this.closeDialog();
                this.refreshCollections();
                this.toast.add({ severity: 'success', summary: 'Programa actualizado' });
              },
              error: (err) => {
                this.closeDialog();
                this.refreshCollections();
                this.toast.add({
                  severity: 'warn',
                  summary: 'Programa actualizado, pero el logo falló',
                  detail: err instanceof Error ? err.message : 'Reintentá la subida.',
                });
              },
            });
          return;
        }
        this.closeDialog();
        this.refreshCollections();
        this.toast.add({ severity: 'success', summary: 'Programa actualizado' });
      },
      error: (err) => this.toastError(err, 'No se pudo actualizar el programa'),
    });
  }

  handleDelete(target: Collection, sufijo: string): void {
    this.confirmation.confirm({
      message: `¿Eliminar el programa "${target.name}"? Esta acción borra también sus items y bitstreams asociados.`,
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
        this.facade.deleteColeccion$(target.uuid, sufijo).subscribe({
          next: () => {
            this.refreshCollections();
            this.toast.add({ severity: 'success', summary: 'Programa eliminado' });
          },
          error: (err) => this.toastError(err, 'No se pudo eliminar el programa'),
        });
      },
    });
  }

  private refreshCollections(): void {
    const sub = this.selectedSubdireccion();
    if (sub) {
      this.selectSubdireccion(sub);
    }
  }

  private toastError(err: unknown, fallback: string): void {
    const detail = err instanceof Error ? err.message : fallback;
    this.toast.add({ severity: 'error', summary: 'Error', detail });
  }

  /** SuperAdmin puede elegir cualquier subdirección; el resto va atado a su sufijo. */
  readonly canChooseAnySubdireccion = computed(
    () => this.caller()?.role === 'superadmin',
  );

  constructor() {
    this.loadSubdirecciones$().subscribe({
      next: (subs) => {
        this.subdirecciones.set(subs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    // Auto-selecciona la subdirección del caller cuando NO es superadmin
    // (admin_subdireccion y personal_delegado quedan fijados a su sufijo via
    // findCallerSub). El effect espera a que ambos signals (subs y caller)
    // estén listos. untracked previene loop entre el effect y la escritura
    // de selectedSubdireccion via selectSubdireccion.
    effect(() => {
      const subs = this.subdirecciones();
      const c = this.caller();
      if (subs.length === 0 || !c) {
        return;
      }
      untracked(() => {
        if (this.selectedSubdireccion()) return;
        const matching = findCallerSub(subs, c);
        if (matching) {
          this.selectSubdireccion(matching);
        }
      });
    });
  }

  private loadSubdirecciones$(): Observable<Community[]> {
    return this.communityApi.searchTop(0, 1).pipe(
      switchMap((resp) => {
        const root = resp._embedded?.['communities']?.[0];
        this.rootUuid.set(root?.uuid ?? null);
        if (!root) {
          return of([] as Community[]);
        }
        return this.communityApi.listSubcommunities(root.uuid, 0, 100).pipe(
          map((listResp) => {
            const embedded = listResp._embedded ?? {};
            return (
              (embedded as Record<string, Community[]>)['subcommunities']
              ?? (embedded as Record<string, Community[]>)['communities']
              ?? []
            );
          }),
        );
      }),
    );
  }
}
