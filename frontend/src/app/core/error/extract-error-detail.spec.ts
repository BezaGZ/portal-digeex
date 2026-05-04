import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorDetail } from './extract-error-detail';

/**
 * Tests de `extractErrorDetail`.
 *
 * Helper puro: dado un HttpErrorResponse devuelve el texto mas util para el
 * toast. Resuelve en este orden: mensaje del body del backend, mensaje
 * generico del HttpErrorResponse, fallback del llamador. Un string vacio no
 * cuenta como valido (DSpace a veces manda `message: ""`).
 *
 * Ciclo 15 — Sprint 5.
 */
describe('extractErrorDetail', () => {
  const FALLBACK = 'Ocurrio un error al guardar los cambios';

  /** Verifica que use err.error.message cuando el body trae un mensaje descriptivo. */
  it('uses err.error.message when it has text', () => {
    const err = new HttpErrorResponse({
      error: { message: 'La contrasena no cumple la politica' },
      status: 422,
      statusText: 'Unprocessable Entity',
    });

    expect(extractErrorDetail(err, FALLBACK)).toBe('La contrasena no cumple la politica');
  });

  /** Verifica que caiga a err.message cuando el body no trae message propio. */
  it('falls back to err.message when the body has no message', () => {
    const err = new HttpErrorResponse({
      error: { detail: 'otro campo' },
      status: 500,
      statusText: 'Internal Server Error',
      url: '/server/api/eperson/epersons/x',
    });

    expect(extractErrorDetail(err, FALLBACK)).toBe(err.message);
    expect(err.message.length).toBeGreaterThan(0);
  });

  /**
   * Verifica que un string vacio en err.error.message no cuente como valido.
   * Regresion de la cadena `?? ??`: DSpace a veces manda `message: ""`.
   */
  it('falls back to err.message when err.error.message is an empty string', () => {
    const err = new HttpErrorResponse({
      error: { message: '' },
      status: 500,
      statusText: 'Internal Server Error',
      url: '/server/api/eperson/epersons/x',
    });

    expect(extractErrorDetail(err, FALLBACK)).toBe(err.message);
  });

  /**
   * Verifica que no crashee si err.error no es objeto.
   * Algunos endpoints devuelven texto plano en vez de JSON.
   */
  it('falls back to err.message when err.error is not an object', () => {
    const err = new HttpErrorResponse({
      error: 'raw body no-json',
      status: 502,
      statusText: 'Bad Gateway',
    });

    expect(extractErrorDetail(err, FALLBACK)).toBe(err.message);
  });

  /**
   * Verifica que devuelva el fallback cuando ni body ni err.message sirven.
   * Se simula con un objeto minimo porque HttpErrorResponse siempre sintetiza message.
   */
  it('falls back to the default when neither body nor err.message are usable', () => {
    const err = { error: null, message: '' } as unknown as HttpErrorResponse;

    expect(extractErrorDetail(err, FALLBACK)).toBe(FALLBACK);
  });
});
