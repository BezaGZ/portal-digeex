import {
  canChooseAnySubdireccion,
  canCreateTopLevel,
  canModifyRoles,
  canToggleItemVisibility,
  hasUsableScope,
  isCallerScoped,
  isSuperadmin,
  RoleHolder,
} from './role-capabilities';
import { Caller } from './caller.model';

/**
 * Tests de los helpers de capacidades por rol (`role-capabilities`).
 *
 * Fuente única sync de "qué puede cada rol" en el cliente. Los casos cubren los
 * tres roles del portal (superadmin, admin_subdireccion, personal_delegado) y el
 * caller null, que siempre cae a false (fail-closed).
 *
 * Ciclo 22 TDD — Sprint 10. Ajustado en Ciclo 60.
 */
describe('role-capabilities', () => {
  const superadmin: Caller = { role: 'superadmin', sufijo: null };
  const adminSub: Caller = { role: 'admin_subdireccion', sufijo: 'ED_BASICA' };
  const delegado: Caller = { role: 'personal_delegado', sufijo: 'ED_BASICA' };

  describe('isSuperadmin', () => {
    /** Verifica que un caller superadmin devuelva true. */
    it('should return true for a superadmin caller', () => {
      expect(isSuperadmin(superadmin)).toBe(true);
    });

    /** Verifica que un admin_subdireccion no sea superadmin. */
    it('should return false for an admin_subdireccion caller', () => {
      expect(isSuperadmin(adminSub)).toBe(false);
    });

    /** Verifica que un personal_delegado no sea superadmin. */
    it('should return false for a personal_delegado caller', () => {
      expect(isSuperadmin(delegado)).toBe(false);
    });

    /** Verifica que el caller null no sea superadmin (fail-closed). */
    it('should return false when caller is null', () => {
      expect(isSuperadmin(null)).toBe(false);
    });

    /** Verifica que acepte cualquier portador de rol, no solo Caller (p. ej. UserView con role null). */
    it('should accept any role holder, treating a null role as not superadmin', () => {
      const orphanView: RoleHolder = { role: null };
      const holderWithExtraFields = { role: 'superadmin' as const, email: 'x@y.z' };
      expect(isSuperadmin(orphanView)).toBe(false);
      expect(isSuperadmin(holderWithExtraFields)).toBe(true);
    });
  });

  describe('canCreateTopLevel', () => {
    /** Verifica que solo el superadmin pueda crear estructura top-level (RN-40). */
    it('should allow only a superadmin to create top-level communities', () => {
      expect(canCreateTopLevel(superadmin)).toBe(true);
      expect(canCreateTopLevel(adminSub)).toBe(false);
      expect(canCreateTopLevel(delegado)).toBe(false);
      expect(canCreateTopLevel(null)).toBe(false);
    });
  });

  describe('canChooseAnySubdireccion', () => {
    /** Verifica que solo el superadmin pueda elegir cualquier subdirección. */
    it('should allow only a superadmin to choose any subdireccion', () => {
      expect(canChooseAnySubdireccion(superadmin)).toBe(true);
      expect(canChooseAnySubdireccion(adminSub)).toBe(false);
      expect(canChooseAnySubdireccion(delegado)).toBe(false);
      expect(canChooseAnySubdireccion(null)).toBe(false);
    });
  });

  describe('canModifyRoles', () => {
    /** Verifica que solo el superadmin pueda cambiar roles (RN-13). */
    it('should allow only a superadmin to modify roles', () => {
      expect(canModifyRoles(superadmin)).toBe(true);
      expect(canModifyRoles(adminSub)).toBe(false);
      expect(canModifyRoles(delegado)).toBe(false);
      expect(canModifyRoles(null)).toBe(false);
    });
  });

  describe('canToggleItemVisibility', () => {
    /**
     * Verifica que solo superadmin y admin_subdireccion puedan togglear visibilidad.
     * El delegado no accede a Recursos: un item privado suyo le quedaría irrecuperable.
     */
    it('should allow only superadmin and admin_subdireccion to toggle item visibility', () => {
      expect(canToggleItemVisibility(superadmin)).toBe(true);
      expect(canToggleItemVisibility(adminSub)).toBe(true);
      expect(canToggleItemVisibility(delegado)).toBe(false);
      expect(canToggleItemVisibility(null)).toBe(false);
    });
  });

  describe('isCallerScoped', () => {
    /** Verifica que el superadmin no esté acotado a una sub. */
    it('should return false for a superadmin (operates without a scoped sufijo)', () => {
      expect(isCallerScoped(superadmin)).toBe(false);
    });

    /** Verifica que un admin_subdireccion con sufijo esté acotado. */
    it('should return true for an admin_subdireccion with a sufijo', () => {
      expect(isCallerScoped(adminSub)).toBe(true);
    });

    /** Verifica que un personal_delegado con sufijo esté acotado. */
    it('should return true for a personal_delegado with a sufijo', () => {
      expect(isCallerScoped(delegado)).toBe(true);
    });

    /** Verifica que un rol acotado sin sufijo no cuente como scopeado. */
    it('should return false for a scoped role without a sufijo', () => {
      expect(isCallerScoped({ role: 'admin_subdireccion', sufijo: null })).toBe(false);
    });

    /** Verifica que el caller null no esté acotado (fail-closed). */
    it('should return false when caller is null', () => {
      expect(isCallerScoped(null)).toBe(false);
    });
  });

  describe('hasUsableScope', () => {
    /** Verifica que el superadmin tenga scope usable con cualquier valor resuelto. */
    it('should return true for a superadmin regardless of resolved scope', () => {
      expect(hasUsableScope(superadmin, null)).toBe(true);
      expect(hasUsableScope(superadmin, 'uuid-x')).toBe(true);
    });

    /** Verifica que un caller acotado con uuid resuelto tenga scope usable. */
    it('should return true for a scoped caller with a resolved uuid', () => {
      expect(hasUsableScope(adminSub, 'uuid-basica')).toBe(true);
    });

    /** Verifica que un caller acotado sin uuid no tenga scope usable. */
    it('should return false for a scoped caller without a resolved uuid', () => {
      expect(hasUsableScope(adminSub, null)).toBe(false);
    });

    /** Verifica que el scope undefined (aún cargando) no sea usable. */
    it('should return false while the scope is still unresolved', () => {
      expect(hasUsableScope(adminSub, undefined)).toBe(false);
    });

    /** Verifica que el caller null no tenga scope usable (fail-closed). */
    it('should return false when caller is null', () => {
      expect(hasUsableScope(null, 'uuid-basica')).toBe(false);
    });
  });
});
