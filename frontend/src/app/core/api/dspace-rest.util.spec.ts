import { firstValueFrom, of } from 'rxjs';
import { paginateAll$, paginateAllByNext$ } from './dspace-rest.util';

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

/**
 * Tests de `paginateAllByNext$`.
 *
 * Variante de `paginateAll$` para endpoints que no exponen `totalPages` y
 * señalizan el avance con `_links.next` (las facetas de Discovery). Agota las
 * páginas siguiendo el next-link hasta que deja de venir.
 *
 * Ciclo 3 TDD — Sprint 9
 */
describe('paginateAllByNext$', () => {
  interface FakeFacetPage {
    page: { number: number };
    _links: { next?: { href: string }; self: { href: string } };
    values: number[];
  }

  const fakeFacetPage = (number: number, values: number[], hasNext: boolean): FakeFacetPage => ({
    page: { number },
    _links: hasNext
      ? { next: { href: `?page=${number + 1}` }, self: { href: `?page=${number}` } }
      : { self: { href: `?page=${number}` } },
    values,
  });

  /** Verifica que con una sola página (sin next) haga un único fetch. */
  it('should fetch only the first page when there is no next link', async () => {
    const fetchPage = vi.fn((_page: number) => of(fakeFacetPage(0, [1, 2], false)));

    const result = await firstValueFrom(paginateAllByNext$(fetchPage, (r) => r.values));

    expect(result).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0);
  });

  /** Verifica que siga los next-links hasta agotarlos y concatene en orden. */
  it('should follow next links until exhausted and concatenate in order', async () => {
    const pages = [
      fakeFacetPage(0, [1], true),
      fakeFacetPage(1, [2], true),
      fakeFacetPage(2, [3], false),
    ];
    const fetchPage = vi.fn((page: number) => of(pages[page]));

    const result = await firstValueFrom(paginateAllByNext$(fetchPage, (r) => r.values));

    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([0, 1, 2]);
  });

  /** Verifica que aplique extractItems a cada respuesta de página. */
  it('should apply extractItems to each page response', async () => {
    const fetchPage = vi.fn((_page: number) => of(fakeFacetPage(0, [10, 20], false)));

    const result = await firstValueFrom(paginateAllByNext$(fetchPage, (r) => r.values.map((n) => n * 2)));

    expect(result).toEqual([20, 40]);
  });
});
