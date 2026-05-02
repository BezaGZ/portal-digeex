import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { EPerson } from './models/eperson.model';
import { HalListResponse, Paginated } from './models/hal.model';
import {
  DSPACE_API_BASE,
  EMBEDDED_KEY_EPERSONS,
  EPERSONS_COLLECTION_PATH,
  REGISTRATIONS_COLLECTION_PATH,
  buildPaginationParams,
  mapHalList,
} from './dspace-rest.util';
import { JsonPatchEntry, JsonPatchReplace, replaceOp, addOp } from './json-patch.util';

/** Valores fijos del contrato REST de DSpace. */
const ACCOUNT_REQUEST_FORGOT = 'forgot';
const EPERSON_TYPE = 'eperson';
const REGISTRATION_TYPE = 'registration';

/**
 * Paths de JSON Patch sobre el recurso eperson (contrato DSpace 9.2).
 * `/canLogIn` con 'I' mayúscula es el path canónico que espera
 * `EPersonLoginReplaceOperation.java` y el mismo que usa `dspace-angular`
 * en su `group-data.service.ts`. Los de metadata apuntan solo a `/value`
 * para editar el texto sin reenviar los cuatro campos del entry (value,
 * language, authority, confidence). `/password` es el path que espera
 * EPersonPasswordReplaceOperation; va por `op: 'add'` para que el body
 * lleve el objeto con `current_password` y `new_password`, no un string
 * suelto.
 */
const PATCH_PATH_CAN_LOGIN = '/canLogIn';
const PATCH_PATH_FIRSTNAME_VALUE = '/metadata/eperson.firstname/0/value';
const PATCH_PATH_LASTNAME_VALUE = '/metadata/eperson.lastname/0/value';
const PATCH_PATH_EMAIL = '/email';
const PATCH_PATH_PASSWORD = '/password';

// Operaciones y helpers de JSON Patch viven en `json-patch.util.ts` para que
// los reuse cualquier wrapper que necesite hacer PATCH contra DSpace.

/** Wrapper HTTP del recurso `/api/eperson/epersons` de DSpace. Solo habla con el backend, sin reglas de negocio. */
@Injectable({ providedIn: 'root' })
export class EPersonApiService {
  private readonly http = inject(HttpClient);

  /**
   * Lista epersons paginados desde DSpace. Acepta el parámetro opcional
   * `embed` que DSpace usa para traer subrecursos en la misma respuesta
   * (por ejemplo `embed=groups` para incluir los grupos de cada eperson
   * y evitar N+1 en el listado administrativo).
   */
  list(
    params: { size?: number; page?: number; embed?: string } = {},
  ): Observable<Paginated<EPerson>> {
    let httpParams = buildPaginationParams(params);
    if (params.embed) {
      httpParams = httpParams.set('embed', params.embed);
    }

    return this.http
      .get<HalListResponse<EPerson>>(`${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}`, {
        params: httpParams,
      })
      .pipe(map((response) => mapHalList(response, EMBEDDED_KEY_EPERSONS)));
  }

  /**
   * Busca un eperson por correo exacto; devuelve null si no existe. Usado
   * tanto para pre-validar alta (sin depender del 500 genérico cuando el POST
   * choca con un correo ya registrado) como para resolver un eperson por
   * correo en el listado administrativo cuando el admin busca con scope
   * `email`. El parámetro `embed` permite traer subrecursos en la misma
   * respuesta (por ejemplo `embed=groups` para armar el `UserView` sin
   * segunda request).
   */
  searchByEmail(
    email: string,
    options: { embed?: string } = {},
  ): Observable<EPerson | null> {
    const url = `${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}/search/byEmail`;
    let params = new HttpParams().set('email', email);
    if (options.embed) {
      params = params.set('embed', options.embed);
    }
    return this.http.get<EPerson>(url, { params }).pipe(
      map((eperson) => eperson ?? null),
      catchError((err: { status?: number }) => {
        // 204/404: no existe. 403: el caller no tiene permiso de búsqueda global
        // (admin_subdireccion), tratamos como "no sabemos" y dejamos que el POST
        // posterior sea quien falle si había duplicado.
        if (err?.status === 204 || err?.status === 404 || err?.status === 403) {
          return of<EPerson | null>(null);
        }
        return throwError(() => err);
      }),
    );
  }

  /**
   * Búsqueda parcial case-insensitive sobre `firstname`, `lastname` y `email`
   * del eperson. Es el endpoint nativo que DSpace 9.2 expone para el listado
   * administrativo con filtro por texto libre; acepta paginación server-side
   * (`page`, `size`) y embed para incluir subrecursos.
   */
  searchByMetadata(
    params: { query: string; size?: number; page?: number; embed?: string },
  ): Observable<Paginated<EPerson>> {
    const url = `${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}/search/byMetadata`;
    let httpParams = buildPaginationParams(params).set('query', params.query);
    if (params.embed) {
      httpParams = httpParams.set('embed', params.embed);
    }
    return this.http
      .get<HalListResponse<EPerson>>(url, { params: httpParams })
      .pipe(map((response) => mapHalList(response, EMBEDDED_KEY_EPERSONS)));
  }

