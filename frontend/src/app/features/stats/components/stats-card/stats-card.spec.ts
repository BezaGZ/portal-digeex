import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { StatsCardComponent } from './stats-card';
import { StatsItem } from '../../models/stats-item.model';

/**
 * Tests de `StatsCardComponent`.
 *
 * Card del listado público de Estadística. Muestra icono fijo de stats,
 * título, descripción opcional, fecha y botón. El dataset (docentes /
 * estudiantes) no se expone visualmente: la decisión del visitante se
 * basa en título y descripción, no en la key interna del dataset. Click
 * sobre la card o el botón emite `open` con el uuid.
 *
 * Ciclo 10 TDD — Sprint 7.
 */

const SAMPLE_ITEM: StatsItem = {
  uuid: 'item-1',
  title: 'Docentes Técnicos 2026',
  abstract: 'Personal técnico docente de DIGEEX al cierre del ciclo 2026.',
  dataset: 'docentes',
  issued: '2026-05-21',
};

describe('StatsCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatsCardComponent] });
  });

  /** Renderiza el título tal como viene en el item. */
  it('should render the item title verbatim', () => {
    const fixture = TestBed.createComponent(StatsCardComponent);
    fixture.componentRef.setInput('item', SAMPLE_ITEM);
    fixture.detectChanges();

    const heading = fixture.debugElement.query(By.css('h3'));
    expect(heading.nativeElement.textContent.trim()).toBe('Docentes Técnicos 2026');
  });

  /** Renderiza la descripción truncada (line-clamp-3) cuando viene presente. */
  it('should render the abstract truncated in the card body', () => {
    const fixture = TestBed.createComponent(StatsCardComponent);
    fixture.componentRef.setInput('item', SAMPLE_ITEM);
    fixture.detectChanges();

    const paragraphs = fixture.debugElement.queryAll(By.css('p.line-clamp-3'));
    const textContents = paragraphs.map((p) => p.nativeElement.textContent).join(' ');
    expect(textContents).toContain('Personal técnico docente');
  });

  /** Click sobre el card emite `open` con el uuid del item. */
  it('should emit open with the item uuid when clicked', () => {
    const fixture = TestBed.createComponent(StatsCardComponent);
    fixture.componentRef.setInput('item', SAMPLE_ITEM);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    let emitted: string | undefined;
    c.open.subscribe((uuid) => (emitted = uuid));
    c.emitOpen();

    expect(emitted).toBe('item-1');
  });

  /** Click sobre el icono info abre el dialog y detiene la propagación. */
  it('should open the info dialog and stop propagation on info icon click', () => {
    const fixture = TestBed.createComponent(StatsCardComponent);
    fixture.componentRef.setInput('item', SAMPLE_ITEM);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    expect(c.showInfoDialog()).toBe(false);

    const stopPropagation = vi.fn();
    c.openInfo({ stopPropagation } as unknown as MouseEvent);

    expect(stopPropagation).toHaveBeenCalled();
    expect(c.showInfoDialog()).toBe(true);
  });

  /** closeInfo cierra el dialog dejando showInfoDialog en false. */
  it('should close the info dialog via closeInfo', () => {
    const fixture = TestBed.createComponent(StatsCardComponent);
    fixture.componentRef.setInput('item', SAMPLE_ITEM);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    c.openInfo({ stopPropagation: () => undefined } as unknown as MouseEvent);
    expect(c.showInfoDialog()).toBe(true);

    c.closeInfo();
    expect(c.showInfoDialog()).toBe(false);
  });
});
