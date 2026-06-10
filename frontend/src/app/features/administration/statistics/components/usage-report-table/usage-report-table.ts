import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';

import { EmptyStateComponent } from '../../../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../../../shared/components/loading-spinner/loading-spinner.component';
import { UsageReport, UsageReportType, REPORT_LABELS } from '../../../../../core/api/models/usage-report.model';

/**
 * Componente presentacional que renderiza un `UsageReport` como tabla plana.
 * Recibe el report y los flags por input y resuelve loading, empty o
 * populated. El empty state cubre `points` vacío y `points` con todos los
 * valores en cero (un chart de ceros no aporta información).
 */
@Component({
  selector: 'app-usage-report-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardModule, TableModule, DecimalPipe, EmptyStateComponent, LoadingSpinnerComponent],
  templateUrl: './usage-report-table.html',
  host: { class: 'block w-full h-full' },
})
export class UsageReportTable {
  readonly report = input<UsageReport | null>(null);
  readonly loading = input<boolean>(false);
  readonly reportType = input.required<UsageReportType>();

  readonly heading = computed(() => REPORT_LABELS[this.reportType()]);

  readonly hasData = computed(() => {
    const r = this.report();
    if (!r || r.points.length === 0) return false;
    return r.points.some((p) => (p.values.views ?? 0) > 0 || (p.values.downloads ?? 0) > 0);
  });

  /** Devuelve `views` si existe, si no `downloads`, si no 0. */
  valueOf(point: { values: Partial<{ views: number; downloads: number }> }): number {
    return point.values.views ?? point.values.downloads ?? 0;
  }
}
