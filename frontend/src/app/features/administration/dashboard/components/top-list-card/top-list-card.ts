import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { Observable, map } from 'rxjs';

import { CollectionApiService } from '../../../../../core/api/collection-api.service';
import { Collection } from '../../../../../core/api/models/collection.model';
import { EmptyState } from '../../../../../shared/components/empty-state/empty-state';
import { LoadingSpinner } from '../../../../../shared/components/loading-spinner/loading-spinner';

/**
 * Fila del widget: `uuid` y `label` salen de Collection; `count` es
 * `archivedItemsCount` (requiere `webui.strengths.show=true` en backend).
 */
export interface TopListEntry {
  readonly uuid: string;
  readonly label: string;
  readonly count: number;
}

/**
 * Ranking de las N colecciones con más items del scope (community UUID
 * o repo entero si `scope=null`). Lee `archivedItemsCount` del listing;
 * cuatro estados: spinner, lista, empty, `—` ante error. Ver ADR-01.
 */
@Component({
  selector: 'app-top-list-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule, LoadingSpinner, EmptyState],
  host: { class: 'block h-full' },
  templateUrl: './top-list-card.html',
})
export class TopListCard {
  private readonly collectionApi = inject(CollectionApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input.required<string | null>();
  readonly label = input.required<string>();
  readonly limit = input<number>(10);

  readonly entryClicked = output<TopListEntry>();

  // `undefined` → cargando; `null` → fallo del listing; arreglo → datos listos
  // (puede estar vacío cuando el scope no tiene colecciones).
  private readonly result = signal<TopListEntry[] | null | undefined>(undefined);

  readonly loading = computed(() => this.result() === undefined);
  readonly failed = computed(() => this.result() === null);
  readonly isEmpty = computed(() => {
    const r = this.result();
    return Array.isArray(r) && r.length === 0;
  });

  readonly entries = computed<TopListEntry[]>(() => {
    const r = this.result();
    if (!Array.isArray(r)) return [];
    return [...r].sort((a, b) => b.count - a.count).slice(0, this.limit());
  });

  constructor() {
    effect(() => {
      const scope = this.scope();
      this.result.set(undefined);
      this.listCollections$(scope)
        .pipe(
          map((colls) =>
            colls.map(
              (coll): TopListEntry => ({
                uuid: coll.uuid,
                label: coll.name,
                // `archivedItemsCount` puede venir como -1 si por alguna razón
                // `webui.strengths.show` está apagado en el backend. Defensivo:
                // tratar negativos como 0 para que el ranking no se ensucie.
                count: Math.max(0, coll.archivedItemsCount ?? 0),
              }),
            ),
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (entries) => this.result.set(entries),
          error: () => this.result.set(null),
        });
    });
  }

  /**
   * Trae todas las colecciones del scope vía `listAll`/`listAllByCommunity`.
   * El ranking se hace en JS porque DSpace 9.x no sortea server-side por
   * `archivedItemsCount` (no es campo metadata indexable).
   */
  private listCollections$(scope: string | null): Observable<Collection[]> {
    return scope
      ? this.collectionApi.listAllByCommunity(scope)
      : this.collectionApi.listAll();
  }

  onEntryClick(entry: TopListEntry): void {
    this.entryClicked.emit(entry);
  }
}
