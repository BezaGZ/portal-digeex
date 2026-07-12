import { MatchingScopeSpec } from './matching-scope';
import { ScopeContext } from './scope-context.model';

/**
 * Tests de MatchingScopeSpec (RN-32 + RN-41).
 *
 * Para recursos en una subdirección (community-sub, collection, item), el
 * caller debe estar en la misma subdirección, comparando los uuids de scope
 * afirmados por el backend. SuperAdmin pasa siempre; el top-level lo gobierna
 * otra spec. Sin scope de alguno de los dos lados, rechaza (fail-closed).
 * Reemplaza al matching por sufijo derivado de nombres de grupo.
 *
 * Ciclo 11 TDD — Sprint 6. Ajustado en Ciclos 4 y 6 (Sprint 11).
 */
describe('MatchingScopeSpec', () => {
  let spec: MatchingScopeSpec;

  beforeEach(() => {
    spec = new MatchingScopeSpec();
  });

  /** Verifica que el superadmin pase sin importar la subdirección del recurso. */
  it('should be satisfied when caller is superadmin regardless of resource scope', () => {
    const ctx: ScopeContext = {
      dsoType: 'collection',
      resourceScopeUuid: 'uuid-trabajo',
      caller: { role: 'superadmin', scopeUuid: null },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });

  /** Verifica que la regla no opine sobre recursos de la community raíz. */
  it('should be satisfied for top-level resources (governed by another spec)', () => {
    const ctx: ScopeContext = {
      dsoType: 'community-toplevel',
      resourceScopeUuid: null,
      caller: { role: 'admin_subdireccion', scopeUuid: 'uuid-basica' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });

  /** Verifica la aceptación cuando ambos uuids de scope coinciden. */
  it('should be satisfied when the caller scope matches the resource scope', () => {
    const ctx: ScopeContext = {
      dsoType: 'collection',
      resourceScopeUuid: 'uuid-basica',
      caller: { role: 'admin_subdireccion', scopeUuid: 'uuid-basica' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(true);
  });

  /** Verifica el rechazo por scope divergente y el mensaje con ambos uuids. */
  it('should NOT be satisfied when the scopes diverge', () => {
    const ctx: ScopeContext = {
      dsoType: 'item',
      resourceScopeUuid: 'uuid-trabajo',
      caller: { role: 'admin_subdireccion', scopeUuid: 'uuid-basica' },
    };
    expect(spec.isSatisfiedBy(ctx)).toBe(false);
    expect(spec.rejectionMessage(ctx)).toContain('uuid-basica');
    expect(spec.rejectionMessage(ctx)).toContain('uuid-trabajo');
  });

  /** Verifica el fail-closed: sin scope del caller o del recurso, rechaza. */
  it('should NOT be satisfied when either side lacks a backend scope', () => {
    const callerSinScope: ScopeContext = {
      dsoType: 'collection',
      resourceScopeUuid: 'uuid-basica',
      caller: { role: 'personal_delegado', scopeUuid: null },
    };
    const recursoSinScope: ScopeContext = {
      dsoType: 'collection',
      resourceScopeUuid: null,
      caller: { role: 'personal_delegado', scopeUuid: 'uuid-basica' },
    };
    expect(spec.isSatisfiedBy(callerSinScope)).toBe(false);
    expect(spec.isSatisfiedBy(recursoSinScope)).toBe(false);
  });
});
