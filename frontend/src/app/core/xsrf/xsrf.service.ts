import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, take } from 'rxjs';

/**
 * Pide a DSpace el primer token CSRF cuando arranca la app, para que la primera
 * operacion que modifique datos ya tenga uno valido. Equivale al servicio de
 * arranque de dspace-angular, sin la parte de SSR que este proyecto no usa.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/csrf-tokens.md
 */
@Injectable({ providedIn: 'root' })
export class XsrfService {
  /** Pasa a true cuando el primer token CSRF llega del backend. */
  readonly tokenInitialized$ = new BehaviorSubject(false);

  private readonly http = inject(HttpClient);

  /**
   * Fuerza la creacion del primer token: GET /security/csrf lo devuelve en el
   * header DSPACE-XSRF-TOKEN, que el xsrfInterceptor guarda en la cookie.
   * Resuelve de inmediato; la app no espera a que la peticion termine.
   */
  initXSRFToken(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.http.get('/server/api/security/csrf').pipe(take(1)).subscribe(() => {
        this.tokenInitialized$.next(true);
      });

      resolve();
    });
  }
}
