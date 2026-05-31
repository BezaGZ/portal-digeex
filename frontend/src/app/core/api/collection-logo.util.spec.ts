import { Collection } from './models/collection.model';
import { extractLogoUrl } from './collection-logo.util';

/**
 * Tests del helper puro `extractLogoUrl`.
 *
 * Lee el bitstream del logo embebido en la collection (proyección `?embed=logo`)
 * y arma una URL relativa lista para `<img src>`. Sin dependencias Angular para
 * mantener al consumidor (home, collection-table) desacoplado del shape HAL.
 *
 * Ciclo 5 TDD — Sprint 8.
 */
describe('extractLogoUrl', () => {
  /** Verifica que devuelva la URL relativa /server/api/core/bitstreams/{uuid}/content cuando el logo viene embebido. */
  it('should return a relative bitstream content URL when the logo is embedded', () => {
    const coll = {
      uuid: 'coll-1',
      name: 'PEAC',
      handle: '123/200',
      metadata: {},
      archivedItemsCount: 0,
      type: 'collection',
      _embedded: {
        logo: {
          uuid: 'bs-logo-1',
          name: 'logo.png',
          handle: null,
          metadata: {},
          sizeBytes: 1024,
          checkSum: { checkSumAlgorithm: 'MD5', value: 'abc' },
          sequenceId: 1,
          type: 'bitstream',
        },
      },
    } as Collection;

    expect(extractLogoUrl(coll)).toBe('/server/api/core/bitstreams/bs-logo-1/content');
  });

  /** Verifica que devuelva null cuando el embed trae logo = null (collection sin portada). */
  it('should return null when the embedded logo is null', () => {
    const coll = {
      uuid: 'coll-2',
      name: 'PRONEA',
      handle: '123/201',
      metadata: {},
      archivedItemsCount: 0,
      type: 'collection',
      _embedded: { logo: null },
    } as Collection;

    expect(extractLogoUrl(coll)).toBeNull();
  });

  /** Verifica que devuelva null cuando la collection no trae _embedded (no se pidió `?embed=logo`). */
  it('should return null when the collection has no _embedded section', () => {
    const coll = {
      uuid: 'coll-3',
      name: 'EVA',
      handle: '123/202',
      metadata: {},
      archivedItemsCount: 0,
      type: 'collection',
    } as Collection;

    expect(extractLogoUrl(coll)).toBeNull();
  });
});
