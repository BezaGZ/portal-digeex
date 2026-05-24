import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { TagsChartComponent } from './tags-chart';
import { ChartConfig } from '../../../models/stats-dashboard.model';

/**
 * Tests de `TagsChartComponent`.
 *
 * Renderiza los items como tarjetas/chips en grid auto-fit, sin conteo.
 * Replica la franja de programas del dashboard de PowerBI de DIGEEX donde
 * cada programa aparece como un cuadro azul con su nombre.
 *
 * Ciclo 11 TDD — Sprint 7.
 */

const SAMPLE_CONFIG: ChartConfig = {
  type: 'tags',
  title: 'Programas',
  data: [
    { label: 'CENTRO PEDAGOGICO', value: 5 },
    { label: 'CEMUCAF', value: 181 },
    { label: 'MODALIDADES FLEXIBLES', value: 289 },
    { label: 'PEAC', value: 163 },
    { label: 'PRONEA', value: 145 },
  ],
};

describe('TagsChartComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TagsChartComponent] });
  });

  /** Renderiza un cuadro por cada item del data array preservando el orden. */
  it('should render one tag per data label preserving order', () => {
    const fixture = TestBed.createComponent(TagsChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();

    const tags = fixture.debugElement.queryAll(By.css('div.rounded-lg'));
    expect(tags.length).toBe(5);
    expect(tags[0].nativeElement.textContent.trim()).toBe('CENTRO PEDAGOGICO');
    expect(tags[1].nativeElement.textContent.trim()).toBe('CEMUCAF');
  });

  /** No expone valores numéricos: el chip solo muestra el label. */
  it('should not render numeric values inside the tags', () => {
    const fixture = TestBed.createComponent(TagsChartComponent);
    fixture.componentRef.setInput('config', SAMPLE_CONFIG);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('289');
    expect(text).not.toContain('181');
  });

  /** Cuando data está vacío muestra el placeholder neutro. */
  it('should show an empty placeholder when data is empty', () => {
    const fixture = TestBed.createComponent(TagsChartComponent);
    fixture.componentRef.setInput('config', { ...SAMPLE_CONFIG, data: [] });
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('div.rounded-lg')).length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Sin registros');
  });
});
