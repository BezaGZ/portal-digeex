import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { AuthorizationApiService } from './authorization-api.service';
import { SiteApiService } from './site-api.service';

/**
 * Tests de AuthorizationApiService.
 *
 * Wrapper del endpoint nativo `/api/authz/authorizations/search/object` de
 * DSpace 9.x. `isAuthorized` pregunta al backend si el usuario del token puede
 * ejercer una feature sobre el self absoluto de un objeto. Pasar `feature` deja
 * que el backend filtre, así basta decidir por lista de authorizations no vacía;
 * el 401/error resuelve a `false`, no a excepción. Sin `objectUrl` resuelve el
 * self del Site y lo manda como `uri` (espejo de `AuthorizationDataService.searchByObject`
 * de dspace-angular); el `uri` es obligatorio en el backend (`findByObject`, required=true).
 *
 * Ciclo 1 TDD — Mejora 9. Ajustado en Ciclo 8 (default al self del Site para features site-scoped).
 */
describe('AuthorizationApiService', () => {
  const AUTHZ_URL = '/server/api/authz/authorizations/search/object';
  const ITEM_URL = 'http://localhost:3000/server/api/core/items/item-uuid';
  const SITE_SELF = 'http://localhost:8080/server/api/core/sites/site-uuid';

  let service: AuthorizationApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthorizationApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SiteApiService,
          useValue: { getSiteRoot$: () => of({ uuid: 'site-uuid', _links: { self: { href: SITE_SELF } } }) },
        },
      ],
    });
    service = TestBed.inject(AuthorizationApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('GETs the authz endpoint with the absolute object uri and feature, omitting eperson', () => {
    service.isAuthorized('canEditItem', ITEM_URL).subscribe();

    const req = httpMock.expectOne((r) => r.url === AUTHZ_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('uri')).toBe(ITEM_URL);
    expect(req.request.params.get('feature')).toBe('canEditItem');
    expect(req.request.params.has('eperson')).toBe(false);
    req.flush({ _embedded: { authorizations: [{ id: 'x' }] } });
  });

  it('resolves true when the response has at least one authorization', () => {
    let result: boolean | undefined;
    service.isAuthorized('canEditItem', ITEM_URL).subscribe((r) => (result = r));

    httpMock
      .expectOne((r) => r.url === AUTHZ_URL)
      .flush({ _embedded: { authorizations: [{ id: 'x' }] } });

    expect(result).toBe(true);
  });

  it('resolves false when the response has no authorizations', () => {
    let result: boolean | undefined;
    service.isAuthorized('canDelete', ITEM_URL).subscribe((r) => (result = r));

    httpMock
      .expectOne((r) => r.url === AUTHZ_URL)
      .flush({ _embedded: { authorizations: [] } });

    expect(result).toBe(false);
  });

  it('resolves false on a 401 response instead of throwing', () => {
    let result: boolean | undefined;
    let errored = false;
    service.isAuthorized('canDelete', ITEM_URL).subscribe({
      next: (r) => (result = r),
      error: () => (errored = true),
    });

    httpMock
      .expectOne((r) => r.url === AUTHZ_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(false);
    expect(result).toBe(false);
  });

  it('includes eperson when an ePersonUuid is provided', () => {
    service.isAuthorized('canEditItem', ITEM_URL, 'eperson-uuid').subscribe();

    const req = httpMock.expectOne((r) => r.url === AUTHZ_URL);
    expect(req.request.params.get('eperson')).toBe('eperson-uuid');
    req.flush({ _embedded: { authorizations: [] } });
  });

  /**
   * Sin objectUrl, espeja a dspace-angular: resuelve el self del Site y lo manda
   * como `uri` (el backend lo exige, no lo asume). Es el caso de las features
   * site-scoped del rolePresenceGuard (administratorOf, canSubmit, etc.).
   */
  it('defaults the uri to the Site self when no objectUrl is provided', () => {
    service.isAuthorized('administratorOf').subscribe();

    const req = httpMock.expectOne((r) => r.url === AUTHZ_URL);
    expect(req.request.params.get('uri')).toBe(SITE_SELF);
    expect(req.request.params.get('feature')).toBe('administratorOf');
    req.flush({ _embedded: { authorizations: [{ id: 'x' }] } });
  });
});
