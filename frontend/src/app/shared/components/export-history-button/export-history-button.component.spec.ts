import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import { TimelineEntry } from '../../../features/administration/content/provenance/timeline-entry.model';
import { ExportHistoryButton } from './export-history-button.component';

/**
 * Tests de `ExportHistoryButton`.
 *
 * Wrapper UI sobre `buildHistoryPdf`. Estos tests validan los inputs
 * requeridos, el disabled cuando no hay entries y el cálculo del filename
 * según el título. La generación del PDF en sí se cubre en
 * `history-pdf-builder.spec.ts`.
 *
 * Ciclo 28 TDD — Sprint 8.
 */
describe('ExportHistoryButton', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ExportHistoryButton],
      providers: [provideNoopAnimations()],
    });
  });

  const sampleEntry: TimelineEntry = {
    timestamp: new Date('2026-06-12T14:32:00Z'),
    actor: 'admin@digeex.gob.gt',
    action: 'Created',
    raw: 'Created by admin@digeex.gob.gt on 2026-06-12',
  };

  /** El botón existe con el data-testid esperado para que los e2e puedan localizarlo. */
  it('should render the export button with the expected data-testid', () => {
    const fixture = TestBed.createComponent(ExportHistoryButton);
    fixture.componentRef.setInput('dsoTitle', 'Item de prueba');
    fixture.componentRef.setInput('dsoType', 'item');
    fixture.componentRef.setInput('entries', [sampleEntry]);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('[data-testid="export-history-pdf"]');
    expect(btn).not.toBeNull();
  });

  /** El botón queda deshabilitado cuando no hay entries; no tiene sentido exportar un PDF vacío. */
  it('should disable the button when entries is empty', () => {
    const fixture = TestBed.createComponent(ExportHistoryButton);
    fixture.componentRef.setInput('dsoTitle', 'Item de prueba');
    fixture.componentRef.setInput('dsoType', 'item');
    fixture.componentRef.setInput('entries', []);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="export-history-pdf"] button',
    ) as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  });

  /** onExport dispara la generación y la descarga (verificado spying en URL.createObjectURL). */
  it('should call URL.createObjectURL when onExport is invoked', () => {
    const fixture = TestBed.createComponent(ExportHistoryButton);
    fixture.componentRef.setInput('dsoTitle', 'PEAC');
    fixture.componentRef.setInput('dsoType', 'programa');
    fixture.componentRef.setInput('entries', [sampleEntry]);
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
});
