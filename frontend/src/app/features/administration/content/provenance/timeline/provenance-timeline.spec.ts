import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { ProvenanceTimeline } from './provenance-timeline';
import { TimelineEntry } from '../../../../../core/provenance/timeline-entry.model';

/**
 * Tests de `ProvenanceTimeline`.
 *
 * Componente presentacional puro que renderiza `TimelineEntry[]` como línea
 * de tiempo accesible. Estructura semántica `<ol aria-label>` + `<li>` +
 * `<time datetime>` para que screen readers parseen las fechas. Empty-state
 * con `data-testid` para los recursos sin provenance escrito.
 *
 * Ciclo 15 TDD — Sprint 8. Ajustado en Ciclo 20 (Sprint 8).
 */
describe('ProvenanceTimeline', () => {
  function buildEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
    return {
      timestamp: new Date('2026-06-04T05:50:51Z'),
      actor: 'Administrador DIGEEX (admin@mineduc.gob.gt)',
      action: 'Submitted',
      raw: 'Submitted by Administrador DIGEEX (admin@mineduc.gob.gt) on 2026-06-04T05:50:51Z',
      ...overrides,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProvenanceTimeline],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  /** Verifica que con `entries` no vacío se renderice `<ol aria-label="Historial de actividad">`. */
  it('should render <ol aria-label="Historial de actividad"> when entries is not empty', () => {
    const fixture = TestBed.createComponent(ProvenanceTimeline);
    fixture.componentRef.setInput('entries', [buildEntry()]);
    fixture.detectChanges();

    const ol = fixture.nativeElement.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol.getAttribute('aria-label')).toBe('Historial de actividad');
  });

  /** Verifica que se renderice una `<li>` por cada `TimelineEntry` del input. */
  it('should render one <li> per entry', () => {
    const fixture = TestBed.createComponent(ProvenanceTimeline);
    fixture.componentRef.setInput('entries', [
      buildEntry({ action: 'Submitted' }),
      buildEntry({ action: 'Made available', actor: null }),
      buildEntry({ action: 'Edited', actor: 'Beza Ramos (beza@mineduc.gob.gt)' }),
    ]);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('ol > li');
    expect(items.length).toBe(3);
  });

  /** Verifica que cada `<li>` con timestamp exponga `<time datetime>` con el ISO; sin timestamp omite el atributo. */
  it('should expose <time datetime> with the ISO timestamp, omitting the attribute when timestamp is null', () => {
    const fixture = TestBed.createComponent(ProvenanceTimeline);
    fixture.componentRef.setInput('entries', [
      buildEntry({ timestamp: new Date('2026-06-04T05:50:51Z') }),
      buildEntry({ timestamp: null, action: 'Unknown', actor: null, raw: 'algo raro' }),
    ]);
    fixture.detectChanges();

    const times = fixture.nativeElement.querySelectorAll('time');
    expect(times.length).toBe(1);
    expect(times[0].getAttribute('datetime')).toBe('2026-06-04T05:50:51.000Z');
  });

  /** Verifica que con `entries` vacío se renderice el empty-state con `data-testid="provenance-timeline-empty"`. */
  it('should render the empty-state with data-testid="provenance-timeline-empty" when entries is empty', () => {
    const fixture = TestBed.createComponent(ProvenanceTimeline);
    fixture.componentRef.setInput('entries', []);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('[data-testid="provenance-timeline-empty"]');
    expect(empty).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ol')).toBeNull();
  });

  /** Verifica que entradas conocidas muestren actor + action traducida; entradas con action="Unknown" muestren el `raw` plano. */
  it('should render actor + localized action for known entries and the raw text for unknown entries', () => {
    const fixture = TestBed.createComponent(ProvenanceTimeline);
    fixture.componentRef.setInput('entries', [
      buildEntry({ action: 'Submitted', actor: 'Jane Doe (jdoe@example.com)' }),
      buildEntry({
        action: 'Unknown',
        actor: null,
        timestamp: null,
        raw: 'Some custom non-standard provenance note',
      }),
    ]);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('ol > li');
    expect(items[0].textContent).toContain('Jane Doe (jdoe@example.com)');
    expect(items[0].textContent).toContain('Subido');
    expect(items[1].textContent).toContain('Some custom non-standard provenance note');
  });

  /** Verifica las 5 traducciones canónicas del vocabulario del parser. */
  it('should translate the 5 canonical actions to Spanish labels', () => {
    const fixture = TestBed.createComponent(ProvenanceTimeline);
    const cmp = fixture.componentInstance;

    expect(cmp.actionLabel('Submitted')).toBe('Subido');
    expect(cmp.actionLabel('Made available')).toBe('Publicado');
    expect(cmp.actionLabel('Created')).toBe('Creado');
    expect(cmp.actionLabel('Edited')).toBe('Editado');
    expect(cmp.actionLabel('Withdrawn')).toBe('Retirado');
    expect(cmp.actionLabel('Reinstated')).toBe('Restaurado');
    expect(cmp.actionLabel('SomethingCustom')).toBe('SomethingCustom');
  });
});
