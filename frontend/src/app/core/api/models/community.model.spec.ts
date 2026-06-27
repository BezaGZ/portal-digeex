import { Community, sufijoOf } from './community.model';

/**
 * Tests de `sufijoOf`.
 *
 * Lectura única del metadato `digeex.sufijo` de una community; `null` cuando el
 * campo no está. La consumen las pantallas del admin (`extractSufijo`) y
 * `findCallerSub`.
 *
 * Ciclo 29 TDD — Sprint 10.
 */
describe('sufijoOf', () => {
  function build(sufijo?: string): Community {
    return {
      uuid: 'u',
      name: 'n',
      handle: 'h',
      archivedItemsCount: 0,
      type: 'community',
      metadata:
        sufijo !== undefined
          ? { 'digeex.sufijo': [{ value: sufijo, language: null, authority: null, confidence: -1, place: 0 }] }
          : {},
    };
  }

  /** Verifica que devuelva el valor de digeex.sufijo cuando está presente. */
  it('should return the digeex.sufijo metadata value when present', () => {
    expect(sufijoOf(build('ED_BASICA'))).toBe('ED_BASICA');
  });

  /** Verifica que devuelva null cuando el metadato digeex.sufijo no está. */
  it('should return null when the digeex.sufijo metadata is absent', () => {
    expect(sufijoOf(build())).toBeNull();
  });
});
