import {
  Community,
  sufijoOf,
  adminGroupUuidOf,
  submittersGroupUuidOf,
} from './community.model';

/**
 * Tests de los lectores de metadata de Community.
 *
 * Lectura única de los metadatos del dominio DIGEEX sobre una community:
 * `digeex.sufijo` (pantallas del admin y `findCallerSub`) y los uuids de los
 * grupos de la subdirección (`digeex.adminGroup` / `digeex.submittersGroup`),
 * que reemplazan el lookup de grupos por nombre en los facades; `null` cuando
 * el campo no está.
 *
 * Ciclo 29 TDD — Sprint 10. Ajustado en Ciclo 5 (Sprint 11).
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

describe('group uuid readers', () => {
  function buildWithGroups(adminUuid?: string, submittersUuid?: string): Community {
    const metadata: Community['metadata'] = {};
    if (adminUuid !== undefined) {
      metadata['digeex.adminGroup'] = [
        { value: adminUuid, language: null, authority: null, confidence: -1, place: 0 },
      ];
    }
    if (submittersUuid !== undefined) {
      metadata['digeex.submittersGroup'] = [
        { value: submittersUuid, language: null, authority: null, confidence: -1, place: 0 },
      ];
    }
    return {
      uuid: 'u',
      name: 'n',
      handle: 'h',
      archivedItemsCount: 0,
      type: 'community',
      metadata,
    };
  }

  /** Verifica la lectura de ambos uuids de grupo desde sus metadatos. */
  it('should read the group uuids from digeex.adminGroup and digeex.submittersGroup', () => {
    const community = buildWithGroups('admin-group-uuid', 'submitters-group-uuid');
    expect(adminGroupUuidOf(community)).toBe('admin-group-uuid');
    expect(submittersGroupUuidOf(community)).toBe('submitters-group-uuid');
  });

  /** Verifica que los campos ausentes resuelvan null (subdirección sin migrar). */
  it('should return null when the group metadata fields are absent', () => {
    const community = buildWithGroups();
    expect(adminGroupUuidOf(community)).toBeNull();
    expect(submittersGroupUuidOf(community)).toBeNull();
  });
});
