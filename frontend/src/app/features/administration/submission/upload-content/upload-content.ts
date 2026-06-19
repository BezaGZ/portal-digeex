import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { Community } from '../../../../core/api/models/community.model';
import { Collection } from '../../../../core/api/models/collection.model';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { findCallerSub } from '../../shared/services/scope-resolver';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

/** Subdirección + sus programas; lo que la pantalla agrupa por bloque para listar. */
export interface SubdireccionWithPrograms {
  sub: Community;
  programs: Collection[];
}

/**
 * Pantalla "Cargar contenido". Lista las subdirecciones que el caller puede
 * tocar y, dentro de cada una, los programas donde puede subir items. El
 * SuperAdmin ve las tres subs; admin_subdireccion y personal_delegado ven
 * sólo la suya. Cada programa abre la ruta de submission con su UUID.
 */
@Component({
  selector: 'app-upload-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upload-content.html',
  imports: [LoadingSpinnerComponent],
})
export class UploadContent {
  private readonly communityApi = inject(CommunityApiService);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly router = inject(Router);

  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  private readonly allGroups = signal<SubdireccionWithPrograms[]>([]);

  /** Loading mientras la cascada de fetch resuelve; el template lo bindea al spinner. */
  readonly loading = signal<boolean>(true);

  /** Grupos visibles según el rol del caller; SuperAdmin ve todos, los otros sólo el suyo. */
  readonly groups = computed(() => {
    const all = this.allGroups();
    const c = this.caller();
    if (!c || c.role === 'superadmin') return all;
    const matchSub = findCallerSub(all.map((g) => g.sub), c);
    if (!matchSub) return [];
    return all.filter((g) => g.sub.uuid === matchSub.uuid);
  });

  /** True cuando ya cargó la API y el caller no tiene ninguna sub asignada para subir. */
  readonly hasNothingToShow = computed(
    () => !this.loading() && this.groups().length === 0,
  );

  constructor() {
    this.loadAllGroups$().subscribe({
      next: (g) => {
        this.allGroups.set(g);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Navega al host de submission con la colección elegida; el host monta el form por entity-type. */
  openSubmission(program: Collection): void {
    this.router.navigate(['/administrador/programas', program.uuid, 'cargar']);
  }

  /**
   * searchTop → esqueleto de subdirecciones (todas) + una sola carga de
   * colecciones con su comunidad padre embebida, agrupadas por sub en el
   * cliente. Sin petición por subdirección y sin tope de página, que truncaba
   * las subdirecciones o los programas pasados los 100. No se filtra por
   * entity-type: se sube a programas Documento, Galería y Estadística.
   */
  private loadAllGroups$(): Observable<SubdireccionWithPrograms[]> {
    return this.communityApi.searchTop(0, 1).pipe(
      switchMap((rootResp) => {
        const root = rootResp._embedded?.['communities']?.[0];
        if (!root) return of([] as SubdireccionWithPrograms[]);
        return forkJoin({
          subs: this.communityApi.listAllSubcommunities(root.uuid),
          collections: this.collectionApi.listAll({ embed: 'parentCommunity' }),
        }).pipe(
          map(({ subs, collections }) => {
            const byParent = new Map<string, Collection[]>();
            for (const col of collections) {
              const parentUuid = col._embedded?.parentCommunity?.uuid;
              if (!parentUuid) continue;
              const group = byParent.get(parentUuid) ?? [];
              group.push(col);
              byParent.set(parentUuid, group);
            }
            return subs.map((sub) => ({ sub, programs: byParent.get(sub.uuid) ?? [] }));
          }),
        );
      }),
    );
  }
}
