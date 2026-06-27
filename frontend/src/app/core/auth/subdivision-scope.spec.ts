import { isSameSubdireccion } from './subdivision-scope';

/**
 * Tests de `isSameSubdireccion`.
 *
 * Predicado puro de scope por subdirección: el recurso pertenece a la sub del
 * caller cuando ambos sufijos coinciden y el del recurso no es nulo (fail-closed).
 * Lo comparten la spec de scope de contenido (`MatchingSufijoSpec`) y la
 * validación de usuarios; superadmin y top-level se resuelven antes, en cada
 * consumidor.
 *
 * Ciclo 28 TDD — Sprint 10.
 */
describe('isSameSubdireccion', () => {
  /** Verifica que dos sufijos iguales caigan en la misma subdirección. */
  it('should return true when caller and target sufijo match', () => {
    expect(isSameSubdireccion('ED_BASICA', 'ED_BASICA')).toBe(true);
  });

  /** Verifica que sufijos distintos no caigan en la misma subdirección. */
  it('should return false when the sufijos differ', () => {
    expect(isSameSubdireccion('ED_BASICA', 'ED_TRABAJO')).toBe(false);
  });

  /** Verifica que un sufijo de recurso nulo nunca caiga en scope (fail-closed). */
  it('should return false when the target sufijo is null', () => {
    expect(isSameSubdireccion('ED_BASICA', null)).toBe(false);
  });

  /** Verifica que un caller sin sufijo no caiga en scope. */
  it('should return false when the caller sufijo is null', () => {
    expect(isSameSubdireccion(null, 'ED_BASICA')).toBe(false);
  });

  /** Verifica que ambos nulos no caigan en scope (fail-closed). */
  it('should return false when both sufijos are null', () => {
    expect(isSameSubdireccion(null, null)).toBe(false);
  });
});
