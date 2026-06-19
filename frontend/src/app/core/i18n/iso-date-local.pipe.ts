import { Pipe, PipeTransform, inject, LOCALE_ID } from '@angular/core';
import { formatDate } from '@angular/common';

import { parseIsoDateLocal } from './iso-date.util';

/**
 * Formatea un string ISO date-only (`YYYY-MM-DD`) interpretándolo como
 * fecha local. Sin argumento usa `dd/MM/yyyy` (formato estándar del proyecto,
 * año de 4 dígitos): es la fuente única del formato de fecha, cambiarlo acá lo
 * cambia en todos los usos. Acepta cualquier formato que `formatDate` de
 * Angular soporte (`shortDate`, `longDate`, etc.) y deja pasar un `Date` sin
 * transformarlo. Un valor de solo año (`YYYY`) se devuelve tal cual: no tiene
 * mes/día, y pasarlo por `Date` lo interpretaría como UTC y mostraría el año
 * anterior en zonas negativas como GT.
 *
 * Uso: `{{ value | isoDateLocal }}` (estándar) o `{{ value | isoDateLocal: 'longDate' }}`.
 */
@Pipe({ name: 'isoDateLocal', standalone: true })
export class IsoDateLocalPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(
    value: Date | string | null | undefined,
    format: string = 'dd/MM/yyyy',
  ): string {
    if (value == null || value === '') return '';
    if (typeof value === 'string' && /^\d{4}$/.test(value)) return value;
    const date = value instanceof Date ? value : parseIsoDateLocal(value);
    if (!date) return '';
    return formatDate(date, format, this.locale);
  }
}
