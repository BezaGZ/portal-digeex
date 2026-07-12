import { SuperAdminOnlyForTopLevelSpec } from './super-admin-only-for-top-level';
import { ScopeContext } from './scope-context.model';

/**
 * Tests de SuperAdminOnlyForTopLevelSpec (RN-40).
 *
 * Solo SuperAdmin puede operar sobre la community top-level (la raíz DIGEEX).
 * Para otros DSO la spec siempre se considera satisfecha.
 *
 * Ciclo 11 TDD — Sprint 6
 */
describe('SuperAdminOnlyForTopLevelSpec', () => {
  let spec: SuperAdminOnlyForTopLevelSpec;

  beforeEach(() => {
    spec = new SuperAdminOnlyForTopLevelSpec();
  });

  it('should be satisfied when caller is superadmin and dsoType is community-toplevel', () => {
    const ctx: ScopeContext = {
      dsoType: 'community-toplevel',
      resourceScopeUuid: null,
      caller: { role: 'superadmin', scopeUuid: null },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });

  it('should NOT be satisfied when caller is admin_subdireccion and dsoType is community-toplevel', () => {
    const ctx: ScopeContext = {
      dsoType: 'community-toplevel',
      resourceScopeUuid: null,
      caller: { role: 'admin_subdireccion', scopeUuid: 'ED_BASICA' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(false);
    expect(spec.rejectionMessage(ctx)).toContain(
      'Solo SuperAdmin puede operar sobre la community top-level',
    );
  });

  it('should be satisfied when dsoType is not community-toplevel regardless of caller role', () => {
    const ctx: ScopeContext = {
      dsoType: 'collection',
      resourceScopeUuid: 'ED_TRABAJO',
      caller: { role: 'admin_subdireccion', scopeUuid: 'ED_BASICA' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });
});
