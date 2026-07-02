import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

import { FileDropzoneComponent } from './file-dropzone';

/**
 * Tests del componente compartido FileDropzone.
 *
 * Envuelve `<p-fileupload>` de PrimeNG 20 con templates customizados que
 * (1) esconden los botones Upload/Cancel inertes (el upload lo orquesta el
 * facade, no PrimeNG), (2) muestran un dropzone visual cuando está vacío,
 * y (3) renderizan cada archivo en una fila limpia con remove individual.
 *
 * Reusable para Documento, Galería, Estadística y cualquier otro form que
 * necesite seleccionar archivos sin el chrome default de PrimeNG.
 *
 * Ciclo 26 TDD - Sprint 6. Ajustado en Ciclo 21 (Sprint 10: método clear) y
 * Ciclo 52 (Sprint 10: tope opcional de tamaño maxSizeMb).
 */
describe('FileDropzoneComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    }).compileComponents();
  });

  /** Verifica que el input accept se propague al input nativo del p-fileupload subyacente. */
  it('should bind the accept input to the underlying file input', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.componentRef.setInput('accept', '.pdf,.docx');
    fixture.detectChanges();

    const nativeInput = fixture.nativeElement.querySelector(
      'p-fileupload input[type="file"]',
    ) as HTMLInputElement | null;
    expect(nativeInput).not.toBeNull();
    expect(nativeInput!.accept).toContain('.pdf');
    expect(nativeInput!.accept).toContain('.docx');
  });

  /** Verifica que los botones Subir y Cancelar de PrimeNG queden ocultos en este wrapper. */
  it('should hide the Upload and Cancel buttons (advanced mode without customUpload chrome)', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.detectChanges();

    // Los 2 botones inertes que PrimeNG renderiza por default no deben existir
    // — el upload real lo orquesta el facade desde fuera del componente.
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).not.toContain('Subir');
    expect(text).not.toContain('Cancelar');
  });

  /** Verifica que el output filesChange emita cuando el usuario selecciona archivos. */
  it('should emit filesChange when the user selects files', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const emitted: File[][] = [];
    c.filesChange.subscribe((files) => emitted.push(files));

    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    c.onSelect({ files: [pdf], currentFiles: [pdf] });
    expect(emitted.length).toBe(1);
    expect(emitted[0][0].name).toBe('a.pdf');
  });

  /** Verifica que con maxSizeMb un archivo que excede el tope se rechace con aviso y no se emita. */
  it('should reject files over maxSizeMb and expose a rejection message', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    const c = fixture.componentInstance;
    c.maxSizeMb = 1;
    fixture.detectChanges();

    const small = new File([new Uint8Array(1024)], 'ok.mp4');
    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'grande.mp4');
    const emitted: File[][] = [];
    c.filesChange.subscribe((files) => emitted.push(files));

    c.onSelect({ files: [small, big], currentFiles: [small, big] });

    expect(emitted[0].map((f) => f.name)).toEqual(['ok.mp4']);
    expect(c.rejectedBySize()).toEqual(['grande.mp4']);
  });

  /** Verifica que el aviso de rechazo no sobreviva a una limpieza de la selección. */
  it('should reset the rejection message when the selection is cleared', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    const c = fixture.componentInstance;
    c.maxSizeMb = 1;
    fixture.detectChanges();

    c.onSelect({ files: [new File([new Uint8Array(2 * 1024 * 1024)], 'grande.mp4')] });
    expect(c.rejectedBySize()).toEqual(['grande.mp4']);

    c.onClear();

    expect(c.rejectedBySize()).toEqual([]);
  });

  /** Verifica que sin maxSizeMb no se valide tamaño: todo pasa y sin avisos. */
  it('should not validate size when maxSizeMb is not set', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();

    const big = new File([new Uint8Array(2 * 1024 * 1024)], 'grande.mp4');
    const emitted: File[][] = [];
    c.filesChange.subscribe((files) => emitted.push(files));

    c.onSelect({ files: [big], currentFiles: [big] });

    expect(emitted[0].map((f) => f.name)).toEqual(['grande.mp4']);
    expect(c.rejectedBySize()).toEqual([]);
  });

  /** Verifica que filesChange emita un array vacío cuando el usuario limpia los archivos. */
  it('should emit an empty array when the user clears all files', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const emitted: File[][] = [];
    c.filesChange.subscribe((files) => emitted.push(files));

    c.onClear();
    expect(emitted[emitted.length - 1]).toEqual([]);
  });

  /**
   * Verifica que al quitar un archivo de una selección múltiple emita los
   * restantes, no la lista completa. `FileUpload.remove` de PrimeNG 20 emite
   * onRemove ANTES de hacer el splice, así que `pfu.files` todavía trae el
   * archivo removido; el wrapper lo descarta usando `event.file`.
   */
  it('should emit the remaining files (not the full list) when one file is removed from a multiple selection', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const emitted: File[][] = [];
    c.filesChange.subscribe((files) => emitted.push(files));

    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    const f3 = new File(['c'], 'c.jpg', { type: 'image/jpeg' });
    // PrimeNG emite el archivo removido (f1) con la lista aún sin recortar.
    c.onRemove({ file: f1 }, [f1, f2, f3]);

    expect(emitted[emitted.length - 1].map((f) => f.name)).toEqual(['b.jpg', 'c.jpg']);
  });

  /**
   * Verifica que clear() delegue en el clear() nativo del p-fileUpload para
   * limpiar su lista interna de archivos, que el reset de signals de los forms
   * no toca.
   */
  it('should delegate to the underlying p-fileUpload clear when clear() is called', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const inner = (c as unknown as { fileUpload?: { clear: () => void } }).fileUpload;
    const spy = vi.spyOn(inner!, 'clear');

    c.clear();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifica que clear() emita filesChange exactamente una vez: el clear()
   * nativo dispara onClear, que ya emite []. El wrapper no re-emite.
   */
  it('should emit filesChange exactly once when clear() is called (no double emit)', () => {
    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;

    const emitted: File[][] = [];
    c.filesChange.subscribe((files) => emitted.push(files));

    c.clear();

    expect(emitted.length).toBe(1);
    expect(emitted[0]).toEqual([]);
  });
});
