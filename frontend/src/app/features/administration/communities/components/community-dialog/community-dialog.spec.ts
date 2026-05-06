import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { CommunityDialog } from './community-dialog';

/**
 * Tests de CommunityDialog.
 *
 * Form de crear/editar subdirección. En modo create pide nombre y sufijo
 * (ED_BASICA, ED_TRABAJO, etc.). En modo edit precarga el nombre del
 * target y bloquea el sufijo (no se puede cambiar el sufijo de una
 * subdirección existente porque rompería los nombres de los grupos
 * ADMIN_<sufijo> y SUBMITTERS_<sufijo> ya existentes).
 *
 * Ciclo 17 TDD — Sprint 6
 */
describe('CommunityDialog', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommunityDialog],
      providers: [provideNoopAnimations()],
    });
  });

  it('should mark the form invalid until both name and sufijo are filled in create mode', () => {
    const fixture = TestBed.createComponent(CommunityDialog);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('initialName', '');
    fixture.componentRef.setInput('initialSufijo', '');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.invalid).toBe(true);

    c.form.patchValue({ name: 'Nueva', sufijo: 'ED_NUEVA' });
    expect(c.form.valid).toBe(true);
  });

  it('should prefill the name and lock sufijo in edit mode', () => {
    const fixture = TestBed.createComponent(CommunityDialog);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialName', 'Educación Básica');
    fixture.componentRef.setInput('initialSufijo', 'ED_BASICA');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.value.name).toBe('Educación Básica');
    expect(c.form.controls.sufijo.value).toBe('ED_BASICA');
    expect(c.form.controls.sufijo.disabled).toBe(true);
  });
});
