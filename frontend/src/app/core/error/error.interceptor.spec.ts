import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { errorInterceptor } from './error.interceptor';

/**
 * Tests para errorInterceptor.
 *
 * Interceptor HTTP que maneja errores de forma centralizada.
 * Proporciona feedback consistente al usuario mediante redirecciones
 * y notificaciones toast según el tipo de error HTTP.
 *
 * Ciclo 3 TDD — Sprint 3
 */
describe('errorInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let router: Router;
  let messageService: MessageService;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  /** Setup */

  beforeEach(() => {
    const routerMock = {
      navigate: vi.fn()
    };
    const messageServiceMock = {
      add: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerMock },
        { provide: MessageService, useValue: messageServiceMock }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    messageService = TestBed.inject(MessageService);

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** 401 Unauthorized */

  /** Verifica que el interceptor redirija a /login cuando recibe un error 401. */
  it('should redirect to /login on 401 Unauthorized', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({
        next: resolve,
        error: (error) => {
          expect(router.navigate).toHaveBeenCalledWith(['/login']);
          reject(error);
        }
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    try {
      await promise;
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  /** 403 Forbidden */

  /** Verifica que el interceptor muestre un toast de error cuando recibe un 403. */
  it('should show toast error on 403 Forbidden', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({
        next: resolve,
        error: (error) => {
          expect(messageService.add).toHaveBeenCalledWith({
            severity: 'error',
            summary: 'Acceso Denegado',
            detail: 'No tienes permisos para realizar esta acción'
          });
          reject(error);
        }
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    try {
      await promise;
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  /** 500 Server Error */

  /** Verifica que el interceptor muestre un toast genérico para errores 500. */
  it('should show generic error on 500 Server Error', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({
        next: resolve,
        error: (error) => {
          expect(messageService.add).toHaveBeenCalledWith({
            severity: 'error',
            summary: 'Error del Servidor',
            detail: 'Ocurrió un error en el servidor. Por favor, intenta de nuevo.'
          });
          reject(error);
        }
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

    try {
      await promise;
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  /** Console Logging */

  /** Verifica que el interceptor registre todos los errores HTTP en consola. */
  it('should log errors to console', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({
        next: resolve,
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    try {
      await promise;
    } catch {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[HTTP Error]',
        expect.objectContaining({
          status: 404,
          statusText: 'Not Found'
        })
      );
    }
  });

  /** Successful Responses */

  /** Verifica que el interceptor NO intercepte respuestas exitosas (2xx). */
  it('should NOT intercept successful responses (2xx)', async () => {
    const promise = new Promise((resolve, reject) => {
      httpClient.get('/server/api/test').subscribe({
        next: (response) => {
          expect(response).toEqual({ data: 'success' });
          resolve(response);
        },
        error: reject
      });
    });

    const req = httpMock.expectOne('/server/api/test');
    req.flush({ data: 'success' });

    await promise;

    expect(router.navigate).not.toHaveBeenCalled();
    expect(messageService.add).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
