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

import { DiscoveryService } from '../../../../../core/api/discovery.service';
import { Facet, FacetValue, SearchResult } from '../../../../../core/api/models/discovery.model';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';

/**
 * Fila del widget. El `uuid` viene del `authorityKey` del facet; entries
 * sin `authorityKey` (facets sobre metadata pura) se filtran fuera.
 */
export interface TopListEntry {
  readonly uuid: string;
  readonly label: string;
  readonly count: number;
}

/**
 * Tarjeta con el top N de un facet cuyas values son DSO. Consume `search()`,
 * ordena el facet por count desc y renderiza filas clickeables que emiten
 * `entryClicked` (la navegación la decide el padre). Cuatro estados: spinner,
 * lista, empty cuando la facet no aparece, `—` ante error.
 */
@Component({
  selector: 'app-top-list-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule, LoadingSpinnerComponent],
  templateUrl: './top-list-card.html',
})
export class TopListCard {
  private readonly discovery = inject(DiscoveryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly scope = input.required<string | null>();
  readonly label = input.required<string>();
  readonly facetName = input<string>('collection');
  readonly limit = input<number>(10);

  readonly entryClicked = output<TopListEntry>();

  private readonly result = signal<SearchResult | null | undefined>(undefined);

  readonly loading = computed(() => this.result() === undefined);
  readonly failed = computed(() => this.result() === null);

  private readonly facet = computed<Facet | null>(() => {
    const r = this.result();
    if (!r) return null;
    return r.facets.find((f) => f.name === this.facetName()) ?? null;
  });

  readonly isEmpty = computed(() => !this.loading() && !this.failed() && this.facet() === null);

  readonly entries = computed<TopListEntry[]>(() => {
    const f = this.facet();
    if (!f) return [];
    return [...f.values]
      .filter((v: FacetValue) => v.authorityKey !== undefined)
      .sort((a, b) => b.count - a.count)
      .slice(0, this.limit())
      .map((v) => ({ uuid: v.authorityKey as string, label: v.label, count: v.count }));
  });

  constructor() {
    effect(() => {
      const scope = this.scope() ?? undefined;
      this.facetName();
      this.result.set(undefined);
      this.discovery
        .search({ size: 0, scope })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (r) => this.result.set(r),
          error: () => this.result.set(null),
        });
    });
  }

  onEntryClick(entry: TopListEntry): void {
    this.entryClicked.emit(entry);
  }
}
