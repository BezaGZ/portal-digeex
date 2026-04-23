/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { outputToObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';

import { EditUserDialog } from './edit-user-dialog';
import { UserView } from '../../models/user-view.model';

/**
 * Tests de `EditUserDialog`.
 *
 * Diálogo presentacional que pre-llena firstName, lastName y email desde el
 * target recibido por input, y emite un diff con solo los campos modificados.
 * Submit deshabilitado hasta que haya al menos un cambio respecto al
 * snapshot inicial.
 *
 * Ciclo 18 TDD — Sprint 5.
 */
describe('EditUserDialog', () => {
  let fixture: ComponentFixture<EditUserDialog>;
  let component: EditUserDialog;

  function buildTarget(overrides: Partial<UserView> = {}): UserView {
    return {
      uuid: 'uuid-target',
      email: 'target@mineduc.gob.gt',
      firstName: 'Rosa',
      lastName: 'Juárez',
      role: 'personal_delegado',
      subdivision: 'ED_BASICA',
      status: 'active',
      lastActive: '2026-03-15',
      ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EditUserDialog],
      providers: [provideNoopAnimations()],
    });

    fixture = TestBed.createComponent(EditUserDialog);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('target', buildTarget());
  });

  /** Verifica que el form se pre-llene con el firstName, lastName y email del target. */
  it('should prefill the form with firstName, lastName and email from the target input', () => {
    fixture.detectChanges();
    const raw = (component as any).form.getRawValue();
    expect(raw).toEqual({
      email: 'target@mineduc.gob.gt',
      firstName: 'Rosa',
      lastName: 'Juárez',
    });
  });

  /**
   * Verifica que el submit esté deshabilitado mientras el form no tenga diff,
   * y que se habilite en cuanto el usuario modifica al menos un campo.
   */
  it('should keep submit disabled until at least one field changes', () => {
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(false);

    (component as any).form.patchValue({ firstName: 'Rosa María' });
    expect(component.canSubmit()).toBe(true);
  });

  /**
   * Verifica que el emit lleve uuid del target y únicamente los campos que
   * cambiaron, no los valores originales que el usuario no tocó.
   */
  it('should emit editSubmitted with the diff payload (only changed fields)', async () => {
    fixture.detectChanges();
    (component as any).form.patchValue({
      firstName: 'Rosa María',
      email: 'nuevo@mineduc.gob.gt',
    });

    const emitted = firstValueFrom(outputToObservable(component.editSubmitted));
    (component as any).onSubmit();
    const payload = await emitted;

    expect(payload).toEqual({
      uuid: 'uuid-target',
      changes: { firstName: 'Rosa María', email: 'nuevo@mineduc.gob.gt' },
    });
  });
});
