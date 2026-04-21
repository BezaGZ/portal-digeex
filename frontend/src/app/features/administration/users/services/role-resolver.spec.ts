import { Group } from '../../../../core/api/models/group.model';
import { resolveRoleFromGroups } from './role-resolver';

/**
 * Tests de resolveRoleFromGroups, función pura que deriva el rol del
 * sistema a partir de los grupos de DSpace a los que pertenece el eperson.
 *
 * Mapeo de reglas de negocio:
 *  - RN-07: grupo "Administrator"                   → superadmin
 *  - RN-08: _links.object.href → /core/communities/ → admin_subdireccion
 *  - RN-13: _links.object.href → /core/collections/ → personal_delegado
 *
 * Orden de precedencia cuando varios aplican:
 *  superadmin > admin_subdireccion > personal_delegado
 *
 * Esto se alinea con el modelo de DSpace: un eperson puede estar en
 * varios grupos a la vez, pero el UI presenta un único rol efectivo.
 *
 * Ciclo 9 — Sprint 5.
 */
describe('resolveRoleFromGroups', () => {
  const administratorGroup: Group = {
    uuid: 'group-administrator',
    name: 'Administrator',
    permanent: true,
    type: 'group',
    _links: {
      self: { href: '/server/api/eperson/groups/group-administrator' },
      object: { href: '' },
      epersons: { href: '/server/api/eperson/groups/group-administrator/epersons' },
      subgroups: { href: '/server/api/eperson/groups/group-administrator/subgroups' },
    },
  };

  const anonymousGroup: Group = {
    uuid: 'group-anonymous',
    name: 'Anonymous',
    permanent: true,
    type: 'group',
    _links: {
      self: { href: '/server/api/eperson/groups/group-anonymous' },
      object: { href: '' },
      epersons: { href: '/server/api/eperson/groups/group-anonymous/epersons' },
      subgroups: { href: '/server/api/eperson/groups/group-anonymous/subgroups' },
    },
  };

  const communityAdminGroup: Group = {
    uuid: 'group-admin-educacion-basica',
    name: 'COMMUNITY_educacion_basica_ADMIN',
    permanent: false,
    type: 'group',
    _links: {
      self: { href: '/server/api/eperson/groups/group-admin-educacion-basica' },
      object: { href: '/server/api/core/communities/community-educacion-basica' },
      epersons: { href: '/server/api/eperson/groups/group-admin-educacion-basica/epersons' },
      subgroups: { href: '/server/api/eperson/groups/group-admin-educacion-basica/subgroups' },
    },
  };

  const collectionSubmitterGroup: Group = {
    uuid: 'group-submit-coleccion-lengua',
    name: 'COLLECTION_coleccion_lengua_SUBMIT',
    permanent: false,
    type: 'group',
    _links: {
      self: { href: '/server/api/eperson/groups/group-submit-coleccion-lengua' },
      object: { href: '/server/api/core/collections/collection-lengua' },
      epersons: { href: '/server/api/eperson/groups/group-submit-coleccion-lengua/epersons' },
      subgroups: { href: '/server/api/eperson/groups/group-submit-coleccion-lengua/subgroups' },
    },
  };

  /**
   * RN-07: miembro del grupo "Administrator" → superadmin.
   * El nombre del grupo es el discriminador, no depende de _links.object.
   */
  it('should return "superadmin" when Administrator group is present', () => {
    expect(resolveRoleFromGroups([administratorGroup])).toBe('superadmin');
  });

  /**
   * RN-08: grupo cuyo _links.object apunta a una community → admin_subdireccion.
   * El nombre (COMMUNITY_*_ADMIN) es convención pero no se usa para decidir,
   * porque DSpace no lo garantiza para todas las instalaciones.
   */
  it('should return "admin_subdireccion" when group links to a community', () => {
    expect(resolveRoleFromGroups([communityAdminGroup])).toBe('admin_subdireccion');
  });

  /**
   * RN-13: grupo cuyo _links.object apunta a una collection → personal_delegado.
   * Corresponde al submittersGroup de una colección.
   */
  it('should return "personal_delegado" when group links to a collection', () => {
    expect(resolveRoleFromGroups([collectionSubmitterGroup])).toBe('personal_delegado');
  });

  /**
   * Sin grupos: el eperson no tiene rol asignado en el sistema.
   * El facade decidirá más adelante si bloquea el acceso o lo trata
   * como "sin permisos", pero la función pura responde null.
   */
  it('should return null when groups list is empty', () => {
    expect(resolveRoleFromGroups([])).toBeNull();
  });

  /**
   * Solo grupos que no mapean a ningún rol (por ejemplo, Anonymous):
   * la función debe devolver null, no caer en un rol por defecto.
   */
  it('should return null when only non-role groups are present (e.g. Anonymous)', () => {
    expect(resolveRoleFromGroups([anonymousGroup])).toBeNull();
  });

  /**
   * Precedencia: si el eperson está en "Administrator" y también en
   * grupos de subdirección o colección, prevalece superadmin. Esto
   * evita restringir accidentalmente a un admin global por heredar
   * otros grupos de prueba.
   */
  it('should prefer "superadmin" when Administrator is present with other role groups', () => {
    expect(
      resolveRoleFromGroups([communityAdminGroup, administratorGroup, collectionSubmitterGroup]),
    ).toBe('superadmin');
  });

  /**
   * Precedencia: admin de community sobre submitter de collection.
   * Un admin de subdirección normalmente puede subir en sus propias
   * colecciones, así que heredar submitter no debe "degradarlo" a
   * personal_delegado.
   */
  it('should prefer "admin_subdireccion" over "personal_delegado" when both are present', () => {
    expect(resolveRoleFromGroups([communityAdminGroup, collectionSubmitterGroup])).toBe(
      'admin_subdireccion',
    );
  });
});
