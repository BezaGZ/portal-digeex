import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WorkspaceItem } from './models/workspaceitem.model';
import { Item } from './models/item.model';
import { JsonPatchEntry } from './json-patch.util';
import {
  DSPACE_API_BASE,
  URI_LIST_CONTENT_TYPE,
  WORKFLOWITEMS_PATH,
  WORKSPACEITEMS_PATH,
  buildAbsoluteApiUrl,
} from './dspace-rest.util';

/**
 * Wrapper HTTP del recurso /api/submission/workspaceitems de DSpace 9.x.
 *
 * El workspaceitem es el item en construcción que vive entre el inicio
 * de una submission y su archivado. El facade del Bloque 2 lo crea sobre
 * la collection destino, parcha sus secciones, sube los bitstreams y al
 * final lo commitea contra /api/workflow/workflowitems para que pase a
 * item archivado.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceItemApiService {
  private readonly http = inject(HttpClient);

  /**
   * Crea un workspaceitem bajo la collection indicada. DSpace exige el
   * `owningCollection` como query param y un body JSON aunque sea vacío:
   * sin Content-Type application/json el endpoint responde 415.
   */
  create(collectionUuid: string): Observable<WorkspaceItem> {
    const params = new HttpParams().set('owningCollection', collectionUuid);
    return this.http.post<WorkspaceItem>(
      `${DSPACE_API_BASE}${WORKSPACEITEMS_PATH}`,
      {},
      { params },
    );
  }

  /**
   * Aplica un parche JSON sobre el workspaceitem y devuelve el recurso
   * actualizado. El cuerpo es un arreglo de operaciones JSON Patch
   * (RFC 6902) y los paths apuntan a `/sections/<step>/<campo>` o a
   * `/sections/license/granted`.
   */
  patchSection(id: number, patch: JsonPatchEntry[]): Observable<WorkspaceItem> {
    return this.http.patch<WorkspaceItem>(
      `${DSPACE_API_BASE}${WORKSPACEITEMS_PATH}/${id}`,
      patch,
    );
  }

  /**
   * Sube un archivo al workspaceitem como bitstream del bundle ORIGINAL.
   * DSpace recibe multipart con el archivo en la field `file` y devuelve
   * el workspaceitem con `sections.upload.files` actualizado. No se
   * setean `Content-Type` ni `Content-Length` manualmente: HttpClient
   * arma el `multipart/form-data` con el boundary correcto cuando recibe
   * un FormData como body.
   */
  uploadFile(id: number, file: File): Observable<WorkspaceItem> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<WorkspaceItem>(
      `${DSPACE_API_BASE}${WORKSPACEITEMS_PATH}/${id}`,
      form,
    );
  }

  /**
   * Commitea el workspaceitem al workflow para que pase a item archivado.
   * El body es la URI absoluta del workspaceitem con `Content-Type:
   * text/uri-list`. En DIGEEX no hay step de aprobación configurado, así
   * que DSpace archiva directo y devuelve body vacío; el wrapper expone
   * `Observable<void>` para reflejar esa semántica.
   */
  commit(id: number): Observable<void> {
    const headers = new HttpHeaders({ 'Content-Type': URI_LIST_CONTENT_TYPE });
    const workspaceUri = buildAbsoluteApiUrl(`${WORKSPACEITEMS_PATH}/${id}`);
    return this.http.post<void>(
      `${DSPACE_API_BASE}${WORKFLOWITEMS_PATH}`,
      workspaceUri,
      { headers },
    );
  }

  /**
   * Resuelve el item en construcción asociado al workspaceitem. El UUID
   * que devuelve es el mismo que tendrá el item cuando se archive con
   * `commit()`, por eso se llama una sola vez antes del commit y se
   * reutiliza después para PATCHes sobre el item ya archivado (por
   * ejemplo `/discoverable=false` para items privados).
   */
  getItem(id: number): Observable<Item> {
    return this.http.get<Item>(`${DSPACE_API_BASE}${WORKSPACEITEMS_PATH}/${id}/item`);
  }

  /**
   * Borra el workspaceitem por id. DSpace responde 204 sin body. Lo usa
   * el facade del Bloque 2 para hacer rollback cuando un paso intermedio
   * de la submission falla y el workspaceitem queda colgado.
   */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${DSPACE_API_BASE}${WORKSPACEITEMS_PATH}/${id}`);
  }
}