  /**
   * Trae un único eperson por uuid. Soporta `embed` para incluir
   * subrecursos (habitualmente `groups` cuando necesitamos derivar el
   * rol del usuario en una sola petición, sin pasar por /groups aparte).
   */
  getOne(uuid: string, options: { embed?: string } = {}): Observable<EPerson> {
    const url = `${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}/${uuid}`;
    if (!options.embed) {
      return this.http.get<EPerson>(url);
    }

    const params = new HttpParams().set('embed', options.embed);
    return this.http.get<EPerson>(url, { params });
  }

  /**
   * Crea un eperson en DSpace con un único POST. La orquestación de correo,
   * grupo de rol y rollback vive en `UserManagementService`.
   */
  create(input: { email: string; firstName: string; lastName: string }): Observable<EPerson> {
    return this.http.post<EPerson>(
      `${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}`,
      this.buildEPersonBody(input),
    );
  }

  /**
   * Borra el eperson con el uuid indicado. DSpace responde 204 No Content, por eso el Observable
   * emite `void`. Es la pieza que `UserManagementService` usa para hacer rollback del alta.
   */
  delete(uuid: string): Observable<void> {
    return this.http.delete<void>(`${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}/${uuid}`);
  }

  /**
   * Edita datos básicos del eperson vía JSON Patch.
   * Cada campo presente en `changes` se traduce a una operación replace
   * creada explícitamente, siguiendo el mismo estilo que los IT oficiales
   * de DSpace (ver EPersonRestRepositoryIT.patchMultipleReplaceMetadataByAdmin).
   * Los metadatos se parchean apuntando al índice 0 y a /value, siguiendo
   * el patrón documentado en metadata-patch-suite.json de DSpace.
   */
  update(
    uuid: string,
    changes: { firstName?: string; lastName?: string; email?: string },
  ): Observable<EPerson> {
    const patch: JsonPatchReplace[] = [];

    if (changes.firstName !== undefined) {
      patch.push(replaceOp(PATCH_PATH_FIRSTNAME_VALUE, changes.firstName));
    }

    if (changes.lastName !== undefined) {
      patch.push(replaceOp(PATCH_PATH_LASTNAME_VALUE, changes.lastName));
    }

    if (changes.email !== undefined) {
      patch.push(replaceOp(PATCH_PATH_EMAIL, changes.email));
    }

    return this.sendPatch(uuid, patch);
  }

  /**
   * Reenvía el correo con token para que el usuario fije su contraseña.
   * Es el mismo mecanismo que dispara create() al final, extraído para que
   * se pueda invocar de forma independiente cuando el correo original se
   * perdió o expiró.
   */
  resendRegistration(email: string): Observable<unknown> {
    return this.triggerPasswordSetupEmail(email);
  }

  /**
   * Activa o desactiva la capacidad de login del eperson conmutando canLogIn.
   * No borra al usuario: RN-11 exige preservarlo para trazabilidad histórica.
   */
  setActive(uuid: string, active: boolean): Observable<EPerson> {
    return this.sendPatch(uuid, [replaceOp(PATCH_PATH_CAN_LOGIN, active)]);
  }

  /**
   * Cambio de contraseña propio del usuario autenticado.
   * DSpace 9.2 espera `op: 'add'` sobre `/password` con un objeto que
   * lleva `current_password` y `new_password`. El backend valida la
   * contraseña actual y la política de complejidad antes de aceptar.
   */
  changeOwnPassword(
    uuid: string,
    currentPassword: string,
    newPassword: string,
  ): Observable<EPerson> {
    return this.sendPatch(uuid, [
      addOp(PATCH_PATH_PASSWORD, {
        new_password: newPassword,
        current_password: currentPassword,
      }),
    ]);
  }

  /**
   * Envía un JSON Patch al recurso /eperson/epersons/{uuid}.
   * Centraliza la construcción de la URL y la llamada HTTP para que
   * update(), setActive() y changeOwnPassword() tengan un único punto de cambio.
   */
  private sendPatch(uuid: string, patch: JsonPatchEntry[]): Observable<EPerson> {
    return this.http.patch<EPerson>(
      `${DSPACE_API_BASE}${EPERSONS_COLLECTION_PATH}/${uuid}`,
      patch,
    );
  }

  /**
   * Construye el body que DSpace espera para crear un eperson.
   * Alineado al contrato REST oficial de /api/eperson/epersons.
   * No lleva password: eso lo fija el usuario desde el correo de registration.
   */
  private buildEPersonBody(input: { email: string; firstName: string; lastName: string }) {
    return {
      name: input.email,
      email: input.email,
      canLogIn: true,
      requireCertificate: false,
      selfRegistered: false,
      type: EPERSON_TYPE,
      metadata: {
        'eperson.firstname': [
          { value: input.firstName, language: null, authority: '', confidence: -1 },
        ],
        'eperson.lastname': [
          { value: input.lastName, language: null, authority: '', confidence: -1 },
        ],
      },
    };
  }

  /**
   * Dispara el correo de DSpace para que el usuario fije su contraseña.
   * Usa accountRequestType=forgot porque el eperson ya existe: register está
   * pensado para autoregistro desde el formulario público, nuestro caso no.
   */
  private triggerPasswordSetupEmail(email: string): Observable<unknown> {
    return this.http.post(
      `${DSPACE_API_BASE}${REGISTRATIONS_COLLECTION_PATH}`,
      { email, type: REGISTRATION_TYPE },
      { params: new HttpParams().set('accountRequestType', ACCOUNT_REQUEST_FORGOT) },
    );
  }
}
