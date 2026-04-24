import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EPersonApiService } from './eperson-api.service';

/**
 * Tests de `EPersonApiService`.
 *
 * Wrapper HTTP del recurso `/api/eperson/epersons`. Cubre `list()` (GET
 * paginado con mapeo HAL), `create()` (POST eperson sin encadenar
 * registrations) y los métodos `update()`, `delete()`, `resendRegistration()`
 * y `setActive()` sobre JSON Patch según el contrato REST de DSpace 9.2.
 *
 * Ciclos 5, 6, 7 TDD — Sprint 5. Ajustado en Ciclo 13.
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

  /** Verifica que el servicio se instancie vía DI. */
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * list(): GET paginado a /api/eperson/epersons.
   * Aplana la respuesta HAL a Paginated<EPerson> y propaga errores HTTP.
   */
  describe('list()', () => {
    /** Verifica que list() mande GET con los params size y page. */
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

    /** Verifica que list() aplane la respuesta HAL a Paginated<EPerson>. */
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
     * Verifica que list() reenvíe el param `embed` cuando se lo pasan.
     * Con `embed=groups` DSpace anida los grupos dentro de cada eperson.
     */
    it('should forward embed param to DSpace when provided', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.list({ size: 20, page: 0, embed: 'groups' }).subscribe({
          next: () => resolve(),
          error: reject,
        });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons' &&
          r.params.get('size') === '20' &&
          r.params.get('page') === '0' &&
          r.params.get('embed') === 'groups',
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockEPersonsResponse);

      await promise;
    });

    /** Verifica que un error HTTP se propague como error del Observable. */
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
   * searchByMetadata(): GET /api/eperson/epersons/search/byMetadata con query
   * libre + paginación server-side. Backing del scope `nombre` del listado
   * administrativo — busca parcial case-insensitive en firstname, lastname
   * y email.
   */
  describe('searchByMetadata()', () => {
    /** Verifica que mande GET al endpoint nativo con query, size, page y embed. */
    it('should GET /search/byMetadata with query, page, size and embed params', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service
          .searchByMetadata({ query: 'carlos', size: 10, page: 0, embed: 'groups' })
          .subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/search/byMetadata' &&
          r.params.get('query') === 'carlos' &&
          r.params.get('size') === '10' &&
          r.params.get('page') === '0' &&
          r.params.get('embed') === 'groups',
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockEPersonsResponse);

      await promise;
    });

    /** Verifica que sin embed no se envíe el param (no manda embed=undefined). */
    it('should NOT include embed param when not provided', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.searchByMetadata({ query: 'ana', size: 5, page: 1 }).subscribe({
          next: () => resolve(),
          error: reject,
        });
      });

      const req = httpMock.expectOne(
        (r) => r.url === '/server/api/eperson/epersons/search/byMetadata',
      );
      expect(req.request.params.has('embed')).toBe(false);
      req.flush(mockEPersonsResponse);

      await promise;
    });
  });

  /**
   * searchByEmail(email, { embed? }): GET /api/eperson/epersons/search/byEmail.
   * Doble uso: pre-check de duplicado en alta (Ciclo 17) y resolución
   * directa por correo en el listado (Ciclo 19, scope `correo`).
   */
  describe('searchByEmail()', () => {
    /** Verifica que reenvíe el param embed cuando se lo pasan. */
    it('should forward embed param to DSpace when provided', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service
          .searchByEmail('c@mineduc.gob.gt', { embed: 'groups' })
          .subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/search/byEmail' &&
          r.params.get('email') === 'c@mineduc.gob.gt' &&
          r.params.get('embed') === 'groups',
      );
      expect(req.request.method).toBe('GET');
      req.flush(null, { status: 204, statusText: 'No Content' });

      await promise;
    });

    /** Verifica que sin options el request no incluya embed (backward compat). */
    it('should NOT include embed param when options are omitted', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.searchByEmail('c@mineduc.gob.gt').subscribe({
          next: () => resolve(),
          error: reject,
        });
      });

      const req = httpMock.expectOne(
        (r) => r.url === '/server/api/eperson/epersons/search/byEmail',
      );
      expect(req.request.params.has('embed')).toBe(false);
      req.flush(null, { status: 204, statusText: 'No Content' });

      await promise;
    });
  });

  /** getOne(): GET /api/eperson/epersons/{uuid}, opcionalmente con embed. */
  describe('getOne()', () => {
    const mockEPerson = {
      uuid: 'eperson-001',
      name: 'carlos.ramirez@mineduc.gob.gt',
      email: 'carlos.ramirez@mineduc.gob.gt',
      handle: null,
      netid: null,
      canLogIn: true,
      requireCertificate: false,
      selfRegistered: false,
      lastActive: null,
      metadata: {
        'eperson.firstname': [
          { value: 'Carlos', language: null, authority: null, confidence: -1, place: 0 },
        ],
        'eperson.lastname': [
          { value: 'Ramírez', language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
      type: 'eperson',
    };

    /**
     * Verifica que getOne() sin `embed` haga GET directo sin query params.
     * Para un único eperson `embed=groups` no hidrata `_embedded`; los grupos viajan por GroupApiService.
     */
    it('should GET /api/eperson/epersons/{uuid} without query params', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.getOne('eperson-001').subscribe({
          next: (result) => {
            expect(result.uuid).toBe('eperson-001');
            resolve();
          },
          error: reject,
        });
      });

      const req = httpMock.expectOne('/server/api/eperson/epersons/eperson-001');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys()).toEqual([]);
      req.flush(mockEPerson);

      await promise;
    });
  });

  /**
   * `create()` hace un POST al recurso `/api/eperson/epersons`. El correo de fijación de
   * contraseña vive aparte en `resendRegistration()` para que el facade pueda orquestar la
   * transacción con rollback explícito si la asignación al grupo falla.
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
     * Verifica que el POST lleve el body que DSpace espera y no dispare /registrations.
     * El correo de fijación de contraseña lo orquesta el facade en un paso aparte.
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

      httpMock.expectNone((r) => r.url === '/server/api/eperson/registrations');

      await promise;
    });

    /** Verifica que el observable emita el EPerson devuelto por el POST. */
    it('should return the EPerson created by the POST', async () => {
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

      await promise;
    });

    /** Verifica que el error HTTP del POST se propague al suscriptor. */
    it('should propagate HTTP error when the eperson POST fails', async () => {
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
  });

  /**
   * `delete()` hace `DELETE /api/eperson/epersons/{uuid}`. Es el contrato que el facade usa
   * para hacer rollback explícito si la asignación al grupo de rol falla tras el alta.
   */
  describe('delete()', () => {
    /** Verifica que delete() mande DELETE al recurso eperson por uuid. */
    it('should DELETE /api/eperson/epersons/{uuid}', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service.delete('eperson-uuid-001').subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/eperson-uuid-001' && r.method === 'DELETE',
      );
      req.flush(null, { status: 204, statusText: 'No Content' });

      await promise;
    });
  });

  /**
   * update(): PATCH /api/eperson/epersons/{uuid} con JSON Patch.
   * Permite editar firstname y lastname del eperson sin tocar otros campos.
   */
  describe('update()', () => {
    /**
     * Verifica que editar firstName/lastName arme un PATCH con dos replace sobre /value.
     * Targetear solo /value evita tener que recargar language, authority y confidence.
     */
    it('should PATCH eperson when editing basic data', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service
          .update('eperson-uuid-001', { firstName: 'NuevoNombre', lastName: 'NuevoApellido' })
          .subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/eperson-uuid-001' && r.method === 'PATCH',
      );
      expect(req.request.body).toEqual([
        { op: 'replace', path: '/metadata/eperson.firstname/0/value', value: 'NuevoNombre' },
        { op: 'replace', path: '/metadata/eperson.lastname/0/value', value: 'NuevoApellido' },
      ]);
      req.flush({});

      await promise;
    });
  });

  /**
   * resendRegistration(): POST /api/eperson/registrations?accountRequestType=forgot.
   * Reenvía el correo con token para que el usuario fije su contraseña cuando
   * el original se perdió o expiró.
   */
  describe('resendRegistration()', () => {
    /** Verifica que reenvíe el correo vía POST /registrations?accountRequestType=forgot. */
    it('should POST registrations?accountRequestType=forgot to resend invitation', async () => {
      const promise = new Promise((resolve, reject) => {
        service
          .resendRegistration('olvidadizo@mineduc.gob.gt')
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/registrations' &&
          r.method === 'POST' &&
          r.params.get('accountRequestType') === 'forgot',
      );
      expect(req.request.body.email).toBe('olvidadizo@mineduc.gob.gt');
      expect(req.request.body.type).toBe('registration');
      req.flush({});

      await promise;
    });
  });

  /**
   * setActive(): PATCH /api/eperson/epersons/{uuid} con replace de /canLogIn.
   * Activa o desactiva la capacidad de login sin borrar el eperson, que es
   * lo que RN-11 exige para preservar trazabilidad histórica.
   * El path /canLogIn con 'I' mayúscula es el canónico de DSpace 9.2
   * (EPersonLoginReplaceOperation.java) y el mismo que usa `dspace-angular`.
   */
  describe('setActive()', () => {
    /** Verifica que desactivar mande PATCH replace /canLogIn=false. */
    it('should PATCH eperson.canLogIn=false on deactivate', async () => {
      const promise = new Promise((resolve, reject) => {
        service
          .setActive('eperson-uuid-001', false)
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/eperson-uuid-001' && r.method === 'PATCH',
      );
      expect(req.request.body).toEqual([{ op: 'replace', path: '/canLogIn', value: false }]);
      req.flush({});

      await promise;
    });

    /** Verifica que reactivar mande PATCH replace /canLogIn=true. */
    it('should PATCH eperson.canLogIn=true on activate', async () => {
      const promise = new Promise((resolve, reject) => {
        service
          .setActive('eperson-uuid-001', true)
          .subscribe({ next: resolve, error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/eperson-uuid-001' && r.method === 'PATCH',
      );
      expect(req.request.body).toEqual([{ op: 'replace', path: '/canLogIn', value: true }]);
      req.flush({});

      await promise;
    });
  });

  /**
   * changeOwnPassword(): PATCH /api/eperson/epersons/{uuid} con la operacion
   * `add` sobre /password. Sigue el contrato REST documentado por DSpace 9.2:
   * el body trae `current_password` y `new_password` dentro del campo `value`.
   */
  describe('changeOwnPassword()', () => {
    /** Verifica que changeOwnPassword() mande PATCH con la operación add /password. */
    it('should PATCH /api/eperson/epersons/{uuid} with the password add operation when changeOwnPassword is called', async () => {
      const promise = new Promise<void>((resolve, reject) => {
        service
          .changeOwnPassword('eperson-uuid-001', 'CurrentPass1', 'NuevaSegura1')
          .subscribe({ next: () => resolve(), error: reject });
      });

      const req = httpMock.expectOne(
        (r) =>
          r.url === '/server/api/eperson/epersons/eperson-uuid-001' && r.method === 'PATCH',
      );
      expect(req.request.body).toEqual([
        {
          op: 'add',
          path: '/password',
          value: { new_password: 'NuevaSegura1', current_password: 'CurrentPass1' },
        },
      ]);
      req.flush({});

      await promise;
    });
  });
});
