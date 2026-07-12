import { mapFeaturesToRole } from './role-features';

/**
 * Tests de `mapFeaturesToRole`.
 *
 * Candado de fidelidad del rol por features: las combinaciones que devuelve el
 * backend para cada rol (features de Site de `/api/authz/authorizations/search/object`,
 * verificadas contra el backend local el 2026-07-11) deben producir las mismas
 * etiquetas que hoy deriva el nombre de grupo. La precedencia importa porque
 * las features se solapan: el superadmin da verdadero en las cuatro.
 *
 * Ciclo 2 TDD — Sprint 11.
 */
describe('mapFeaturesToRole', () => {
  /** Verifica que la fila real del superadmin gane por precedencia pese a dar true en todo. */
  it('should map the full-true feature row to superadmin (administratorOf wins by precedence)', () => {
    expect(
      mapFeaturesToRole({
        administratorOf: true,
        isCommunityAdmin: true,
        isCollectionAdmin: true,
        canSubmit: true,
      }),
    ).toBe('superadmin');
  });

  /** Verifica que la fila real del admin_sub resuelva admin_subdireccion. */
  it('should map the community-admin row to admin_subdireccion', () => {
    expect(
      mapFeaturesToRole({
        administratorOf: false,
        isCommunityAdmin: true,
        isCollectionAdmin: true,
        canSubmit: true,
      }),
    ).toBe('admin_subdireccion');
  });

  /** Verifica que la fila real del delegado resuelva personal_delegado. */
  it('should map the collection-level row to personal_delegado', () => {
    expect(
      mapFeaturesToRole({
        administratorOf: false,
        isCommunityAdmin: false,
        isCollectionAdmin: true,
        canSubmit: true,
      }),
    ).toBe('personal_delegado');
  });

  /** Verifica el "o" del delegado: canSubmit sola basta, sin isCollectionAdmin. */
  it('should map canSubmit alone to personal_delegado', () => {
    expect(
      mapFeaturesToRole({
        administratorOf: false,
        isCommunityAdmin: false,
        isCollectionAdmin: false,
        canSubmit: true,
      }),
    ).toBe('personal_delegado');
  });

  /** Verifica que sin ninguna feature el rol sea null (flujo huérfano vigente). */
  it('should map the all-false row to null (orphan account)', () => {
    expect(
      mapFeaturesToRole({
        administratorOf: false,
        isCommunityAdmin: false,
        isCollectionAdmin: false,
        canSubmit: false,
      }),
    ).toBe(null);
  });
});
