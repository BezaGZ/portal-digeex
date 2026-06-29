import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

import {
  coverUrlOf,
  entityTypeOf,
  isWithdrawn,
  issuedOf,
  resourceTypeOf,
  stateOf,
  titleOf,
} from './my-dspace-object.util';
import { MyDSpaceObject } from '../../../../core/api/models/my-dspace.model';

/**
 * Tests de `my-dspace-object.util`.
 *
 * Helpers puros para derivar etiquetas de tabla y flags desde un
 * `MyDSpaceObject` que viene del Discovery (`workspace` o
 * `administrativeView`). Los consume `Mis envíos` y la pantalla
 * `/administrador/recursos`.
 *
 * Ciclo 33 TDD — Sprint 6. Ajustado en Ciclo 40 (Sprint 10).
 */
describe('my-dspace-object.util', () => {
  beforeAll(() => registerLocaleData(localeEsGT));

  function build(overrides: Partial<MyDSpaceObject['indexableObject']> = {}): MyDSpaceObject {
    return {
      type: 'discover',
      indexableObject: {
        uuid: 'item-1',
        name: 'Fallback name',
        handle: '123/1',
        metadata: {},
        inArchive: true,
        discoverable: true,
        withdrawn: false,
        lastModified: '2026-05-12T00:00:00Z',
        type: 'item',
        ...overrides,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    };
  }

  /** Verifica que devuelva el value de `dc.title` cuando está poblado. */
  it('titleOf returns dc.title when present', () => {
    const o = build({ metadata: { 'dc.title': [{ value: 'Mi título', language: null, authority: null, confidence: -1, place: 0 }] } });
    expect(titleOf(o)).toBe('Mi título');
  });

  /** Verifica que caiga al `name` cuando no hay `dc.title`. */
  it('titleOf falls back to indexableObject.name when dc.title is absent', () => {
    expect(titleOf(build())).toBe('Fallback name');
  });

  /** Verifica que coverUrlOf arme la URL del bitstream cuando hay thumbnail. */
  it('coverUrlOf returns the bitstream content URL when the item has thumbnail', () => {
    const o = build({
      thumbnail: {
        uuid: 'bs-1',
        name: 'cover.jpg',
        type: 'bitstream',
        handle: null,
        metadata: {},
        sizeBytes: 0,
        checkSum: { checkSumAlgorithm: 'MD5', value: '' },
        sequenceId: 1,
      },
    });
    expect(coverUrlOf(o)).toBe('/server/api/core/bitstreams/bs-1/content');
  });

  /** Verifica que coverUrlOf devuelva null sin thumbnail embebido. */
  it('coverUrlOf returns null when the item has no thumbnail', () => {
    expect(coverUrlOf(build())).toBeNull();
  });

  const thumb = {
    uuid: 'bs-1',
    name: 'cover.jpg',
    type: 'bitstream',
    handle: null,
    metadata: {},
    sizeBytes: 0,
    checkSum: { checkSumAlgorithm: 'MD5', value: '' },
    sequenceId: 1,
  };

  /**
   * Verifica que coverUrlOf devuelva null para un withdrawn con thumbnail.
   * Withdrawn quita el READ anónimo al bitstream; sin URL el template cae al placeholder.
   */
  it('coverUrlOf returns null for a withdrawn item even with a thumbnail', () => {
    expect(coverUrlOf(build({ withdrawn: true, thumbnail: thumb }))).toBeNull();
  });

  /** Verifica que coverUrlOf devuelva null para un borrador (no archivado) con thumbnail. */
  it('coverUrlOf returns null for a non-archived draft even with a thumbnail', () => {
    expect(coverUrlOf(build({ inArchive: false, thumbnail: thumb }))).toBeNull();
  });

  /**
   * Verifica que un archivado privado (discoverable=false) igual devuelva la URL.
   * La privacidad es nivel discovery en DSpace, no quita el READ anónimo del bitstream.
   */
  it('coverUrlOf returns the content URL for a private archived item with discoverable false', () => {
    expect(coverUrlOf(build({ discoverable: false, thumbnail: thumb }))).toBe(
      '/server/api/core/bitstreams/bs-1/content',
    );
  });

  /** Verifica que issuedOf devuelva el valor crudo; el formato lo da el pipe. */
  it('issuedOf returns the raw dc.date.issued value', () => {
    const o = build({
      metadata: {
        'dc.date.issued': [{ value: '2026-05-04', language: null, authority: null, confidence: -1, place: 0 }],
      },
    });
    expect(issuedOf(o)).toBe('2026-05-04');
  });

  /** Verifica que issuedOf devuelva string vacío cuando no hay dc.date.issued. */
  it('issuedOf returns empty string when dc.date.issued is absent', () => {
    expect(issuedOf(build())).toBe('');
  });

  /** Verifica que resourceTypeOf devuelva dspace.entity.type. */
  it('resourceTypeOf returns dspace.entity.type', () => {
    const o = build({
      metadata: {
        'dspace.entity.type': [{ value: 'Galeria', language: null, authority: null, confidence: -1, place: 0 }],
      },
    });
    expect(resourceTypeOf(o)).toBe('Galeria');
  });

  /** Verifica que resourceTypeOf caiga al guion cuando no viene entity-type. */
  it('resourceTypeOf returns "—" when dspace.entity.type is absent', () => {
    expect(resourceTypeOf(build())).toBe('—');
  });

  /** Verifica que entityTypeOf priorice dc.type sobre el entity-type. */
  it('entityTypeOf prefers dc.type over dspace.entity.type', () => {
    const o = build({
      metadata: {
        'dc.type': [{ value: 'Video', language: null, authority: null, confidence: -1, place: 0 }],
        'dspace.entity.type': [{ value: 'Documento', language: null, authority: null, confidence: -1, place: 0 }],
      },
    });
    expect(entityTypeOf(o)).toBe('Video');
  });

  /** Verifica que entityTypeOf caiga a dspace.entity.type cuando no hay dc.type. */
  it('entityTypeOf falls back to dspace.entity.type when dc.type is absent', () => {
    const o = build({
      metadata: {
        'dspace.entity.type': [{ value: 'Estadistica', language: null, authority: null, confidence: -1, place: 0 }],
      },
    });
    expect(entityTypeOf(o)).toBe('Estadistica');
  });

  /** Verifica que stateOf devuelva "Eliminada" cuando withdrawn=true. */
  it('stateOf returns "Eliminada" for withdrawn items', () => {
    expect(stateOf(build({ withdrawn: true }))).toBe('Eliminada');
  });

  /** Verifica que stateOf devuelva "Privada" cuando discoverable=false. */
  it('stateOf returns "Privada" for items with discoverable=false', () => {
    expect(stateOf(build({ withdrawn: false, discoverable: false }))).toBe('Privada');
  });

  /** Verifica que stateOf devuelva "Pública" para items activos discoverable. */
  it('stateOf returns "Pública" for active items', () => {
    expect(stateOf(build({ withdrawn: false, discoverable: true }))).toBe('Pública');
  });

  /** Verifica que isWithdrawn refleje el flag nativo. */
  it('isWithdrawn returns the native withdrawn flag', () => {
    expect(isWithdrawn(build({ withdrawn: true }))).toBe(true);
    expect(isWithdrawn(build({ withdrawn: false }))).toBe(false);
  });
});
