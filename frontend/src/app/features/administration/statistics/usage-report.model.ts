/**
 * Tipo de reporte que expone el módulo Solr Statistics de DSpace 9 vía
 * `/api/statistics/usagereports/{dsoUuid}_{reportType}`. Los cinco tipos
 * están hardcodeados en `UsageReportUtils.java` del backend; pedir cualquier
 * otro nombre devuelve `ResourceNotFoundException`.
 *
 * @see https://github.com/DSpace/DSpace/blob/main/dspace-server-webapp/src/main/java/org/dspace/app/rest/utils/UsageReportUtils.java
 */
export type UsageReportType =
  | 'TotalVisits'
  | 'TotalVisitsPerMonth'
  | 'TotalDownloads'
  | 'TopCountries'
  | 'TopCities';

/**
 * Tipo de DSO al que se le pueden pedir reportes. Determina qué subconjunto
 * de `UsageReportType` aplica vía la constante `REPORTS_BY_DSO_TYPE`.
 */
export type UsageReportDsoType = 'site' | 'item' | 'collection';

/**
 * Una entrada del reporte: nombre legible (`label`) y un único campo de
 * valor (`views` para los cuatro reportes de visualización, `downloads`
 * para `TotalDownloads`). El backend nunca emite ambos en la misma entrada.
 */
export interface UsageReportPoint {
  id: string;
  label: string;
  values: Partial<{ views: number; downloads: number }>;
}

/**
 * Respuesta del endpoint `/api/statistics/usagereports/{dsoUuid}_{reportType}`.
 * El `id` viene como `"{uuid}_{reportType}"` para identificar el report
 * unívocamente; `points` puede ser vacío cuando no hay tráfico capturado.
 */
export interface UsageReport {
  id: string;
  reportType: UsageReportType;
  points: UsageReportPoint[];
}

/**
 * Matriz de reportes por tipo de DSO. El endpoint nativo soporta cinco
 * tipos sobre Item, cuatro sobre Collection (sin `TotalDownloads`) y solo
 * `TotalVisits` global sobre Site. `Community` se omite porque el portal
 * público no expone subdirecciones. `TopCountries` y `TopCities` quedan
 * fuera del scope de DIGEEX: dependen de GeoLite2 sobre la IP y la
 * audiencia concentrada en Guatemala vuelve el agregado por país poco
 * útil. Sumar un report nuevo es agregar la entrada al arreglo (OCP).
 */
export const REPORTS_BY_DSO_TYPE: Readonly<Record<UsageReportDsoType, readonly UsageReportType[]>> = {
  site: ['TotalVisits'],
  // Orden de render: las tablas compactas primero (en dos columnas lado a
  // lado en desktop), el chart de PerMonth al final con col-span-2 para que
  // ocupe el ancho completo abajo sin dejar huecos.
  item: ['TotalVisits', 'TotalDownloads', 'TotalVisitsPerMonth'],
  collection: ['TotalVisits', 'TotalVisitsPerMonth'],
};

/**
 * Etiqueta humana de cada `UsageReportType` para el render del título de la
 * tarjeta. El componente presentacional la consume sin conocer los tipos
 * concretos para mantener su responsabilidad de pintar.
 */
export const REPORT_LABELS: Readonly<Record<UsageReportType, string>> = {
  TotalVisits: 'Total de visitas',
  TotalVisitsPerMonth: 'Visitas por mes',
  TotalDownloads: 'Descargas',
  TopCountries: 'Top países',
  TopCities: 'Top ciudades',
};
