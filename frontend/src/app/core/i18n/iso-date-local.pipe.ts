import { Pipe, PipeTransform, inject, LOCALE_ID } from '@angular/core';
import { formatDate } from '@angular/common';

import { parseIsoDateLocal } from './iso-date.util';

/**
 * Formatea un string ISO date-only (`YYYY-MM-DD`) interpretándolo como
 * fecha local. Acepta cualquier formato que `formatDate` de Angular soporte
 * (`shortDate`, `longDate`, `dd/MM/yyyy`, etc.) y deja pasar un `Date` sin
 * transformarlo.
 *
 * Uso: `{{ value | isoDateLocal: 'shortDate' }}`.
 */
@Pipe({ name: 'isoDateLocal', standalone: true })
export class IsoDateLocalPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(
    value: Date | string | null | undefined,
    format: string = 'shortDate',
  ): string {
    if (value == null || value === '') return '';
    const date = value instanceof Date ? value : parseIsoDateLocal(value);
    if (!date) return '';
    return formatDate(date, format, this.locale);
  }
}
