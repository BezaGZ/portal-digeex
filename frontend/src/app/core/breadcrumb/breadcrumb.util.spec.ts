import { ActivatedRoute } from '@angular/router';
import { buildBreadcrumbTrail } from './breadcrumb.util';

/**
 * Tests del helper puro `buildBreadcrumbTrail`.
 *
 * Recorre el árbol de rutas activas leyendo `data.breadcrumb` (string o
 * función sobre los datos resueltos), resuelve `:param` con el snapshot y
 * deduplica por label. Reemplaza las copias locales que tenían los layouts
 * admin y público. Sin TestBed: las rutas se simulan con objetos planos.
 *
 * Ciclo 34 TDD — Sprint 8.
 */

interface FakeRouteConfig {
  path?: string;
  breadcrumb?: string | ((data: Record<string, unknown>) => string);
}

function fakeRoute(
  config: FakeRouteConfig,
  params: Record<string, string> = {},
  data: Record<string, unknown> = {},
  firstChild: ActivatedRoute | null = null,
): ActivatedRoute {
  return {
    routeConfig: {
      path: config.path ?? '',
      data: config.breadcrumb !== undefined ? { breadcrumb: config.breadcrumb } : {},
    },
    snapshot: { params, data },
    firstChild,
  } as unknown as ActivatedRoute;
}

describe('buildBreadcrumbTrail', () => {
  /** Verifica que arme items con label y routerLink acumulado desde el árbol de rutas. */
  it('should build labeled items with accumulated routerLink from the route tree', () => {
    const child = fakeRoute({ path: 'programas', breadcrumb: 'Programas' });
    const root = fakeRoute({}, {}, {}, child);

    expect(buildBreadcrumbTrail(root)).toEqual([
      { label: 'Programas', routerLink: '/programas' },
    ]);
  });

  /** Verifica que los segmentos :param se resuelvan con los valores del snapshot. */
  it('should resolve :param segments in routerLink using snapshot params', () => {
    const detail = fakeRoute({ path: 'programas/:uuid', breadcrumb: 'Detalle' }, { uuid: 'abc-123' });
    const root = fakeRoute({}, {}, {}, detail);

    expect(buildBreadcrumbTrail(root)).toEqual([
      { label: 'Detalle', routerLink: '/programas/abc-123' },
    ]);
  });

  /**
   * Verifica que un breadcrumb función reciba los datos resueltos de la ruta.
   * Las rutas de detalle generan el label dinámico desde el resolver.
   */
  it('should call a function breadcrumb with the resolved snapshot data', () => {
    const labelFn = (data: Record<string, unknown>) => `Programa ${data['name']}`;
    const detail = fakeRoute({ path: 'programas/:uuid', breadcrumb: labelFn }, { uuid: 'x' }, { name: 'PEAC' });
    const root = fakeRoute({}, {}, {}, detail);

    expect(buildBreadcrumbTrail(root)).toEqual([
      { label: 'Programa PEAC', routerLink: '/programas/x' },
    ]);
  });

  /** Verifica que las rutas sin breadcrumb no generen item pero sí aporten su path a la URL. */
  it('should skip routes without breadcrumb data but keep their path in routerLink', () => {
    const leaf = fakeRoute({ path: 'usuarios', breadcrumb: 'Usuarios' });
    const middle = fakeRoute({ path: 'administrador' }, {}, {}, leaf);
    const root = fakeRoute({}, {}, {}, middle);

    expect(buildBreadcrumbTrail(root)).toEqual([
      { label: 'Usuarios', routerLink: '/administrador/usuarios' },
    ]);
  });

  /** Verifica que labels repetidos en rutas anidadas queden una sola vez en el trail. */
  it('should deduplicate items that repeat the same label across nested routes', () => {
    const leaf = fakeRoute({ path: 'detalle', breadcrumb: 'Programas' });
    const parent = fakeRoute({ path: 'programas', breadcrumb: 'Programas' }, {}, {}, leaf);
    const root = fakeRoute({}, {}, {}, parent);

    expect(buildBreadcrumbTrail(root)).toEqual([
      { label: 'Programas', routerLink: '/programas' },
    ]);
  });

  /** Verifica que un árbol sin data.breadcrumb devuelva trail vacío. */
  it('should return an empty array when no route declares breadcrumb data', () => {
    const leaf = fakeRoute({ path: 'busqueda' });
    const root = fakeRoute({}, {}, {}, leaf);

    expect(buildBreadcrumbTrail(root)).toEqual([]);
  });
});
