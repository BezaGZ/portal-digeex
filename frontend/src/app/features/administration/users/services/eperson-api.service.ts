import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EPerson, Paginated } from '../models/eperson.model';

/**
 * Wrapper HTTP del recurso /api/eperson/epersons de DSpace.
 * Solo habla con el backend: no aplica reglas de negocio ni mapea a modelos de UI.
 *
 * Stub RED — Ciclo 5 TDD — Sprint 5.
 * Las implementaciones reales llegan en la fase GREEN.
 */
@Injectable({ providedIn: 'root' })
export class EPersonApiService {
  /**
   * Lista epersons paginados desde DSpace.
   * @param params Paginación (size y page, 0-indexed).
   */
  list(_params: { size?: number; page?: number } = {}): Observable<Paginated<EPerson>> {
    throw new Error('EPersonApiService.list() no implementado todavía (fase RED)');
  }
}
