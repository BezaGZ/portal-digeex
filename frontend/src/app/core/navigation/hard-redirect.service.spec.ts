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
 * Ciclo 43 TDD — Sprint 8
 */
describe('HardRedirectService', () => {
  let service: HardRedirectService;
  let doc: { location: { href: string } };

  beforeEach(() => {
    doc = { location: { href: '' } };

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
});
