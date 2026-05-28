import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';

import { BitstreamBundleManagerComponent } from './bitstream-bundle-manager.component';
import { Bitstream } from '../../../core/api/models/bitstream.model';

/**
 * Tests de `BitstreamBundleManagerComponent`.
 *
 * Componente presentacional de la sección "archivos actuales" compartida por
 * los tres submission forms (Documento, Galería, Estadística). Recibe la lista
 * de bitstreams y el set de marcados para borrar; emite la intención del
 * usuario (toggle, cambio de página) sin contener lógica de negocio.
 *
 * Ciclo 18 TDD — Sprint 7.
 */

function bitstream(uuid: string, name: string, sizeBytes = 2048): Bitstream {
  return {
    uuid,
    name,
    handle: null,
    metadata: {},
    sizeBytes,
    checkSum: { checkSumAlgorithm: 'MD5', value: 'x' },
    sequenceId: null,
    type: 'bitstream',
  };
}

const TWO: Bitstream[] = [bitstream('a', 'uno.pdf'), bitstream('b', 'dos.pdf')];

describe('BitstreamBundleManagerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BitstreamBundleManagerComponent],
      providers: [provideNoopAnimations()],
    });
  });

  function create(inputs: Partial<{
    bitstreams: Bitstream[];
    pendingDeletes: ReadonlySet<string>;
    label: string;
    emptyMessage: string;
    total: number;
    size: number;
    page: number;
  }>) {
    const fixture = TestBed.createComponent(BitstreamBundleManagerComponent);
    const c = fixture.componentInstance;
    c.bitstreams = inputs.bitstreams ?? [];
    c.pendingDeletes = inputs.pendingDeletes ?? new Set();
    if (inputs.label !== undefined) c.label = inputs.label;
    if (inputs.emptyMessage !== undefined) c.emptyMessage = inputs.emptyMessage;
    if (inputs.total !== undefined) c.total = inputs.total;
    if (inputs.size !== undefined) c.size = inputs.size;
    if (inputs.page !== undefined) c.page = inputs.page;
    fixture.detectChanges();
    return fixture;
  }

  /** Verifica que renderice una fila por bitstream de la lista. */
  it('should render one row per bitstream', () => {
    const fixture = create({ bitstreams: TWO });
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(2);
  });

  /** Verifica que el span del bitstream marcado lleve la clase line-through. */
  it('should apply line-through to bitstreams marked for deletion', () => {
    const fixture = create({ bitstreams: TWO, pendingDeletes: new Set(['a']) });
    const rows = fixture.nativeElement.querySelectorAll('li');
    expect(rows[0].querySelector('span').classList.contains('line-through')).toBe(true);
    expect(rows[1].querySelector('span').classList.contains('line-through')).toBe(false);
  });

  /** Verifica que isPending refleje la pertenencia al set de marcados. */
  it('should expose isPending based on the pendingDeletes set', () => {
    const fixture = create({ bitstreams: TWO, pendingDeletes: new Set(['b']) });
    const c = fixture.componentInstance;
    expect(c.isPending('b')).toBe(true);
    expect(c.isPending('a')).toBe(false);
  });

  /** Verifica que onToggle emita el uuid clickeado por el output toggleDelete. */
  it('should emit toggleDelete with the uuid on toggle', () => {
    const fixture = create({ bitstreams: TWO });
    const c = fixture.componentInstance;
    let emitted: string | undefined;
    c.toggleDelete.subscribe((uuid) => (emitted = uuid));

    c.onToggle('a');

    expect(emitted).toBe('a');
  });

  /** Verifica que muestre el mensaje vacío configurable cuando no hay bitstreams. */
  it('should show the configurable empty message when there are no bitstreams', () => {
    const fixture = create({ bitstreams: [], emptyMessage: 'No hay archivo cargado.' });
    expect(fixture.nativeElement.textContent).toContain('No hay archivo cargado.');
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(0);
  });

  /** Verifica que el paginador solo aparezca cuando size > 0 y total > size. */
  it('should render the paginator only when size > 0 and total exceeds size', () => {
    const conPaginador = create({ bitstreams: TWO, total: 400, size: 20, page: 0 });
    expect(conPaginador.debugElement.query(By.css('p-paginator'))).toBeTruthy();

    const sinPaginador = create({ bitstreams: TWO, total: 2, size: 0 });
    expect(sinPaginador.debugElement.query(By.css('p-paginator'))).toBeNull();
  });

  /** Verifica que onPage reemita el evento por el output pageChange. */
  it('should re-emit the paginator event through pageChange', () => {
    const fixture = create({ bitstreams: TWO, total: 400, size: 20 });
    const c = fixture.componentInstance;
    let received: { page?: number } | undefined;
    c.pageChange.subscribe((ev) => (received = ev));

    c.onPage({ page: 3 });

    expect(received?.page).toBe(3);
  });

  /** Verifica que el label de la sección sea configurable. */
  it('should render the configurable section label', () => {
    const fixture = create({ bitstreams: TWO, label: 'Excel actual' });
    expect(fixture.nativeElement.textContent).toContain('Excel actual');
  });
});
