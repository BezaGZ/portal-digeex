import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { CollectionDialog } from './collection-dialog';

/**
 * Tests de CollectionDialog.
 *
 * Form de crear/editar programa. En modo create pide nombre, tipo
 * (Documento/Galeria/Estadistica) y ubicación menú; descripción es
 * opcional. En modo edit precarga todos los campos del target y bloquea
 * el tipo (cambiarlo rompería el routing del frontend y los SAFs).
 *
 * Ciclo 18 TDD — Sprint 6
 */
describe('CollectionDialog', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CollectionDialog],
      providers: [provideNoopAnimations()],
    });
  });

  it('should mark the form invalid until siglas, titulo, entityType, navLocation and orden are filled in create mode', () => {
    const fixture = TestBed.createComponent(CollectionDialog);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('initialSiglas', '');
    fixture.componentRef.setInput('initialTitulo', '');
    fixture.componentRef.setInput('initialDescription', '');
    fixture.componentRef.setInput('initialEntityType', '');
    fixture.componentRef.setInput('initialNavLocation', '');
    fixture.componentRef.setInput('initialOrden', '');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.invalid).toBe(true);

    c.form.patchValue({
      siglas: 'PEAC',
      titulo: 'Programa de Educación de Adultos por Correspondencia',
      entityType: 'Documento',
      navLocation: 'menu-principal',
      orden: '1',
    });
    expect(c.form.valid).toBe(true);
  });

  it('should prefill all fields and lock siglas + entityType in edit mode', () => {
    const fixture = TestBed.createComponent(CollectionDialog);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialSiglas', 'PEAC');
    fixture.componentRef.setInput('initialTitulo', 'Programa de Educación de Adultos por Correspondencia');
    fixture.componentRef.setInput('initialDescription', 'Modalidad de educación a distancia');
    fixture.componentRef.setInput('initialEntityType', 'Documento');
    fixture.componentRef.setInput('initialNavLocation', 'menu-principal');
    fixture.componentRef.setInput('initialOrden', '1');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.form.controls.siglas.value).toBe('PEAC');
    expect(c.form.controls.siglas.disabled).toBe(true);
    expect(c.form.value.titulo).toBe('Programa de Educación de Adultos por Correspondencia');
    expect(c.form.value.description).toBe('Modalidad de educación a distancia');
    expect(c.form.controls.entityType.value).toBe('Documento');
    expect(c.form.controls.entityType.disabled).toBe(true);
    expect(c.form.value.navLocation).toBe('menu-principal');
    expect(c.form.value.orden).toBe('1');
  });
});
