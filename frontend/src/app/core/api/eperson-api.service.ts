import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { EPerson } from './models/eperson.model';
import { HalListResponse, Paginated } from './models/hal.model';

/** Paths relativos al apiUrl base de DSpace. */
const EPERSONS_PATH = '/eperson/epersons';
const REGISTRATIONS_PATH = '/eperson/registrations';

/** Valores fijos del contrato REST de DSpace. */
const ACCOUNT_REQUEST_FORGOT = 'forgot';
const EPERSON_TYPE = 'eperson';
const REGISTRATION_TYPE = 'registration';

/**
 * Paths de JSON Patch sobre el recurso eperson (contrato DSpace 9.2).
 * `/canLogin` en minúscula la 'i' es lo que espera EPersonLoginReplaceOperation.
 * Los de metadata apuntan solo a `/value` para editar el texto sin reenviar
 * los cuatro campos del entry (value, language, authority, confidence).
 */
const PATCH_PATH_CAN_LOGIN = '/canLogin';
const PATCH_PATH_FIRSTNAME_VALUE = '/metadata/eperson.firstname/0/value';
const PATCH_PATH_LASTNAME_VALUE = '/metadata/eperson.lastname/0/value';
const PATCH_PATH_EMAIL = '/email';

/** Única operación de JSON Patch que usa este wrapper hoy. */
const PATCH_OP_REPLACE = 'replace';

/** Entrada del array de JSON Patch (RFC 6902) que acepta DSpace. */
type JsonPatchReplace = {
  op: typeof PATCH_OP_REPLACE;
  path: string;
  value: string | boolean;
};

/**
 * Construye una operación replace de JSON Patch.
 * Helper a nivel de módulo para que sea stateless y evitar repetir
 * la estructura `{ op: 'replace', path, value }` en cada push.
 */
function replaceOp(path: string, value: string | boolean): JsonPatchReplace {
  return { op: PATCH_OP_REPLACE, path, value };
}

/**
 * Wrapper HTTP del recurso /api/eperson/epersons de DSpace.
 * Solo habla con el backend, sin reglas de negocio.
 * Ciclos 5, 6 y 7 TDD — Sprint 5.
 */
@Injectable({ providedIn: 'root' })
export class EPersonApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/server/api';

  /**
   * Lista epersons paginados desde DSpace.
   * Devuelve la respuesta aplanada en Paginated<EPerson>.
   */
  list(params: { size?: number; page?: number } = {}): Observable<Paginated<EPerson>> {
    const httpParams = this.buildHttpParams(params);

    return this.http
      .get<HalListResponse<EPerson>>(`${this.apiUrl}${EPERSONS_PATH}`, { params: httpParams })
      .pipe(map((response) => this.mapResponse(response)));
  }

  /**
   * Crea un eperson y dispara un registration con accountRequestType=forgot
   * para que el usuario fije su contraseña desde el correo con token.
   * DSpace no acepta password en el POST directo, por eso van encadenados.
   */
  create(input: { email: string; firstName: string; lastName: string }): Observable<EPerson> {
    return this.http
      .post<EPerson>(`${this.apiUrl}${EPERSONS_PATH}`, this.buildEPersonBody(input))
      .pipe(
        switchMap((created) =>
          this.triggerPasswordSetupEmail(input.email).pipe(map(() => created)),
        ),
      );
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
   * Envía un JSON Patch al recurso /eperson/epersons/{uuid}.
   * Centraliza la construcción de la URL y la llamada HTTP para que
   * update() y setActive() tengan un único punto de cambio.
   */
  private sendPatch(uuid: string, patch: JsonPatchReplace[]): Observable<EPerson> {
    return this.http.patch<EPerson>(`${this.apiUrl}${EPERSONS_PATH}/${uuid}`, patch);
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
      `${this.apiUrl}${REGISTRATIONS_PATH}`,
      { email, type: REGISTRATION_TYPE },
      { params: new HttpParams().set('accountRequestType', ACCOUNT_REQUEST_FORGOT) },
    );
  }

  /**
   * Arma HttpParams agregando solo los valores que vinieron definidos.
   * Así evitamos mandar size=undefined o page=undefined al backend.
   */
  private buildHttpParams(params: { size?: number; page?: number }): HttpParams {
    let httpParams = new HttpParams();

    if (params.size !== undefined) {
      httpParams = httpParams.set('size', String(params.size));
    }

    if (params.page !== undefined) {
      httpParams = httpParams.set('page', String(params.page));
    }

    return httpParams;
  }

  /**
   * Aplana la respuesta HAL de DSpace a Paginated<EPerson>.
   * `page.number` se expone como `page` para que el frontend
   * no tenga que conocer la nomenclatura HAL.
   */
  private mapResponse(response: HalListResponse<EPerson>): Paginated<EPerson> {
    return {
      items: response._embedded?.['epersons'] ?? [],
      totalElements: response.page.totalElements,
      totalPages: response.page.totalPages,
      size: response.page.size,
      page: response.page.number,
    };
  }
}
