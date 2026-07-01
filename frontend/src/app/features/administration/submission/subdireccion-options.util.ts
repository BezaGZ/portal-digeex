import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { CommunityApiService } from '../../../core/api/community-api.service';

/**
 * Nombres de las subdirecciones para el desplegable editable de autor de los
 * formularios de submission (Documento, Galería). Salen de las subcomunidades
 * de la raíz DIGEEX (`searchTop` → subcomunidades → `dc.title`), ordenados.
 * `catchError` deja la lista vacía si algo falla; el campo de autor es editable,
 * así que no se traba nada.
 */
export function subdireccionNames$(communityApi: CommunityApiService): Observable<string[]> {
  return communityApi.searchTop(0, 1).pipe(
    map((resp) => resp._embedded?.['communities']?.[0]?.uuid),
    switchMap((rootUuid) =>
      rootUuid ? communityApi.listAllSubcommunities(rootUuid) : of([]),
    ),
    map((subs) => subs.map((c) => c.name).filter((n) => !!n).sort()),
    catchError(() => of([] as string[])),
  );
}
