/**
 * Etiquetas en español para las acciones del provenance que el parser
 * normaliza desde DSpace y desde `AuditTrailService`. El backend persiste
 * las cadenas en inglés (campo `dc.description.provenance` es nativo de
 * DSpace); la UI las traduce al renderizar.
 *
 * Fuente única para los consumidores del dominio provenance: el componente
 * `<app-provenance-timeline>` los usa al render, y `history-pdf-builder` los
 * usa al armar la columna Acción del PDF y al traducir el patrón inglés
 * `"{Action} by X on Y"` a su equivalente español. Sumar una acción nueva
 * acá la habilita en ambos consumidores sin tocar más código.
 */
export const PROVENANCE_ACTION_LABELS: Readonly<Record<string, string>> = {
  Submitted: 'Subido',
  'Made available': 'Publicado',
  Created: 'Creado',
  Edited: 'Editado',
  Withdrawn: 'Retirado',
  Reinstated: 'Restaurado',
};

/**
 * Frases inglesas comunes que DSpace embebe en el texto crudo del
 * `dc.description.provenance` (cabecera de bitstreams, checksums, fecha
 * previa de publicación). Se reemplazan literalmente en el orden declarado
 * para que el PDF y futuros lectores muestren el detalle en español sin
 * perder la estructura informativa que el auditor espera ver.
 */
export const PROVENANCE_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['Made available in DSpace on', 'Publicado en DSpace el'],
  ['No. of bitstreams', 'N° de archivos'],
  ['Previous issue date', 'Fecha de publicación anterior'],
  ['bytes, checksum:', 'bytes, suma de verificación:'],
  ['(GMT)', ''],
];
