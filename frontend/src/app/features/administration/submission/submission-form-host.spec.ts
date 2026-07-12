import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { SubmissionFormHost } from './submission-form-host';
import { Collection } from '../../../core/api/models/collection.model';
import { Caller } from '../content/specifications/scope-context.model';
import {
  clearSubmissionFormRegistry,
  registerSubmissionForm,
} from './submission-form-registry';

/** Fake con los inputs `collection` y `caller` que el host pasa por NgComponentOutlet. */
@Component({
  selector: 'app-fake-submission-form',
  template: '<p data-testid="fake-form">fake form</p>',
})
class FakeSubmissionForm {
  readonly collection = input<Collection | null>(null);
  readonly caller = input<Caller | null>(null);
}

function buildCollection(entityType: string | null): Collection {
  return {
    uuid: 'col-1',
    name: 'Test',
    handle: '123/1',
    archivedItemsCount: 0,
    type: 'collection',
    metadata: entityType
      ? {
          'dspace.entity.type': [
            {
              value: entityType,
              language: null,
              authority: null,
              confidence: -1,
              place: 0,
            },
          ],
        }
      : {},
  };
}

/**
 * El host del flujo de submission lee `dspace.entity.type` de la colección
 * destino y despacha al componente del registry vía NgComponentOutlet,
 * pasándole `collection` y `caller` como inputs. Los tests cubren los tres
 * caminos del despacho: tipo registrado se monta, tipo no registrado y
 * colección sin entity-type caen al mensaje de aviso sin romper la pantalla.
 *
 * Ciclo 21 TDD — Sprint 6
 */
describe('SubmissionFormHost', () => {
  beforeEach(() => {
    clearSubmissionFormRegistry();
    TestBed.configureTestingModule({
      imports: [SubmissionFormHost],
      providers: [provideNoopAnimations()],
    });
  });

  it('should mount the registered component when entity-type matches a registry entry', () => {
    registerSubmissionForm('Documento', FakeSubmissionForm);
    const fixture = TestBed.createComponent(SubmissionFormHost);
    fixture.componentRef.setInput('collection', buildCollection('Documento'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.formComponent()).toBe(FakeSubmissionForm);
    const fake = fixture.nativeElement.querySelector('[data-testid="fake-form"]');
    expect(fake).toBeTruthy();
  });

  it('should fall back to the warning message when entity-type is not registered', () => {
    const fixture = TestBed.createComponent(SubmissionFormHost);
    fixture.componentRef.setInput('collection', buildCollection('TipoInexistente'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.formComponent()).toBeNull();
    const message = fixture.nativeElement.querySelector('p-message');
    expect(message).toBeTruthy();
  });

  it('should fall back to the warning message when collection has no entity-type', () => {
    const fixture = TestBed.createComponent(SubmissionFormHost);
    fixture.componentRef.setInput('collection', buildCollection(null));
    fixture.componentRef.setInput('caller', { role: 'superadmin', scopeUuid: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.entityType()).toBeUndefined();
    expect(fixture.componentInstance.formComponent()).toBeNull();
    const message = fixture.nativeElement.querySelector('p-message');
    expect(message).toBeTruthy();
  });
});
