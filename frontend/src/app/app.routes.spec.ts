import { routes } from './app.routes';
import { authGuard } from './core/auth/auth.guard';

/**
 * Tests del config de routing.
 *
 * F-10 pide aplicar el authGuard a TODAS las rutas administrativas,
 * incluidas las dinámicas que se monten más adelante (por ejemplo
 * `/administrador/comunidades/:uuid/editar`). Para que la
 * protección la herede cualquier hijo del árbol sin tener que
 * declarar el guard en cada ruta nueva, `/administrador` lleva
 * `canActivateChild` además de `canActivate`.
 *
 * Ciclo 16 TDD — Sprint 6
 */
describe('app.routes config', () => {
  describe('/administrador', () => {
    it('should configure canActivateChild with authGuard so dynamic child routes inherit auth protection', () => {
      const adminRoute = routes.find((r) => r.path === 'administrador');

      expect(adminRoute).toBeDefined();
      expect(adminRoute?.canActivateChild).toEqual(expect.arrayContaining([authGuard]));
    });
  });
});
