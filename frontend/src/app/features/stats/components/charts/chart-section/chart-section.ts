import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ChartSection } from '../../../models/stats-dashboard.model';
import { KpiCardComponent } from '../kpi-card/kpi-card';
import { PieChartComponent } from '../pie-chart/pie-chart';
import { BarChartComponent } from '../bar-chart/bar-chart';
import { HorizontalBarChartComponent } from '../horizontal-bar-chart/horizontal-bar-chart';
import { ListChartComponent } from '../list-chart/list-chart';
import { TagsChartComponent } from '../tags-chart/tags-chart';
import { HistogramChartComponent } from '../histogram-chart/histogram-chart';
import { TreemapChartComponent } from '../treemap-chart/treemap-chart';
import { MapChartComponent } from '../map-chart/map-chart';

/**
 * Renderiza una sección del dashboard como una `<p-card>` con título y todas
 * sus gráficas. Despacha cada `ChartConfig` al componente concreto según
 * `type`. Los KPIs van en una fila densa (varias columnas), el resto se
 * apila vertical.
 */
@Component({
  selector: 'app-chart-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    KpiCardComponent,
    PieChartComponent,
    BarChartComponent,
    HorizontalBarChartComponent,
    ListChartComponent,
    TagsChartComponent,
    HistogramChartComponent,
    TreemapChartComponent,
    MapChartComponent,
  ],
  templateUrl: './chart-section.html',
  host: {
    class: 'block',
    '[class.md:col-span-2]': 'isWide()',
  },
})
export class ChartSectionComponent {
  private readonly _section = signal<ChartSection | null>(null);

  @Input({ required: true })
  set section(value: ChartSection) {
    this._section.set(value);
  }

  readonly title = computed(() => this._section()?.title ?? '');
  readonly charts = computed(() => this._section()?.charts ?? []);
  readonly isKpiSection = computed(() =>
    this.charts().length > 0 && this.charts().every((c) => c.type === 'kpi'),
  );
  /** True cuando el renderer declaró `widthHint: 'wide'` para esta sección. */
  readonly isWide = computed(() => this._section()?.widthHint === 'wide');
  /** True cuando hay un chart `map`; suprime `justify-center` para no dejar aire muerto. */
  readonly isMapSection = computed(() => this.charts().some((c) => c.type === 'map'));
}
