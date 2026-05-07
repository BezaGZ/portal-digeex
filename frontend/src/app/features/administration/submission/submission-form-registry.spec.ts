import { Component } from '@angular/core';

import {
  clearSubmissionFormRegistry,
  getSubmissionFormComponent,
  registerSubmissionForm,
} from './submission-form-registry';

@Component({ selector: 'app-fake-a', template: '' })
class FakeA {}

@Component({ selector: 'app-fake-b', template: '' })
class FakeB {}

/**
 * Tests para SubmissionFormRegistry.
 * 
 * El registry mapea cada `dspace.entity.type` al componente Angular que
 * renderiza su formulario de submission. Los formularios se autoregistran
 * y el host consulta el mapa al despachar. Los tests cubren el retorno
 * null para tipos no registrados o entityType undefined, y la idempotencia
 * del registro al sobreescribir entradas con el mismo entity-type.
 *
 * Ciclo 21 TDD — Sprint 6
 */
describe('submission-form-registry', () => {
  beforeEach(() => {
    clearSubmissionFormRegistry();
  });

  it('should return null for an unregistered entity-type', () => {
    expect(getSubmissionFormComponent('Inexistente')).toBeNull();
  });

  it('should return null when entityType is undefined', () => {
    expect(getSubmissionFormComponent(undefined)).toBeNull();
  });

  it('should return the component registered for an entity-type', () => {
    registerSubmissionForm('Documento', FakeA);
    expect(getSubmissionFormComponent('Documento')).toBe(FakeA);
  });

  it('should overwrite the entry when registering twice for the same entity-type', () => {
    registerSubmissionForm('Documento', FakeA);
    registerSubmissionForm('Documento', FakeB);
    expect(getSubmissionFormComponent('Documento')).toBe(FakeB);
  });
});
