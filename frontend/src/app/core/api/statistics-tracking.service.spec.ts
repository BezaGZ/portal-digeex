import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { StatisticsTrackingService } from './statistics-tracking.service';

/**
 * Tests del `StatisticsTrackingService`.
 *
 * El método público `trackView$` hace POST a `/server/api/statistics/viewevents`
 * con body `{ targetId, targetType }`. El xsrfInterceptor del proyecto se
 * encarga del header `X-XSRF-TOKEN` y `withCredentials`; este service no
 * maneja CSRF. El POST se hace sin Bearer (anónimo) porque las visitas en
 * DSpace son de usuarios públicos y el backend filtra hits autenticados
 * como admin para no inflar las estadísticas. Si el POST falla, el
 * observable emite `undefined` sin propagar el error: el tracking es
 * best-effort y no debe romper la UX si el backend está caído.
 *
 * Ciclo 23 TDD — Sprint 8.
 */
describe('StatisticsTrackingService', () => {
  let service: StatisticsTrackingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), StatisticsTrackingService],
    });
    service = TestBed.inject(StatisticsTrackingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Verifica que trackView$ haga POST al endpoint correcto con body `{targetId, targetType}` para targetType=item. */
  it('should POST to /server/api/statistics/viewevents with targetId and targetType=item', () => {
    service.trackView$('item-uuid-1', 'item').subscribe();

    const req = httpMock.expectOne('/server/api/statistics/viewevents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ targetId: 'item-uuid-1', targetType: 'item' });
    req.flush({});
  });

  /** Verifica que targetType=collection genere el mismo POST cambiando solo el discriminador del body. */
  it('should POST with targetType=collection for programas', () => {
    service.trackView$('col-uuid-1', 'collection').subscribe();

    const req = httpMock.expectOne('/server/api/statistics/viewevents');
    expect(req.request.body).toEqual({ targetId: 'col-uuid-1', targetType: 'collection' });
    req.flush({});
  });

  /**
   * Verifica que un error HTTP del backend no propague y emita undefined.
   * Tracking best-effort: una visita perdida no debe romper la UX del portal público.
   */
  it('should swallow HTTP errors and complete with undefined (best-effort)', () => {
    let emitted: unknown = 'no-emit';
    let errored = false;

    service.trackView$('item-x', 'item').subscribe({
      next: (v) => (emitted = v),
      error: () => (errored = true),
    });

    const req = httpMock.expectOne('/server/api/statistics/viewevents');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(emitted).toBeUndefined();
    expect(errored).toBe(false);
  });

  /** Verifica que en éxito el observable emita undefined y complete sin propagar el body de respuesta. */
  it('should emit undefined on success', () => {
    let emitted: unknown = 'no-emit';
    service.trackView$('item-y', 'item').subscribe((v) => (emitted = v));

    httpMock.expectOne('/server/api/statistics/viewevents').flush({});

    expect(emitted).toBeUndefined();
  });
});
