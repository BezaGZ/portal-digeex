import { resolvePostLoginRoute } from './post-login-route';

/**
 * Tests de `resolvePostLoginRoute`.
 *
 * Destino tras un login con rol: `returnUrl` interno gana; cualquier valor
 * ausente, externo, protocolo-relativo o que apunte al propio login cae al
 * panel por defecto.
 *
 * Ciclo 49 TDD — Sprint 10. Ajustado en Ciclo 65 (movido a core/auth).
 */
describe('resolvePostLoginRoute', () => {
  /** Verifica que un returnUrl interno gane y los valores inseguros caigan al panel. */
  it('should return an internal returnUrl and fall back to the panel for unsafe values', () => {
    expect(resolvePostLoginRoute('/administrador/envios/abc?x=1')).toBe('/administrador/envios/abc?x=1');
    expect(resolvePostLoginRoute(null)).toBe('/administrador');
    expect(resolvePostLoginRoute('')).toBe('/administrador');
    expect(resolvePostLoginRoute('https://evil.example')).toBe('/administrador');
    expect(resolvePostLoginRoute('//evil.example')).toBe('/administrador');
    expect(resolvePostLoginRoute('/iniciar-sesion?expired=true')).toBe('/administrador');
  });
});
