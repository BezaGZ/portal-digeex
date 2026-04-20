import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EPersonApiService } from './eperson-api.service';

/**
 * Tests de EPersonApiService, wrapper HTTP del recurso /api/eperson/epersons.
 * 
 * Verifica list() (GET paginado con mapeo HAL) y create() (POST eperson +
 * POST registrations encadenados para enviar correo de invitación).
 * 
 * Ciclo 5, 6 TDD — Sprint 5.
 * 
 */
describe('EPersonApiService', () => {
  let service: EPersonApiService;
  let httpMock: HttpTestingController;

  const mockEPersonsResponse = {
    _embedded: {
      epersons: [
        {
          uuid: 'eperson-001',
          name: 'carlos.ramirez@mineduc.gob.gt',
          email: 'carlos.ramirez@mineduc.gob.gt',
          handle: null,
          netid: null,
          canLogIn: true,
          requireCertificate: false,
          selfRegistered: false,
          lastActive: '2026-04-10T10:30:00Z',
          metadata: {
            'eperson.firstname': [
              { value: 'Carlos', language: null, authority: null, confidence: -1, place: 0 },
            ],
            'eperson.lastname': [
              { value: 'Ramírez', language: null, authority: null, confidence: -1, place: 0 },
            ],
          },
          type: 'eperson',
        },
        {
          uuid: 'eperson-002',
          name: 'ana.lopez@mineduc.gob.gt',
          email: 'ana.lopez@mineduc.gob.gt',
          handle: null,
          netid: null,
          canLogIn: true,
          requireCertificate: false,
          selfRegistered: false,
          lastActive: null,
          metadata: {
            'eperson.firstname': [
              { value: 'Ana', language: null, authority: null, confidence: -1, place: 0 },
            ],
            'eperson.lastname': [
              { value: 'López', language: null, authority: null, confidence: -1, place: 0 },
            ],
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

  /**
   * Verifica que el servicio se instancie correctamente
   * a través del sistema de inyección de dependencias.
   */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * list(): GET paginado a /api/eperson/epersons.
   * Aplana la respuesta HAL a Paginated<EPerson> y propaga errores HTTP.
   */
  describe('list()', () => {
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
     * preservando los datos crudos de cada eperson y los campos de paginación.
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
     * en lugar de silenciarse o transformarse en un valor válido.
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

  /**
   * create(): encadena POST al eperson con POST a registrations.
   * Así se crea el usuario y se le envía el correo para fijar contraseña.
   */
  describe('create()', () => {
    const input = {
      email: 'nuevo@mineduc.gob.gt',
      firstName: 'Nuevo',
      lastName: 'Usuario',
    };

    const mockCreatedEPerson = {
      uuid: 'eperson-new-001',
      name: 'nuevo@mineduc.gob.gt',
      email: 'nuevo@mineduc.gob.gt',
      handle: null,
      netid: null,
      canLogIn: true,
      requireCertificate: false,
      selfRegistered: false,
      lastActive: null,
      metadata: {
        'eperson.firstname': [
          { value: 'Nuevo', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'eperson.lastname': [
          { value: 'Usuario', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      type: 'eperson',
    };

    /**
     * Verifica que el POST al endpoint de epersons lleve el body que DSpace espera:
     * email, canLogIn=true y metadata con firstname y lastname.
     */
    it('should POST eperson body with firstname/lastname metadata and canLogIn=true', async () => {
      const promise = new Promise((resolve, reject) => {
        service.create(input).subscribe({ next: resolve, error: reject });
      });

      const epersonReq = httpMock.expectOne(
        (r) => r.url === '/server/api/eperson/epersons' && r.method === 'POST',
      );
      expect(epersonReq.request.body.name).toBe('nuevo@mineduc.gob.gt');
      expect(epersonReq.request.body.email).toBe('nuevo@mineduc.gob.gt');
      expect(epersonReq.request.body.canLogIn).toBe(true);
      expect(epersonReq.request.body.requireCertificate).toBe(false);
      expect(epersonReq.request.body.selfRegistered).toBe(false);
      expect(epersonReq.request.body.type).toBe('eperson');
      expect(epersonReq.request.body.metadata['eperson.firstname'][0].value).toBe('Nuevo');
      expect(epersonReq.request.body.metadata['eperson.firstname'][0].language).toBeNull();
      expect(epersonReq.request.body.metadata['eperson.firstname'][0].authority).toBe('');
      expect(epersonReq.request.body.metadata['eperson.firstname'][0].confidence).toBe(-1);
      expect(epersonReq.request.body.metadata['eperson.lastname'][0].value).toBe('Usuario');
      expect(epersonReq.request.body.metadata['eperson.lastname'][0].language).toBeNull();
      expect(epersonReq.request.body.metadata['eperson.lastname'][0].authority).toBe('');
      expect(epersonReq.request.body.metadata['eperson.lastname'][0].confidence).toBe(-1);
      epersonReq.flush(mockCreatedEPerson);

      const regReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/registrations');
      regReq.flush({});

      await promise;
    });

    /**
     * Verifica que, tras crear el eperson, se dispare el POST a registrations
     * con accountRequestType=forgot para que DSpace envíe el correo con token.
     */
    it('should POST registrations with accountRequestType=forgot after eperson is created', async () => {
      const promise = new Promise((resolve, reject) => {
        service.create(input).subscribe({ next: resolve, error: reject });
      });

      const epersonReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/epersons');
      epersonReq.flush(mockCreatedEPerson);

      const regReq = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/registrations' &&
          r.method === 'POST' &&
          r.params.get('accountRequestType') === 'forgot',
      );
      expect(regReq.request.body.email).toBe('nuevo@mineduc.gob.gt');
      expect(regReq.request.body.type).toBe('registration');
      regReq.flush({});

      await promise;
    });

    /**
     * Verifica que el observable emita el EPerson devuelto por el primer POST,
     * no la respuesta del registration que viene al final del flujo.
     */
    it('should return the EPerson created by the first POST', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.create(input).subscribe({
          next: (result) => {
            expect(result.uuid).toBe('eperson-new-001');
            expect(result.email).toBe('nuevo@mineduc.gob.gt');
            resolve();
          },
          error: reject,
        });
      });

      const epersonReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/epersons');
      epersonReq.flush(mockCreatedEPerson);

      const regReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/registrations');
      regReq.flush({});

      await promise;
    });

    /**
     * Si el POST del eperson falla (por ejemplo correo duplicado),
     * no debe intentarse el registration y el error se propaga al suscriptor.
     */
    it('should not call registrations if eperson POST fails', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.create(input).subscribe({
          next: () => reject(new Error('No debería emitir valor ante un 400')),
          error: (err) => {
            expect(err.status).toBe(400);
            resolve();
          },
        });
      });

      const epersonReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/epersons');
      epersonReq.flush(
        { message: 'Email already exists' },
        { status: 400, statusText: 'Bad Request' },
      );

      httpMock.expectNone((r) => r.url === '/server/api/eperson/registrations');

      await promise;
    });

    /**
     * Si el POST de registration falla tras crear el eperson, el error se propaga.
     * El rollback del eperson queda como deuda técnica (DSpace no es transaccional).
     */
    it('should propagate error from registrations POST (eperson already created)', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.create(input).subscribe({
          next: () => reject(new Error('No debería emitir valor ante un 500')),
          error: (err) => {
            expect(err.status).toBe(500);
            resolve();
          },
        });
      });

      const epersonReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/epersons');
      epersonReq.flush(mockCreatedEPerson);

      const regReq = httpMock.expectOne((r) => r.url === '/server/api/eperson/registrations');
      regReq.flush(
        { message: 'Internal Server Error' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      await promise;
    });
  });
});
