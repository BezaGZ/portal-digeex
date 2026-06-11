import { ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';

/**
 * Arma el trail de breadcrumb recorriendo el árbol de rutas activas.
 * Lee `data.breadcrumb` de cada routeConfig (string o función sobre los
 * datos resueltos), resuelve los `:param` con los valores del snapshot y
 * deduplica por label. Único punto de armado para los layouts admin y público.
 */
export function buildBreadcrumbTrail(route: ActivatedRoute): MenuItem[] {
  return collectBreadcrumbs(route, '', []);
}

function collectBreadcrumbs(
  route: ActivatedRoute,
  url: string,
  breadcrumbs: MenuItem[],
): MenuItem[] {
  const path = route.routeConfig?.path || '';
  const breadcrumbLabel = route.routeConfig?.data?.['breadcrumb'];
  const routeParams = route.snapshot.params;

  let resolvedPath = path;
  for (const key in routeParams) {
    if (Object.prototype.hasOwnProperty.call(routeParams, key)) {
      resolvedPath = resolvedPath.replace(`:${key}`, routeParams[key]);
    }
  }

  const nextUrl = path ? `${url}/${resolvedPath}` : url;

  if (breadcrumbLabel) {
    const label =
      typeof breadcrumbLabel === 'function'
        ? breadcrumbLabel(route.snapshot.data)
        : breadcrumbLabel;
    breadcrumbs.push({ label, routerLink: nextUrl });
  }

  if (route.firstChild) {
    return collectBreadcrumbs(route.firstChild, nextUrl, breadcrumbs);
  }

  return breadcrumbs.filter(
    (item, index, self) => index === self.findIndex((t) => t.label === item.label),
  );
}
