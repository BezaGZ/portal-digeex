import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EPersonApiService } from './eperson-api.service';

/**
 * Tests para EPersonApiService.
 *
 * Wrapper HTTP del recurso /api/eperson/epersons de DSpace.
 * Responsabilidad: hablar el idioma del backend. No aplica reglas
 * de negocio ni mapea a modelos de UI.
 *
 * Ciclo 5 TDD — Sprint 5
 */
describe('EPersonApiService', () => {
  let service: EPersonApiService;
  let httpMock: HttpTestingController;

  /** Fixtures */

  const mockEPersonsResponse = {
    _embedded: {
      epersons: [
        {
          uuid: 'eperson-001',
          name: 'carlos.ramirez@mineduc.gob.gt',
          email: 'carlos.ramirez@mineduc.gob.gt',
          netid: null,
          canLogIn: true,
          requireCertificate: false,
          selfRegistered: false,
          lastActive: '2026-04-10T10:30:00Z',
          metadata: {
            'eperson.firstname': [{ value: 'Carlos' }],
            'eperson.lastname': [{ value: 'Ramírez' }],
          },
          type: 'eperson',
        },
        {
          uuid: 'eperson-002',
          name: 'ana.lopez@mineduc.gob.gt',
          email: 'ana.lopez@mineduc.gob.gt',
          netid: null,
          canLogIn: true,
          requireCertificate: false,
          selfRegistered: false,
          lastActive: null,
          metadata: {
            'eperson.firstname': [{ value: 'Ana' }],
            'eperson.lastname': [{ value: 'López' }],
          },
          type: 'eperson',
        },
      ],
    },
    page: {
      size: 20,
      totalElements: 2,
      totalPages: 1,
      number: 0,
    },
    _links: {
      self: { href: '/server/api/eperson/epersons' },
    },
  };

  /** Setup */

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        EPersonApiService,
      ],
    });

    service = TestBed.inject(EPersonApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Verifica que el servicio se instancie correctamente. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * Verifica que list() haga GET al endpoint correcto de DSpace
   * y envíe los parámetros de paginación (size y page).
   */
  it('should GET /api/eperson/epersons with size and page params', async () => {
    const promise = new Promise((resolve, reject) => {
      service.list({ size: 20, page: 0 }).subscribe({
        next: resolve,
        error: reject,
      });
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/server/api/eperson/epersons' &&
        r.params.get('size') === '20' &&
        r.params.get('page') === '0',
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockEPersonsResponse);

    await promise;
  });

  /**
   * Verifica que list() devuelva la respuesta aplanada en Paginated<EPerson>,
   * conservando los datos crudos de cada eperson y los campos de paginación.
   */
  it('should return paginated response with totalElements and items[]', async () => {
    const promise = new Promise<void>((resolve, reject) => {
      service.list({ size: 20, page: 0 }).subscribe({
        next: (result) => {
          expect(result.items.length).toBe(2);
          expect(result.items[0].uuid).toBe('eperson-001');
          expect(result.items[0].email).toBe('carlos.ramirez@mineduc.gob.gt');
          expect(result.items[0].metadata['eperson.firstname']?.[0].value).toBe('Carlos');
          expect(result.totalElements).toBe(2);
          expect(result.totalPages).toBe(1);
          expect(result.size).toBe(20);
          expect(result.page).toBe(0);
          resolve();
        },
        error: reject,
      });
    });

    const req = httpMock.expectOne((r) => r.url === '/server/api/eperson/epersons');
    req.flush(mockEPersonsResponse);

    await promise;
  });

  /**
   * Verifica que un error HTTP se propague como error del Observable
   * en lugar de ser silenciado o transformado a un valor válido.
   */
  it('should propagate HTTP errors as Observable error', async () => {
    const promise = new Promise<void>((resolve, reject) => {
      service.list({ size: 20, page: 0 }).subscribe({
        next: () => reject(new Error('El observable no debería emitir valor ante un 500')),
        error: (err) => {
          expect(err.status).toBe(500);
          resolve();
        },
      });
    });

    const req = httpMock.expectOne((r) => r.url === '/server/api/eperson/epersons');
    req.flush(
      { message: 'Internal Server Error' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    await promise;
  });
});
