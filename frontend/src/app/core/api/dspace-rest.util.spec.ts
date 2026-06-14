import { firstValueFrom, of } from 'rxjs';
import { paginateAll$ } from './dspace-rest.util';

/**
 * Tests de `paginateAll$`.
 *
 * Agota un listado HAL paginado: pide página tras página hasta `totalPages` y
 * acumula los ítems que el caller extrae de cada respuesta. Centraliza el bucle
 * que repetían los wrappers de listados completos del core/api.
 *
 * Ciclo 44 TDD — Sprint 8
 */
describe('paginateAll$', () => {
  interface FakePage {
    page: { number: number; totalPages: number };
    items: number[];
  }

  const fakePage = (number: number, totalPages: number, items: number[]): FakePage => ({
    page: { number, totalPages },
    items,
  });

  /** Verifica que con una sola página haga un único fetch y devuelva sus ítems. */
  it('should fetch only the first page when there is a single page', async () => {
    const fetchPage = vi.fn((_page: number) => of(fakePage(0, 1, [1, 2, 3])));

    const result = await firstValueFrom(paginateAll$(fetchPage, (r) => r.items));

    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0);
  });

  /** Verifica que agote todas las páginas y concatene los ítems en orden. */
  it('should exhaust all pages and concatenate items in order', async () => {
    const pages = [fakePage(0, 3, [1]), fakePage(1, 3, [2]), fakePage(2, 3, [3])];
    const fetchPage = vi.fn((page: number) => of(pages[page]));

    const result = await firstValueFrom(paginateAll$(fetchPage, (r) => r.items));

    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
  });

  /** Verifica que aplique extractItems para mapear los ítems de cada página. */
  it('should apply extractItems to each page response', async () => {
    const fetchPage = vi.fn((_page: number) => of(fakePage(0, 1, [10, 20])));

    const result = await firstValueFrom(paginateAll$(fetchPage, (r) => r.items.map((n) => n * 2)));

    expect(result).toEqual([20, 40]);
  });
});
