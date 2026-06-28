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
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { CommunityApiService } from '../../../../core/api/community-api.service';
import { Community, sufijoOf } from '../../../../core/api/models/community.model';
import { ProvenanceService } from '../../content/provenance/provenance.service';
import { BreadcrumbService } from '../../../../core/breadcrumb/breadcrumb.service';
import { ExportHistoryButton } from '../../../../shared/components/export-history-button/export-history-button';
import { LoadingSpinner } from '../../../../shared/components/loading-spinner/loading-spinner';
import { EmptyState } from '../../../../shared/components/empty-state/empty-state';
import { ProvenanceTimeline } from '../../content/provenance/timeline/provenance-timeline';

/**
 * Pantalla detail administrativa de subdirección. Orquesta el fetch del recurso,
 * expone el metadata principal en un `<p-card>` y monta `<app-provenance-timeline>`
 * con las entradas derivadas. Tri-state explícito (pending / resuelto / fallo).
 */
@Component({
  selector: 'app-subdirecciones-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, CardModule, LoadingSpinner, EmptyState, ProvenanceTimeline, ExportHistoryButton],
  templateUrl: './subdirecciones-detail.html',
})
export class SubdireccionesDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CommunityApiService);
  private readonly provenance = inject(ProvenanceService);
  private readonly breadcrumb = inject(BreadcrumbService);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  /** Vuelve a la vista anterior en el stack del navegador. */
  goBack(): void {
    this.location.back();
  }

  private readonly uuid = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('uuid') ?? '')),
    { initialValue: '' },
  );

  /**
   * Estado tri-state del recurso. `undefined` mientras pending, `Community`
   * cuando resuelve, `null` cuando el observable falla.
   */
  readonly community = signal<Community | null | undefined>(undefined);

  readonly loading = computed(() => this.community() === undefined);
  readonly failed = computed(() => this.community() === null);

  readonly title = computed(() => {
    const c = this.community();
    return c ? (c.metadata['dc.title']?.[0]?.value ?? c.name) : '';
  });

  readonly sufijo = computed(() => {
    const c = this.community();
    return c ? (sufijoOf(c) ?? '') : '';
  });

  readonly description = computed(() => {
    const c = this.community();
    return c ? (c.metadata['dc.description']?.[0]?.value ?? '') : '';
  });

  readonly provenanceEntries = computed(() =>
    this.provenance.extractFrom(this.community()?.metadata ?? {}),
  );

  constructor() {
    effect(() => {
      const uuid = this.uuid();
      if (!uuid) return;
      this.community.set(undefined);
      this.api
        .getOne(uuid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (c) => this.community.set(c),
          error: () => this.community.set(null),
        });
    });

    effect(() => {
      const sub = this.community();
      if (!sub) return;
      this.breadcrumb.setTrail([
        { label: 'Subdirecciones', routerLink: ['/administrador'] },
        { label: sub.metadata['dc.title']?.[0]?.value ?? sub.name },
        { label: 'Historial' },
      ]);
    });
  }
}
