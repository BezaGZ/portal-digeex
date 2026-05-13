import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { NEVER, of, throwError } from 'rxjs';

import { BaseSubmissionForm } from './base-submission-form';
import { Collection } from '../../../core/api/models/collection.model';
import { Item } from '../../../core/api/models/item.model';
import { MetadataValue } from '../../../core/api/models/metadata.model';
import { JsonPatchEntry } from '../../../core/api/json-patch.util';
import { SubmissionFacade } from '../content/services/submission-facade';
import { ItemAdminFacade } from '../content/services/item-admin-facade';

/**
 * Subclase concreta para ejercitar el flujo de la base sin atarlo a un
 * formulario real. Cada hook devuelve un valor fijo que los tests usan
 * para verificar el armado del SubmitItemRequest.
 */
@Component({
  selector: 'app-fake-submission-form',
  template: '',
})
class FakeSubmissionForm extends BaseSubmissionForm {
  protected getSectionName(): string {
    return 'digeex-documento';
  }
  protected buildMetadata(): Record<string, MetadataValue[]> {
    return {
      'dc.title': [
        { value: 'Hola', language: null, authority: null, confidence: -1, place: 0 },
      ],
    };
  }
  protected getFiles(): File[] {
    return [new File([''], 'a.pdf', { type: 'application/pdf' })];
  }
  protected getVisibility(): 'public' | 'private' {
    return 'public';
  }
  protected applyItemToForm(_item: Item): void {
    /* no-op para los tests del flujo de creación. */
  }
  protected buildPatchFromForm(_item: Item): JsonPatchEntry[] {
    return [];
  }
}

/**
 * Variante de la subclase con los hooks de bitstreams sobrescritos. El test
 * de edit la usa para verificar que la base reenvía las listas a editItem$.
 */
@Component({
  selector: 'app-fake-edit-form',
  template: '',
})
class FakeEditForm extends FakeSubmissionForm {
  readonly newFile = new File(['x'], 'nuevo.pdf', { type: 'application/pdf' });
  protected override getBitstreamsToAdd(): File[] {
    return [this.newFile];
  }
  protected override getBitstreamsToRemove(): string[] {
    return ['old-bs-1'];
  }
}

/**
 * La base abstracta orquesta el submission de cualquier formulario:
 * arma el SubmitItemRequest desde los hooks de la subclase, lo pasa al
 * SubmissionFacade y maneja el estado de submitting + el toast de éxito o
 * error. Los tests cubren el camino feliz, la propagación del error del
 * facade, el guard contra doble submit y la lectura del sufijo del caller.
 *
 * Ciclo 22 TDD — Sprint 6. Ajustado en Ciclo 34.
 */
describe('BaseSubmissionForm', () => {
  let submitItemFn: ReturnType<typeof vi.fn>;
  let toastAdd: ReturnType<typeof vi.fn>;
  let routerNavigate: ReturnType<typeof vi.fn>;

  function buildCollection(uuid: string): Collection {
    return {
      uuid,
      name: 'Col',
      handle: '123/1',
      archivedItemsCount: 0,
      type: 'collection',
      metadata: {},
    };
  }

  beforeEach(() => {
    submitItemFn = vi.fn().mockReturnValue(of({ uuid: 'item-1' } as Item));
    toastAdd = vi.fn();
    routerNavigate = vi.fn();

    TestBed.configureTestingModule({
      imports: [FakeSubmissionForm],
      providers: [
        provideNoopAnimations(),
        { provide: SubmissionFacade, useValue: { submitItem$: submitItemFn } },
        { provide: ItemAdminFacade, useValue: { editItem$: vi.fn(() => of({ uuid: 'item-1' } as Item)) } },
        { provide: MessageService, useValue: { add: toastAdd } },
        { provide: Router, useValue: { navigate: routerNavigate } },
      ],
    });
  });

  it('should call submitItem$ with the request built from the hooks and the caller sufijo', () => {
    const fixture = TestBed.createComponent(FakeSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'admin_subdireccion', sufijo: 'ED_BASICA' });
    fixture.detectChanges();

    fixture.componentInstance.submit();

    expect(submitItemFn).toHaveBeenCalledTimes(1);
    expect(submitItemFn).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionUuid: 'col-1',
        sectionName: 'digeex-documento',
        visibility: 'public',
        sufijoSubdireccion: 'ED_BASICA',
        metadata: expect.objectContaining({ 'dc.title': expect.any(Array) }),
        files: expect.any(Array),
      }),
    );
  });

  it('should pass empty string as sufijo when the caller is superadmin (no scope)', () => {
    const fixture = TestBed.createComponent(FakeSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    fixture.componentInstance.submit();

    expect(submitItemFn).toHaveBeenCalledWith(
      expect.objectContaining({ sufijoSubdireccion: '' }),
    );
  });

  it('should toast success and reset submitting when the facade resolves', () => {
    const fixture = TestBed.createComponent(FakeSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    fixture.componentInstance.submit();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success' }),
    );
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('should toast error with the error message when the facade rejects', () => {
    submitItemFn.mockReturnValue(throwError(() => new Error('OUT_OF_SCOPE')));
    const fixture = TestBed.createComponent(FakeSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'admin_subdireccion', sufijo: 'ED_TRABAJO' });
    fixture.detectChanges();

    fixture.componentInstance.submit();

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: 'OUT_OF_SCOPE',
      }),
    );
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('should ignore a second submit while the first is still in flight', () => {
    submitItemFn.mockReturnValue(NEVER);
    const fixture = TestBed.createComponent(FakeSubmissionForm);
    fixture.componentRef.setInput('collection', buildCollection('col-1'));
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.detectChanges();

    fixture.componentInstance.submit();
    fixture.componentInstance.submit();

    expect(submitItemFn).toHaveBeenCalledTimes(1);
  });

  /** Verifica que en modo edit la base reenvía las listas de bitstreams al facade. */
  it('should pass bitstreamsToAdd and bitstreamsToRemove from the hooks to editItem$ in edit mode', () => {
    const editItemFn = vi.fn(() => of({ uuid: 'item-1' } as Item));
    TestBed.overrideProvider(ItemAdminFacade, { useValue: { editItem$: editItemFn } });
    const fixture = TestBed.createComponent(FakeEditForm);
    fixture.componentRef.setInput('caller', { role: 'superadmin', sufijo: null });
    fixture.componentRef.setInput('item', {
      uuid: 'item-1',
      discoverable: true,
      metadata: {},
    } as Item);
    fixture.detectChanges();

    fixture.componentInstance.submit();

    expect(editItemFn).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({
        bitstreamsToAdd: [fixture.componentInstance.newFile],
        bitstreamsToRemove: ['old-bs-1'],
      }),
      '',
    );
  });
});
