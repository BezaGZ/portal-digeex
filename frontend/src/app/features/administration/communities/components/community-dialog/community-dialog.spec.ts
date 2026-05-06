import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { CommunityDialog } from './community-dialog';

/**
 * Tests de CommunityDialog.
 *
 * Form de crear/editar subdirección. En modo create pide nombre corto
 * (Educación Básica), título completo (Subdirección de Educación Básica)
 * y sufijo (ED_BASICA). En modo edit precarga ambos nombres y bloquea
 * nombreCorto y sufijo: el nombre corto está atado a dc.title.alternative
 * como identificador estable y el sufijo rompería los grupos
 * ADMIN_<sufijo> y SUBMITTERS_<sufijo> ya existentes.
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

  it('should mark the form invalid until nombreCorto, tituloCompleto and sufijo are filled in create mode', () => {
    const fixture = TestBed.createComponent(CommunityDialog);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('initialNombreCorto', '');
    fixture.componentRef.setInput('initialTituloCompleto', '');
    fixture.componentRef.setInput('initialSufijo', '');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.invalid).toBe(true);

    c.form.patchValue({
      nombreCorto: 'Nueva',
      tituloCompleto: 'Subdirección Nueva',
      sufijo: 'ED_NUEVA',
    });
    expect(c.form.valid).toBe(true);
  });

  it('should prefill nombreCorto and tituloCompleto and lock both nombreCorto and sufijo in edit mode', () => {
    const fixture = TestBed.createComponent(CommunityDialog);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialNombreCorto', 'Educación Básica');
    fixture.componentRef.setInput('initialTituloCompleto', 'Subdirección de Educación Básica');
    fixture.componentRef.setInput('initialSufijo', 'ED_BASICA');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.controls.nombreCorto.value).toBe('Educación Básica');
    expect(c.form.controls.tituloCompleto.value).toBe('Subdirección de Educación Básica');
    expect(c.form.controls.sufijo.value).toBe('ED_BASICA');
    expect(c.form.controls.nombreCorto.disabled).toBe(true);
    expect(c.form.controls.sufijo.disabled).toBe(true);
    expect(c.form.controls.tituloCompleto.disabled).toBe(false);
  });
});
