import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { subdireccionNames$ } from './subdireccion-options.util';
import { CommunityApiService } from '../../../core/api/community-api.service';

/**
 * Tests del helper `subdireccionNames$`.
 *
 * Resuelve los nombres de las subdirecciones (subcomunidades de la raíz DIGEEX)
 * para el desplegable editable de autor de los formularios de submission. Las
 * fuentes son `searchTop` y `listAllSubcommunities` del contrato de communities.
 *
 * Ciclo 46 TDD — Sprint 10.
 */
describe('subdireccionNames$', () => {
  function apiMock(
    overrides: Partial<Record<'searchTop' | 'listAllSubcommunities', unknown>> = {},
  ): CommunityApiService {
    return {
      searchTop: vi.fn().mockReturnValue(of({ _embedded: { communities: [{ uuid: 'root' }] } })),
      listAllSubcommunities: vi.fn().mockReturnValue(of([])),
      ...overrides,
    } as unknown as CommunityApiService;
  }

  /** Las fuentes son síncronas (of), así que un subscribe basta para capturar el resultado. */
  function collect(api: CommunityApiService): string[] {
    let names: string[] = ['__unset__'];
    subdireccionNames$(api).subscribe((n) => (names = n));
    return names;
  }

  /** Verifica que devuelva los nombres de las subcomunidades de la raíz, ordenados. */
  it('should resolve the sorted names of the root subcommunities', () => {
    const api = apiMock({
      listAllSubcommunities: vi.fn().mockReturnValue(
        of([
          { uuid: 's1', name: 'Extraescolar', handle: '', type: 'community', metadata: {} },
          { uuid: 's2', name: 'Básica', handle: '', type: 'community', metadata: {} },
        ]),
      ),
    });

    expect(collect(api)).toEqual(['Básica', 'Extraescolar']);
  });

  /** Verifica que devuelva lista vacía cuando no hay comunidad raíz. */
  it('should resolve an empty list when there is no root community', () => {
    const api = apiMock({
      searchTop: vi.fn().mockReturnValue(of({ _embedded: { communities: [] } })),
    });

    expect(collect(api)).toEqual([]);
  });

  /** Verifica que devuelva lista vacía ante un error, sin lanzar. */
  it('should resolve an empty list on error without throwing', () => {
    const api = apiMock({
      searchTop: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
    });

    expect(collect(api)).toEqual([]);
  });
});
