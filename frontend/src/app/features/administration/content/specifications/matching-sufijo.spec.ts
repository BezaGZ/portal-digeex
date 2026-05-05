import { MatchingSufijoSpec } from './matching-sufijo';
import { ScopeContext } from './scope-context.model';

/**
 * Tests de MatchingSufijoSpec (RN-32 + RN-41).
 *
 * Para recursos en una subdirección (community-sub, collection, item), el
 * caller debe estar en la misma subdirección. SuperAdmin pasa siempre. La
 * spec se delega cuando el DSO es top-level (lo gobierna otra spec).
 *
 * Ciclo 11 TDD — Sprint 6
 */
describe('MatchingSufijoSpec', () => {
  let spec: MatchingSufijoSpec;

  beforeEach(() => {
    spec = new MatchingSufijoSpec();
  });

  it('should be satisfied when caller is superadmin regardless of resource sufijo', () => {
    const ctx: ScopeContext = {
      dsoType: 'collection',
      resourceSufijo: 'ED_TRABAJO',
      caller: { role: 'superadmin', sufijo: null },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });

  it('should be satisfied when admin_subdireccion sufijo matches resource sufijo', () => {
    const ctx: ScopeContext = {
      dsoType: 'collection',
      resourceSufijo: 'ED_BASICA',
      caller: { role: 'admin_subdireccion', sufijo: 'ED_BASICA' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });

  it('should NOT be satisfied when admin_subdireccion sufijo does not match resource sufijo', () => {
    const ctx: ScopeContext = {
      dsoType: 'item',
      resourceSufijo: 'ED_TRABAJO',
      caller: { role: 'admin_subdireccion', sufijo: 'ED_BASICA' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(false);
    expect(spec.rejectionMessage(ctx)).toContain('ED_BASICA');
    expect(spec.rejectionMessage(ctx)).toContain('ED_TRABAJO');
  });

  it('should NOT be satisfied when personal_delegado sufijo does not match resource sufijo', () => {
    const ctx: ScopeContext = {
      dsoType: 'item',
      resourceSufijo: 'ED_INVESTIGACION',
      caller: { role: 'personal_delegado', sufijo: 'ED_BASICA' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(false);
  });
});
