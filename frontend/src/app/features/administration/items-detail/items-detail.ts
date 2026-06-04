import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { CardModule } from 'primeng/card';

import { ItemApiService } from '../../../core/api/item-api.service';
import { Item } from '../../../core/api/models/item.model';
import { ProvenanceService } from '../../../core/services/provenance.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ProvenanceTimeline } from '../../../shared/components/provenance-timeline/provenance-timeline';

/**
 * Pantalla detail administrativa de item. Orquesta el fetch del recurso,
 * expone el metadata principal (título, autor, tipo) en un `<p-card>` y monta
 * `<app-provenance-timeline>` con las entradas derivadas. Tri-state explícito
 * (pending / resuelto / fallo).
 */
@Component({
  selector: 'app-items-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, LoadingSpinnerComponent, ProvenanceTimeline],
  templateUrl: './items-detail.html',
})
export class ItemsDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ItemApiService);
  private readonly provenance = inject(ProvenanceService);
  private readonly breadcrumb = inject(BreadcrumbService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly itemUuid = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('itemUuid') ?? '')),
    { initialValue: '' },
  );

  /**
   * Estado tri-state del recurso. `undefined` mientras pending, `Item`
   * cuando resuelve, `null` cuando el observable falla.
   */
  readonly item = signal<Item | null | undefined>(undefined);

  readonly loading = computed(() => this.item() === undefined);
  readonly failed = computed(() => this.item() === null);

  readonly title = computed(() => {
    const i = this.item();
    return i ? (i.metadata['dc.title']?.[0]?.value ?? i.name) : '';
  });

  readonly author = computed(() => {
    const i = this.item();
    return i ? (i.metadata['dc.contributor.author']?.[0]?.value ?? '') : '';
  });

  readonly entityType = computed(() => {
    const i = this.item();
    return i ? (i.metadata['dspace.entity.type']?.[0]?.value ?? '') : '';
  });

  readonly provenanceEntries = computed(() =>
    this.provenance.extractFrom(this.item()?.metadata ?? {}),
  );

  constructor() {
    effect(() => {
      const uuid = this.itemUuid();
      if (!uuid) return;
      this.item.set(undefined);
      this.api
        .getOne(uuid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (i) => this.item.set(i),
          error: () => this.item.set(null),
        });
    });

    effect(() => {
      const it = this.item();
      if (!it) return;
      this.breadcrumb.setTrail([
        { label: 'Programas', routerLink: ['/administrador/programas'] },
        { label: it.metadata['dc.title']?.[0]?.value ?? it.name },
      ]);
    });
  }
}
