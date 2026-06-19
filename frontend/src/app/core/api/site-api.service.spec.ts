import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { SiteApiService } from './site-api.service';

/**
 * Tests de SiteApiService.
 *
 * Wrapper de /api/core/sites: DSpace lo expone como listado HAL aunque
 * siempre hay un unico Site raiz. getSiteRoot$ devuelve el primero, o null
 * si el listado viene vacio.
 *
 * Ciclo 25 TDD — Sprint 9.
 */
describe('SiteApiService', () => {
  let service: SiteApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SiteApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** El listado siempre trae un Site; se toma el primero con su self href. */
  it('should return the first site from /core/sites', () => {
    let result: { uuid: string; href: string } | null = null;
    service.getSiteRoot$().subscribe((site) => {
      result = site ? { uuid: site.uuid, href: site._links.self.href } : null;
    });

    const req = httpMock.expectOne('/server/api/core/sites');
    expect(req.request.method).toBe('GET');
    req.flush({
      _embedded: {
        sites: [
          {
            uuid: 'site-root',
            _links: { self: { href: 'http://test/server/api/core/sites/site-root' } },
          },
        ],
      },
    });

    expect(result).toEqual({
      uuid: 'site-root',
      href: 'http://test/server/api/core/sites/site-root',
    });
  });

  /** Sin sites, devuelve null sin reventar. */
  it('should return null when the sites list is empty', () => {
    let result: unknown = 'unset';
    service.getSiteRoot$().subscribe((site) => (result = site));

    httpMock.expectOne('/server/api/core/sites').flush({ _embedded: { sites: [] } });

    expect(result).toBeNull();
  });
});
