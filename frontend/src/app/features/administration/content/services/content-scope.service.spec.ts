import { TestBed } from '@angular/core/testing';
import { ContentScopeService } from './content-scope.service';
import { BusinessRuleError } from '../../../../core/error/business-rule-error';
import { ScopeContext } from '../specifications/scope-context.model';

/**
 * Tests de integración del ContentScopeService.
 *
 * Verifica que el service compone las Specifications correctamente, devuelve
 * sin throw cuando todas pasan, y lanza BusinessRuleError('OUT_OF_SCOPE') con
 * el mensaje de la primera spec que falla cuando alguna rechaza el contexto.
 *
 * Ciclo 11 TDD — Sprint 6
 */
describe('ContentScopeService', () => {
  let service: ContentScopeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ContentScopeService] });
    service = TestBed.inject(ContentScopeService);
  });

  it('should NOT throw when superadmin operates on a subcommunity', () => {
    const ctx: ScopeContext = {
      dsoType: 'community-sub',
      resourceSufijo: 'ED_BASICA',
      caller: { role: 'superadmin', sufijo: null },
    };
    expect(() => service.assertWithinScope(ctx)).not.toThrow();
  });

  it('should throw OUT_OF_SCOPE when admin_subdireccion targets a collection of another subdirection', () => {
    const ctx: ScopeContext = {
      dsoType: 'collection',
      resourceSufijo: 'ED_TRABAJO',
      caller: { role: 'admin_subdireccion', sufijo: 'ED_BASICA' },
    };
    let caught: BusinessRuleError | undefined;
    try {
      service.assertWithinScope(ctx);
    } catch (err) {
      caught = err as BusinessRuleError;
    }
    expect(caught).toBeInstanceOf(BusinessRuleError);
    expect(caught!.code).toBe('OUT_OF_SCOPE');
    expect(caught!.message).toContain('ED_BASICA');
    expect(caught!.message).toContain('ED_TRABAJO');
  });

  it('should throw OUT_OF_SCOPE with the top-level spec message when admin_subdireccion targets community-toplevel', () => {
    const ctx: ScopeContext = {
      dsoType: 'community-toplevel',
      resourceSufijo: null,
      caller: { role: 'admin_subdireccion', sufijo: 'ED_BASICA' },
    };
    let caught: BusinessRuleError | undefined;
    try {
      service.assertWithinScope(ctx);
    } catch (err) {
      caught = err as BusinessRuleError;
    }
    expect(caught).toBeInstanceOf(BusinessRuleError);
    expect(caught!.code).toBe('OUT_OF_SCOPE');
    expect(caught!.message).toContain('Solo SuperAdmin puede operar sobre la community top-level');
  });
});
