import { Group } from '../../../../core/api/models/group.model';
import {
  ADMINISTRATOR_GROUP_NAME,
  extractSubdivisionSuffix,
  isPortalRoleGroup,
  resolveRoleFromGroups,
} from './role-resolver';

/**
 * Tests de `role-resolver`.
 *
 * Utilidades puras que derivan el rol del portal y la subdivisión a partir
 * del nombre de los grupos de DSpace, porque `_links.object.href` devuelve
 * vacío para grupos custom creados vía PUT al subrecurso. El setup del
 * portal crea los grupos con los prefijos `ADMIN_` y `SUBMITTERS_`, y esta
 * capa los traduce al dominio (superadmin, admin_subdireccion, personal_delegado).
 *
 * Ciclo 17 TDD — Sprint 5.
 */
describe('role-resolver', () => {
  function buildGroup(name: string): Group {
    return {
      uuid: `uuid-${name}`,
      name,
      permanent: false,
      type: 'group',
      _links: {
        self: { href: `/server/api/eperson/groups/uuid-${name}` },
        object: { href: '' },
        epersons: { href: `/server/api/eperson/groups/uuid-${name}/epersons` },
        subgroups: { href: `/server/api/eperson/groups/uuid-${name}/subgroups` },
      },
    };
  }

  /** Verifica que el grupo global Administrator resuelva a superadmin (RN-07). */
  it('should resolve superadmin when the Administrator group is present', () => {
    expect(resolveRoleFromGroups([buildGroup(ADMINISTRATOR_GROUP_NAME)])).toBe('superadmin');
  });

  /** Verifica que cualquier grupo con prefijo ADMIN_ resuelva a admin_subdireccion. */
  it('should resolve admin_subdireccion when any group name starts with ADMIN_', () => {
    expect(resolveRoleFromGroups([buildGroup('ADMIN_ED_BASICA')])).toBe('admin_subdireccion');
    expect(resolveRoleFromGroups([buildGroup('ADMIN_ALFABETIZACION')])).toBe('admin_subdireccion');
  });

  /** Verifica que cualquier grupo con prefijo SUBMITTERS_ resuelva a personal_delegado. */
  it('should resolve personal_delegado when any group name starts with SUBMITTERS_', () => {
    expect(resolveRoleFromGroups([buildGroup('SUBMITTERS_ED_TRABAJO')])).toBe('personal_delegado');
    expect(resolveRoleFromGroups([buildGroup('SUBMITTERS_NUEVA')])).toBe('personal_delegado');
  });

  /** Verifica que la lista vacía devuelva null para que el facade decida el bloqueo. */
  it('should return null when the group list is empty', () => {
    expect(resolveRoleFromGroups([])).toBeNull();
  });

  /** Verifica que Anonymous y los COMMUNITY_{uuid}_ADMIN auto-creados por DSpace no cuenten como rol. */
  it('should return null for Anonymous and COMMUNITY_{uuid}_ADMIN auto-created by DSpace', () => {
    expect(resolveRoleFromGroups([buildGroup('Anonymous')])).toBeNull();
    expect(
      resolveRoleFromGroups([buildGroup('COMMUNITY_47d05b9d-adc6-4a86-b382-b74fc3beff1b_ADMIN')]),
    ).toBeNull();
  });

  /** Verifica que superadmin prevalezca cuando el eperson también está en otros grupos de rol. */
  it('should prefer superadmin over admin_subdireccion and personal_delegado', () => {
    expect(
      resolveRoleFromGroups([
        buildGroup('ADMIN_ED_BASICA'),
        buildGroup(ADMINISTRATOR_GROUP_NAME),
        buildGroup('SUBMITTERS_ED_BASICA'),
      ]),
    ).toBe('superadmin');
  });

  /** Verifica que admin_subdireccion prevalezca sobre personal_delegado cuando coexisten. */
  it('should prefer admin_subdireccion over personal_delegado when both prefixes are present', () => {
    expect(
      resolveRoleFromGroups([buildGroup('ADMIN_ED_BASICA'), buildGroup('SUBMITTERS_ED_BASICA')]),
    ).toBe('admin_subdireccion');
  });

  describe('extractSubdivisionSuffix', () => {
    /** Verifica que el sufijo del primer grupo ADMIN_ del eperson se devuelva tal cual. */
    it('should return the suffix of the first ADMIN_ group', () => {
      expect(extractSubdivisionSuffix([buildGroup('ADMIN_ED_BASICA')])).toBe('ED_BASICA');
    });

    /** Verifica que el sufijo venga del grupo SUBMITTERS_ cuando no hay ADMIN_. */
    it('should return the suffix of a SUBMITTERS_ group when no ADMIN_ is present', () => {
      expect(extractSubdivisionSuffix([buildGroup('SUBMITTERS_ED_TRABAJO')])).toBe('ED_TRABAJO');
    });

    /** Verifica que sin grupos de rol del portal devuelva null (superadmin global no tiene subdivisión). */
    it('should return null when no ADMIN_ or SUBMITTERS_ group is present', () => {
      expect(extractSubdivisionSuffix([buildGroup(ADMINISTRATOR_GROUP_NAME)])).toBeNull();
      expect(extractSubdivisionSuffix([buildGroup('Anonymous')])).toBeNull();
      expect(extractSubdivisionSuffix([])).toBeNull();
    });
  });

  describe('isPortalRoleGroup', () => {
    /** Verifica que Administrator, ADMIN_* y SUBMITTERS_* pasen como grupo de rol del portal. */
    it('should accept Administrator, ADMIN_* and SUBMITTERS_*', () => {
      expect(isPortalRoleGroup(buildGroup(ADMINISTRATOR_GROUP_NAME))).toBe(true);
      expect(isPortalRoleGroup(buildGroup('ADMIN_ED_BASICA'))).toBe(true);
      expect(isPortalRoleGroup(buildGroup('SUBMITTERS_ED_TRABAJO'))).toBe(true);
    });

    /** Verifica que Anonymous y los auto-creados por DSpace queden fuera del filtro. */
    it('should reject Anonymous and COMMUNITY_/COLLECTION_ auto-created groups', () => {
      expect(isPortalRoleGroup(buildGroup('Anonymous'))).toBe(false);
      expect(
        isPortalRoleGroup(buildGroup('COMMUNITY_47d05b9d-adc6-4a86-b382-b74fc3beff1b_ADMIN')),
      ).toBe(false);
      expect(
        isPortalRoleGroup(buildGroup('COLLECTION_47d05b9d-adc6-4a86-b382-b74fc3beff1b_SUBMIT')),
      ).toBe(false);
    });
  });
});
