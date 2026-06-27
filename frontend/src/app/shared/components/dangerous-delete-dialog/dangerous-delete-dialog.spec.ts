import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { DangerousDeleteDialog } from './dangerous-delete-dialog';

/**
 * Tests de DangerousDeleteDialog.
 *
 * Diálogo presentacional de borrado destructivo reusable (programa y
 * subdirección). Exige teclear el nombre completo del recurso para habilitar
 * el botón Eliminar y muestra qué se borrará. No hace HTTP: recibe todo por
 * inputs y emite confirmed/cancelled; la feature resuelve los datos y el delete.
 *
 * Ciclo 3 TDD — Mejora 9. Extendido en Ciclo 4 (eventos y reset), Ciclo 5 (contenido afectado) y Ciclo 32 (Sprint 10, kind recurso).
 */
describe('DangerousDeleteDialog', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DangerousDeleteDialog],
      providers: [provideNoopAnimations()],
    });
  });

  function createDialog(overrides: {
    visible?: boolean;
    entityKind?: 'programa' | 'subdireccion' | 'recurso';
    entityLabel?: string;
    deleting?: boolean;
  } = {}) {
    const fixture = TestBed.createComponent(DangerousDeleteDialog);
    fixture.componentRef.setInput('visible', overrides.visible ?? true);
    fixture.componentRef.setInput('entityKind', overrides.entityKind ?? 'programa');
    fixture.componentRef.setInput('entityLabel', overrides.entityLabel ?? 'Programa de prueba');
    fixture.componentRef.setInput('deleting', overrides.deleting ?? false);
    fixture.detectChanges();
    return fixture;
  }

  it('should be created', () => {
    const fixture = createDialog();
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('visibility', () => {
    /** El cuerpo solo se monta cuando visible es true (p-dialog no renderiza contenido oculto). */
    it('should render the dialog body when visible is true', () => {
      const fixture = createDialog({ visible: true });
      const body = fixture.nativeElement.querySelector('[data-testid="dangerous-delete-dialog"]');
      expect(body).toBeTruthy();
    });

    it('should not render the dialog body when visible is false', () => {
      const fixture = createDialog({ visible: false });
      const body = fixture.nativeElement.querySelector('[data-testid="dangerous-delete-dialog"]');
      expect(body).toBeNull();
    });
  });

  describe('confirm gating', () => {
    /** El botón Eliminar no se habilita hasta que el texto coincide exactamente con el nombre. */
    it('should keep confirm disabled until the typed text matches entityLabel', () => {
      const fixture = createDialog({ entityLabel: 'Programa de prueba' });
      const c = fixture.componentInstance;

      expect(c.canConfirm()).toBe(false);

      c.typed.set('Programa');
      expect(c.canConfirm()).toBe(false);
    });

    it('should enable confirm when the typed text matches entityLabel', () => {
      const fixture = createDialog({ entityLabel: 'Programa de prueba' });
      const c = fixture.componentInstance;

      c.typed.set('Programa de prueba');
      expect(c.canConfirm()).toBe(true);
    });

    /** Tolera espacios accidentales al inicio/fin; no normaliza acentos ni mayúsculas (confirmación deliberada). */
    it('should trim surrounding whitespace before comparing', () => {
      const fixture = createDialog({ entityLabel: 'Programa de prueba' });
      const c = fixture.componentInstance;

      c.typed.set('   Programa de prueba   ');
      expect(c.canConfirm()).toBe(true);
    });

    it('should keep confirm disabled while a delete is in progress', () => {
      const fixture = createDialog({ entityLabel: 'Programa de prueba', deleting: true });
      const c = fixture.componentInstance;

      c.typed.set('Programa de prueba');
      expect(c.canConfirm()).toBe(false);
    });

    it('should expose a header text per entity kind', () => {
      expect(createDialog({ entityKind: 'programa' }).componentInstance.headerText()).toContain('programa');
      expect(createDialog({ entityKind: 'subdireccion' }).componentInstance.headerText()).toContain('subdirección');
    });

    it('should expose a header text for the recurso kind', () => {
      expect(createDialog({ entityKind: 'recurso' }).componentInstance.headerText()).toContain('recurso');
    });
  });

  describe('events and reset', () => {
    it('should emit confirmed when confirming with a matching name', () => {
      const fixture = createDialog({ entityLabel: 'Programa de prueba' });
      const c = fixture.componentInstance;
      let emitted = false;
      c.confirmed.subscribe(() => (emitted = true));

      c.typed.set('Programa de prueba');
      c.onConfirm();

      expect(emitted).toBe(true);
    });

    /** Guarda de seguridad: confirmar sin coincidencia no debe emitir aunque se invoque el handler. */
    it('should not emit confirmed when the name does not match', () => {
      const fixture = createDialog({ entityLabel: 'Programa de prueba' });
      const c = fixture.componentInstance;
      let emitted = false;
      c.confirmed.subscribe(() => (emitted = true));

      c.typed.set('otro');
      c.onConfirm();

      expect(emitted).toBe(false);
    });

    it('should emit cancelled and request closing on cancel', () => {
      const fixture = createDialog();
      const c = fixture.componentInstance;
      let cancelled = false;
      let visibleChange: boolean | undefined;
      c.cancelled.subscribe(() => (cancelled = true));
      c.visibleChange.subscribe((v) => (visibleChange = v));

      c.onCancel();

      expect(cancelled).toBe(true);
      expect(visibleChange).toBe(false);
    });

    /** Al cerrarse, descarta lo tecleado para no arrastrar texto a la próxima apertura. */
    it('should reset the typed text when visible becomes false', () => {
      const fixture = createDialog({ visible: true });
      const c = fixture.componentInstance;
      c.typed.set('algo escrito');

      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();

      expect(c.typed()).toBe('');
    });
  });

  describe('affected content', () => {
    it('should summarize the resources count for a programa', () => {
      const fixture = createDialog({ entityKind: 'programa' });
      fixture.componentRef.setInput('itemsCount', 12);
      fixture.detectChanges();

      const summary = fixture.nativeElement.querySelector('[data-testid="affected-summary"]');
      expect(summary.textContent).toContain('12');
      expect(summary.textContent.toLowerCase()).toContain('recurso');
    });

    it('should summarize a single recurso as permanent without a count', () => {
      const fixture = createDialog({ entityKind: 'recurso' });
      const summary = fixture.nativeElement.querySelector('[data-testid="affected-summary"]');
      expect(summary.textContent).toContain('Se eliminará el recurso de forma permanente');
    });

    it('should render the list of affected titles', () => {
      const fixture = createDialog();
      fixture.componentRef.setInput('itemsCount', 2);
      fixture.componentRef.setInput('affectedTitles', ['Recurso A', 'Recurso B']);
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('[data-testid="affected-titles"] li');
      expect(items.length).toBe(2);
    });

    /** Cuando el total supera lo listado, se muestra "y N más" sin traer cientos de títulos. */
    it('should show a truncation hint when the total exceeds the listed titles', () => {
      const fixture = createDialog();
      fixture.componentRef.setInput('itemsCount', 5);
      fixture.componentRef.setInput('affectedTitles', ['A', 'B', 'C']);
      fixture.detectChanges();

      const more = fixture.nativeElement.querySelector('[data-testid="affected-more"]');
      expect(more).toBeTruthy();
      expect(more.textContent).toContain('2');
    });

    it('should show the loading spinner while content is loading', () => {
      const fixture = createDialog();
      fixture.componentRef.setInput('loadingContent', true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="affected-loading"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="affected-summary"]')).toBeNull();
    });

    /** Si falla el detalle, se avisa pero no se bloquea el borrado (la confirmación por escritura es la salvaguarda). */
    it('should show an error notice when the detail failed to load', () => {
      const fixture = createDialog();
      fixture.componentRef.setInput('loadError', true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="affected-error"]')).toBeTruthy();
    });

    it('should summarize programs and resources for a subdireccion', () => {
      const fixture = createDialog({ entityKind: 'subdireccion' });
      fixture.componentRef.setInput('programsCount', 3);
      fixture.componentRef.setInput('itemsCount', 10);
      fixture.detectChanges();

      const summary = fixture.nativeElement.querySelector('[data-testid="affected-summary"]');
      expect(summary.textContent).toContain('3');
      expect(summary.textContent).toContain('10');
      expect(summary.textContent.toLowerCase()).toContain('programa');
      expect(summary.textContent.toLowerCase()).toContain('recurso');
    });
  });
});
