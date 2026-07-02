import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { HardRedirectService } from './hard-redirect.service';

/**
 * Tests de `HardRedirectService`.
 *
 * Cubren que recargue la pagina por completo hacia la URL indicada. Se usa al
 * cerrar sesion para reiniciar la app y resincronizar el token CSRF, como hace
 * dspace-angular al salir.
 *
 * Ciclo 43 TDD — Sprint 8. Ajustado en Ciclo 49 (Sprint 10): getCurrentRoute
 * para arrastrar la ruta actual como returnUrl en recargas duras.
 */
describe('HardRedirectService', () => {
  let service: HardRedirectService;
  let doc: { location: { href: string; pathname: string; search: string } };

  beforeEach(() => {
    doc = { location: { href: '', pathname: '/', search: '' } };

    TestBed.configureTestingModule({
      providers: [
        HardRedirectService,
        { provide: DOCUMENT, useValue: doc },
      ],
    });

    service = TestBed.inject(HardRedirectService);
  });

  /** Verifica que redirect haga la recarga dura asignando document.location.href. */
  it('should set document.location.href to the target URL', () => {
    service.redirect('/iniciar-sesion');

    expect(doc.location.href).toBe('/iniciar-sesion');
  });

  /** getCurrentRoute devuelve path + query, sin returnUrl previos para no anidarlos. */
  it('should return path with query params excluding any pre-existing returnUrl', () => {
    doc.location.pathname = '/administrador/uso/items/abc';
    doc.location.search = '?meses=6&returnUrl=%2Finiciar-sesion';

    expect(service.getCurrentRoute()).toBe('/administrador/uso/items/abc?meses=6');
  });

  /** Sin query, getCurrentRoute devuelve solo el path. */
  it('should return only the path when there is no query string', () => {
    doc.location.pathname = '/administrador/envios';
    doc.location.search = '';

    expect(service.getCurrentRoute()).toBe('/administrador/envios');
  });
});
