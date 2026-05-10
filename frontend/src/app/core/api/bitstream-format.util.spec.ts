import { inferBitstreamFormat } from './bitstream-format.util';

/**
 * Tests de `inferBitstreamFormat`.
 *
 * Helper que resuelve el par (mime, label) a partir de la extensión del
 * archivo. Centralizado para que document-detail, program-view y demás
 * consumidores no dupliquen el switch ni los literales de mime types.
 *
 * Ciclo 16 TDD — Sprint 6.
 */
describe('inferBitstreamFormat', () => {
  /** Verifica que .pdf se infiera como application/pdf con label PDF, ignorando mayúsculas. */
  it('should infer application/pdf with label PDF for .pdf files', () => {
    expect(inferBitstreamFormat('manual.pdf')).toEqual({
      mime: 'application/pdf',
      label: 'PDF',
    });
    // Case-insensitive: extensiones en mayusculas tambien se reconocen.
    expect(inferBitstreamFormat('MANUAL.PDF').mime).toBe('application/pdf');
  });

  /** Verifica que las extensiones ofimáticas (Word, Excel, PowerPoint, modernas y legacy) se infieran correctamente. */
  it('should infer office formats for Word, Excel and PowerPoint extensions', () => {
    expect(inferBitstreamFormat('reporte.docx').mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(inferBitstreamFormat('reporte.docx').label).toBe('Word');
    expect(inferBitstreamFormat('legacy.doc').mime).toBe('application/msword');
    expect(inferBitstreamFormat('legacy.doc').label).toBe('Word');

    expect(inferBitstreamFormat('datos.xlsx').mime).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(inferBitstreamFormat('datos.xlsx').label).toBe('Excel');
    expect(inferBitstreamFormat('legacy.xls').label).toBe('Excel');

    expect(inferBitstreamFormat('clase.pptx').mime).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(inferBitstreamFormat('clase.pptx').label).toBe('PowerPoint');
    expect(inferBitstreamFormat('legacy.ppt').label).toBe('PowerPoint');
  });

  /** Verifica que jpg, jpeg y png se infieran a su mime correspondiente. */
  it('should infer image formats for jpg, jpeg and png', () => {
    expect(inferBitstreamFormat('foto.jpg').mime).toBe('image/jpeg');
    expect(inferBitstreamFormat('foto.jpeg').mime).toBe('image/jpeg');
    expect(inferBitstreamFormat('foto.png').mime).toBe('image/png');
    expect(inferBitstreamFormat('foto.png').label).toBe('PNG');
  });

  /** Verifica que las extensiones OpenDocument y de texto plano se infieran a sus mimes apropiados. */
  it('should infer OpenDocument and plain text formats', () => {
    expect(inferBitstreamFormat('libre.odt').mime).toBe('application/vnd.oasis.opendocument.text');
    expect(inferBitstreamFormat('libre.ods').mime).toBe(
      'application/vnd.oasis.opendocument.spreadsheet',
    );
    expect(inferBitstreamFormat('libre.odp').mime).toBe(
      'application/vnd.oasis.opendocument.presentation',
    );
    expect(inferBitstreamFormat('nota.txt').mime).toBe('text/plain');
    expect(inferBitstreamFormat('rich.rtf').mime).toBe('application/rtf');
    expect(inferBitstreamFormat('tabla.csv').mime).toBe('text/csv');
  });

  /** Verifica que extensiones desconocidas caigan a octet-stream con la extensión cruda en mayúsculas como label. */
  it('should fall back to octet-stream and the raw extension label for unknown files', () => {
    const unknown = inferBitstreamFormat('archivo.xyz');
    expect(unknown.mime).toBe('application/octet-stream');
    // Label deja la extension cruda en mayusculas para que el usuario al menos
    // vea de que tipo es ("XYZ") sin que el componente tenga que adivinar.
    expect(unknown.label).toBe('XYZ');
  });

  /** Verifica que nombres sin extensión y strings vacíos retornen octet-stream sin lanzar excepción. */
  it('should handle filenames without extension and empty strings without throwing', () => {
    expect(inferBitstreamFormat('archivo-sin-extension').mime).toBe('application/octet-stream');
    expect(inferBitstreamFormat('').mime).toBe('application/octet-stream');
  });
});
