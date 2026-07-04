import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';
import {
  ChoroplethController,
  GeoFeature,
  ProjectionScale,
  ColorScale,
} from 'chartjs-chart-geo';

/**
 * Registro de los controllers, escalas y plugins de Chart.js que usan los
 * charts de Stats (datalabels, treemap, choropleth). Vive en el feature y no
 * en `app.config.ts` para que chart.js quede fuera del bundle inicial; cada
 * chart component lo importa, garantizando el registro antes del render.
 */
Chart.register(
  ChartDataLabels,
  TreemapController,
  TreemapElement,
  ChoroplethController,
  GeoFeature,
  ProjectionScale,
  ColorScale,
);
