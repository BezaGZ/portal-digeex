import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { BitstreamDownloadService } from './bitstream-download.service';
import { BitstreamView } from './models/view.model';

/**
 * Tests de BitstreamDownloadService.
 *
 * Centraliza la descarga de bitstreams para que el detalle del item y la
 * card del listado compartan la misma lógica. downloadAuto decide solo:
 * un bitstream baja directo via <a download>, varios se empaquetan en ZIP
 * via JSZip (lazy import).
 *
 * Ciclo 20 TDD - Sprint 6.
 */
describe('BitstreamDownloadService', () => {
  let service: BitstreamDownloadService;

  const pdfBitstream: BitstreamView = {
    name: 'manual.pdf',
    url: '/server/api/core/bitstreams/uuid-pdf/content',
    size: 1000,
    format: 'application/pdf',
    formatLabel: 'PDF',
    uuid: 'uuid-pdf',
  };
  const docxBitstream: BitstreamView = {
    name: 'anexo.docx',
    url: '/server/api/core/bitstreams/uuid-docx/content',
    size: 500,
    format: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    formatLabel: 'Word',
    uuid: 'uuid-docx',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BitstreamDownloadService);
  });

  /** Verifica que un único bitstream se descargue directo creando un anchor con atributo download. */
  it('should download a single bitstream directly via <a download>', async () => {
    const fakeAnchor = { click: vi.fn(), href: '', download: '' };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return fakeAnchor as unknown as HTMLAnchorElement;
      return realCreate(tag);
    });

    await service.downloadAuto([pdfBitstream], 'item');

    expect(fakeAnchor.href).toBe('/server/api/core/bitstreams/uuid-pdf/content');
    expect(fakeAnchor.download).toBe('manual.pdf');
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
  });

  /** Verifica que múltiples bitstreams se empaqueten en un ZIP y disparen una sola descarga. */
  it('should bundle multiple bitstreams into a ZIP and trigger a single download', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['x'], { type: 'application/octet-stream' })),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = vi.fn().mockReturnValue('blob:mock-zip');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = vi.fn();

    const fakeAnchor = { click: vi.fn(), href: '', download: '' };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return fakeAnchor as unknown as HTMLAnchorElement;
      return realCreate(tag);
    });

    await service.downloadAuto([pdfBitstream, docxBitstream], 'mi-item');

    expect(fetchMock).toHaveBeenCalledWith('/server/api/core/bitstreams/uuid-pdf/content');
    expect(fetchMock).toHaveBeenCalledWith('/server/api/core/bitstreams/uuid-docx/content');
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
    expect(fakeAnchor.download).toBe('mi-item.zip');
  });

  /** Verifica que con lista vacía no se dispare ninguna descarga. */
  it('should be a no-op when the bitstream list is empty', async () => {
    const fakeAnchor = { click: vi.fn(), href: '', download: '' };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return fakeAnchor as unknown as HTMLAnchorElement;
      return realCreate(tag);
    });

    await service.downloadAuto([], 'vacio');

    expect(fakeAnchor.click).not.toHaveBeenCalled();
  });
});
