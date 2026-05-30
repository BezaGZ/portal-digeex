import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
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
 * Ciclo 18 TDD — Sprint 6. Ajustado en Ciclo 4.
 */
describe('CollectionDialog', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CollectionDialog],
      providers: [provideNoopAnimations(), provideHttpClient()],
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

  /** Cover opcional */

  /** Verifica que onSubmit emita coverFile: null cuando no se seleccionó archivo. */
  it('should emit coverFile null in the payload when no file was selected', () => {
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

    c.form.patchValue({
      siglas: 'NUEVO',
      titulo: 'Nuevo programa',
      entityType: 'Documento',
      navLocation: 'menu-principal',
      orden: '5',
    });
    let emitted: { coverFile: File | null } | null = null;
    c.submitForm.subscribe((p) => (emitted = p));

    c.onSubmit();

    expect(emitted).not.toBeNull();
    expect(emitted!.coverFile).toBeNull();
  });

  /** Verifica que onCoverChange dispare la actualización y el payload incluya el File. */
  it('should emit the selected coverFile in the payload after onCoverChange', () => {
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

    c.form.patchValue({
      siglas: 'NUEVO',
      titulo: 'Nuevo programa',
      entityType: 'Documento',
      navLocation: 'menu-principal',
      orden: '5',
    });
    const cover = new File(['png'], 'logo.png', { type: 'image/png' });
    c.onCoverChange([cover]);
    let emitted: { coverFile: File | null } | null = null;
    c.submitForm.subscribe((p) => (emitted = p));

    c.onSubmit();

    expect(emitted!.coverFile).toBe(cover);
  });

  /**
   * Verifica que en edit, sin tocar ningún campo del form pero subiendo cover, el submit habilite.
   * El usuario quiere reemplazar solo el logo: el botón debe abrirse cuando hay cover aunque hasChanges sea false.
   */
  it('should enable canSubmit in edit when only coverFile changes (no field edits)', () => {
    const fixture = TestBed.createComponent(CollectionDialog);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialSiglas', 'PEAC');
    fixture.componentRef.setInput('initialTitulo', 'PEAC original');
    fixture.componentRef.setInput('initialDescription', 'desc');
    fixture.componentRef.setInput('initialEntityType', 'Documento');
    fixture.componentRef.setInput('initialNavLocation', 'menu-principal');
    fixture.componentRef.setInput('initialOrden', '1');
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.canSubmit()).toBe(false);
    c.onCoverChange([new File(['png'], 'logo.png', { type: 'image/png' })]);
    expect(c.canSubmit()).toBe(true);
  });

  /**
   * Verifica que el coverFile vuelva a null cuando cambia el mode.
   * Sin esto, abrir editar tras crear arrastraría el archivo elegido en la sesión previa.
   */
  it('should reset coverFile to null when mode changes', () => {
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

    const cover = new File(['png'], 'logo.png', { type: 'image/png' });
    c.onCoverChange([cover]);
    expect(c.coverFile()).toBe(cover);

    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('initialSiglas', 'PEAC');
    fixture.componentRef.setInput('initialEntityType', 'Documento');
    fixture.componentRef.setInput('initialNavLocation', 'menu-principal');
    fixture.componentRef.setInput('initialOrden', '1');
    fixture.detectChanges();

    expect(c.coverFile()).toBeNull();
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
