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

import { CollectionApiService } from '../../../core/api/collection-api.service';
import { Collection } from '../../../core/api/models/collection.model';
import { ProvenanceService } from '../content/provenance/provenance.service';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ProvenanceTimeline } from '../content/provenance/timeline/provenance-timeline';

/**
 * Pantalla detail administrativa de programa. Orquesta el fetch de la colección
 * con embed del logo, expone el metadata principal en un `<p-card>` y monta
 * `<app-provenance-timeline>` con las entradas derivadas. Tri-state explícito
 * (pending / resuelto / fallo).
 */
@Component({
  selector: 'app-programas-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, LoadingSpinnerComponent, ProvenanceTimeline],
  templateUrl: './programas-detail.html',
})
export class ProgramasDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CollectionApiService);
  private readonly provenance = inject(ProvenanceService);
  private readonly breadcrumb = inject(BreadcrumbService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly uuid = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('uuid') ?? '')),
    { initialValue: '' },
  );

  /**
   * Estado tri-state del recurso. `undefined` mientras pending, `Collection`
   * cuando resuelve, `null` cuando el observable falla.
   */
  readonly collection = signal<Collection | null | undefined>(undefined);

  readonly loading = computed(() => this.collection() === undefined);
  readonly failed = computed(() => this.collection() === null);

  readonly title = computed(() => {
    const c = this.collection();
    return c ? (c.metadata['dc.title']?.[0]?.value ?? c.name) : '';
  });

  readonly sigla = computed(() => {
    const c = this.collection();
    return c ? (c.metadata['dc.title.alternative']?.[0]?.value ?? '') : '';
  });

  readonly description = computed(() => {
    const c = this.collection();
    return c ? (c.metadata['dc.description']?.[0]?.value ?? '') : '';
  });

  readonly logoUrl = computed(() => {
    const logoUuid = this.collection()?._embedded?.logo?.uuid;
    return logoUuid ? `/server/api/core/bitstreams/${logoUuid}/content` : '';
  });

  readonly provenanceEntries = computed(() =>
    this.provenance.extractFrom(this.collection()?.metadata ?? {}),
  );

  constructor() {
    effect(() => {
      const uuid = this.uuid();
      if (!uuid) return;
      this.collection.set(undefined);
      this.api
        .getOne(uuid, { embed: 'logo' })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (c) => this.collection.set(c),
          error: () => this.collection.set(null),
        });
    });

    effect(() => {
      const coll = this.collection();
      if (!coll) return;
      this.breadcrumb.setTrail([
        { label: 'Programas', routerLink: ['/administrador/programas'] },
        { label: coll.metadata['dc.title']?.[0]?.value ?? coll.name },
      ]);
    });
  }
}
