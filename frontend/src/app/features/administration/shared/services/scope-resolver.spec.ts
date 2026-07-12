import { findCallerSub } from './scope-resolver';
import { Community } from '../../../../core/api/models/community.model';

/**
 * Tests del resolver de scope.
 *
 * Función pura compartida por las pantallas del admin que derivan la sub del
 * caller (Programas, Cargar contenido, dashboard, Recursos). Matchea por el
 * uuid que el backend afirmó (`caller.scopeUuid`); sin scope resuelto no hay
 * sub (fail-closed) y los nombres de grupo no participan.
 *
 * Ciclo 20 TDD — Sprint 6. Ajustado en Ciclos 4 y 6 (Sprint 11).
 */
describe('findCallerSub', () => {
  function buildSub(uuid: string, nombre: string): Community {
    return {
      uuid,
      name: nombre,
      handle: `123/${uuid}`,
      archivedItemsCount: 0,
      type: 'community',
      metadata: {},
    };
  }

  const subs: Community[] = [
    buildSub('uuid-basica', 'Educación Básica'),
    buildSub('uuid-trabajo', 'Trabajo y Cultura'),
    buildSub('uuid-investigacion', 'Investigación'),
  ];

  /** Verifica que el superadmin resuelva null: no está acotado, elige libre. */
  it('should return null for a superadmin caller (not scoped)', () => {
    const result = findCallerSub(subs, { role: 'superadmin', scopeUuid: null });
    expect(result).toBeNull();
  });

  /** Verifica el matching por el uuid afirmado para admin_subdireccion. */
  it('should return the matching sub for an admin_subdireccion by scopeUuid', () => {
    const result = findCallerSub(subs, {
      role: 'admin_subdireccion',
      scopeUuid: 'uuid-basica',
    });
    expect(result?.uuid).toBe('uuid-basica');
  });

  /** Verifica el mismo modelo de scope para personal_delegado. */
  it('should return the matching sub for a personal_delegado by scopeUuid', () => {
    const result = findCallerSub(subs, {
      role: 'personal_delegado',
      scopeUuid: 'uuid-trabajo',
    });
    expect(result?.uuid).toBe('uuid-trabajo');
  });

  /** Verifica que un scope que no está en la lista resuelva null (fail-closed). */
  it('should return null when the scopeUuid does not match any sub', () => {
    const result = findCallerSub(subs, {
      role: 'admin_subdireccion',
      scopeUuid: 'uuid-inexistente',
    });
    expect(result).toBeNull();
  });

  /** Verifica que sin scope del backend resuelva null aunque haya subs disponibles. */
  it('should return null when the backend resolved no scope', () => {
    const result = findCallerSub(subs, {
      role: 'admin_subdireccion',
      scopeUuid: null,
    });
    expect(result).toBeNull();
  });

  /** Verifica que sin caller (logout o carga inicial) resuelva null. */
  it('should return null when caller is null', () => {
    const result = findCallerSub(subs, null);
    expect(result).toBeNull();
  });
});
