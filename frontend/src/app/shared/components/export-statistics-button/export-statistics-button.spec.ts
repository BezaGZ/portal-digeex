import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';
import { LoadedReport } from '../../../core/api/models/usage-report.model';
import { ExportStatisticsButton } from './export-statistics-button';

/**
 * Tests de `ExportStatisticsButton`.
 *
 * Wrapper UI sobre `buildStatisticsPdf`. Estos tests validan el render del
 * botón, el disabled cuando todos los reports fallaron y el disparo de la
 * descarga con el filename `estadisticas-{slug}-{fecha}.pdf`. La generación
 * del PDF en sí se cubre en `statistics-pdf-builder.spec.ts`.
 *
 * Ciclo 29 TDD — Sprint 8.
 */
describe('ExportStatisticsButton', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExportStatisticsButton],
      providers: [provideNoopAnimations()],
    });
  });

  const sampleReports: LoadedReport[] = [
    {
      reportType: 'TotalVisits',
      report: {
        id: 'uuid_TotalVisits',
        reportType: 'TotalVisits',
        points: [{ id: 'p1', label: 'Item de prueba', values: { views: 4 } }],
      },
    },
  ];

  /** El botón existe con el data-testid esperado para que los e2e puedan localizarlo. */
  it('should render the export button with the expected data-testid', () => {
    const fixture = TestBed.createComponent(ExportStatisticsButton);
    fixture.componentRef.setInput('dsoTitle', 'Item de prueba');
    fixture.componentRef.setInput('dsoType', 'item');
    fixture.componentRef.setInput('reports', sampleReports);
    fixture.componentRef.setInput('monthsBack', 12);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('[data-testid="export-statistics-pdf"]');
    expect(btn).not.toBeNull();
  });

  /** El botón queda deshabilitado cuando todos los reports fallaron; no hay nada que exportar. */
  it('should disable the button when every report is null', () => {
    const fixture = TestBed.createComponent(ExportStatisticsButton);
    fixture.componentRef.setInput('dsoTitle', 'Item de prueba');
    fixture.componentRef.setInput('dsoType', 'item');
    fixture.componentRef.setInput('reports', [
      { reportType: 'TotalVisits', report: null },
      { reportType: 'TotalDownloads', report: null },
    ] satisfies LoadedReport[]);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="export-statistics-pdf"] button',
    ) as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  /** onExport dispara la generación y la descarga (verificado spying en URL.createObjectURL). */
  it('should call URL.createObjectURL when onExport is invoked', () => {
    const fixture = TestBed.createComponent(ExportStatisticsButton);
    fixture.componentRef.setInput('dsoTitle', 'PEAC');
    fixture.componentRef.setInput('dsoType', 'collection');
    fixture.componentRef.setInput('reports', sampleReports);
    fixture.detectChanges();

    // jsdom no implementa URL.createObjectURL ni revokeObjectURL; los stubeamos
    // a vi.fn() directamente sobre el objeto URL antes de spy-arlos.
    const original = {
      create: (URL as unknown as { createObjectURL?: unknown }).createObjectURL,
      revoke: (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL,
    };
    const createMock = vi.fn().mockReturnValue('blob:fake');
    const revokeMock = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createMock;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeMock;

    fixture.componentInstance.onExport();
    expect(createMock).toHaveBeenCalled();

    (URL as unknown as { createObjectURL: unknown }).createObjectURL = original.create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = original.revoke;
  });

  /** El filename sigue el patrón estadisticas-{slug}-{YYYY-MM-DD}.pdf con el slug del título. */
  it('should download with the estadisticas-{slug}-{date}.pdf filename', () => {
    const fixture = TestBed.createComponent(ExportStatisticsButton);
    fixture.componentRef.setInput('dsoTitle', 'PEAC — Programa de Educación Acelerada');
    fixture.componentRef.setInput('dsoType', 'collection');
    fixture.componentRef.setInput('reports', sampleReports);
    fixture.detectChanges();

    const original = {
      create: (URL as unknown as { createObjectURL?: unknown }).createObjectURL,
      revoke: (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL,
    };
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi
      .fn()
      .mockReturnValue('blob:fake');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });

    fixture.componentInstance.onExport();

    const today = new Date().toISOString().slice(0, 10);
    expect(downloads).toEqual([`estadisticas-peac-programa-de-educacion-acelerada-${today}.pdf`]);

    clickSpy.mockRestore();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = original.create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = original.revoke;
  });
});
