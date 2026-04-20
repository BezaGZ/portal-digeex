import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of, tap, switchMap, map, catchError } from 'rxjs';
import { AuthStatus, AuthUser } from './models/auth-session.model';
import { EPerson } from '../api/models';
import { resetCsrfToken } from '../csrf/csrf.interceptor';

/**
 * Servicio central de autenticación para el Portal DIGEEX.
 *
 * Consume los endpoints /api/authn/login, /api/authn/status
 * y /api/authn/logout de DSpace 9.2. Expone signals reactivos
 * para que los componentes sepan si hay sesión activa.
 *
 * @see https://github.com/DSpace/RestContract/blob/main/authentication.md
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = '/server/api/authn';
  private jwt: string | null = null;

  readonly isAuthenticated = signal(false);
  readonly currentUser = signal<AuthUser | null>(null);

  constructor(private readonly http: HttpClient) {}

  /**
   * Envía credenciales a DSpace y establece la sesión.
   *
   * POST /api/authn/login con body x-www-form-urlencoded.
   * El JWT viene en el header Authorization de la respuesta.
   * Después del login llama a status() para obtener el EPerson.
   */
  login(email: string, password: string): Observable<AuthStatus> {
    const body = `user=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });

    return this.http.post(`${this.apiUrl}/login`, body, {
      headers,
      observe: 'response',
    }).pipe(
      tap((response: HttpResponse<unknown>) => {
        const authHeader = response.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          this.jwt = authHeader.substring(7);
        }
      }),
      switchMap(() => this.status()),
      tap((authStatus: AuthStatus) => {
        if (authStatus.authenticated) {
          this.isAuthenticated.set(true);
        }
      }),
      switchMap((authStatus: AuthStatus) => {
        const epersonHref = authStatus._links?.eperson?.href;
        if (authStatus.authenticated && epersonHref) {
          const relativeUrl = epersonHref.replace(/^https?:\/\/[^/]+/, '');
          return this.http.get<EPerson>(relativeUrl).pipe(
            tap((eperson: EPerson) => {
              this.currentUser.set(this.mapEPersonToUser(eperson));
            }),
            map(() => authStatus),
          );
        }
        return [authStatus];
      }),
    );
  }

  /**
   * Cierra la sesión invalidando el token en DSpace.
   *
   * POST /api/authn/logout. Limpia el JWT y los signals.
   * DSpace responde 204 No Content.
   */
  logout(): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/logout`, null).pipe(
      tap(() => {
        this.jwt = null;
        this.isAuthenticated.set(false);
        this.currentUser.set(null);
        resetCsrfToken();
      }),
    );
  }

  /**
   * Consulta el estado de autenticación actual.
   *
   * GET /api/authn/status. DSpace siempre responde 200.
   * El campo authenticated indica si hay sesión activa.
   */
  status(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>(`${this.apiUrl}/status`);
  }

  /**
   * Restaura la sesión al iniciar la aplicación.
   *
   * Llama a GET /api/authn/status para verificar si hay
   * sesión activa (ej. tras recargar la página). Si DSpace
   * responde authenticated: true, obtiene el EPerson y
   * actualiza los signals. También siembra el token CSRF
   * desde el header DSPACE-XSRF-TOKEN de la respuesta.
   *
   * Si falla (backend caído, etc.) no hace nada — el usuario
   * simplemente verá la app sin sesión.
   */
  restoreSession(): Observable<AuthStatus | null> {
    return this.status().pipe(
      switchMap((authStatus: AuthStatus) => {
        if (!authStatus.authenticated) {
          this.isAuthenticated.set(false);
          this.currentUser.set(null);
          return of(authStatus);
        }

        this.isAuthenticated.set(true);

        const epersonHref = authStatus._links?.eperson?.href;
        if (epersonHref) {
          const relativeUrl = epersonHref.replace(/^https?:\/\/[^/]+/, '');
          return this.http.get<EPerson>(relativeUrl).pipe(
            tap((eperson: EPerson) => {
              this.currentUser.set(this.mapEPersonToUser(eperson));
            }),
            map(() => authStatus),
          );
        }

        return of(authStatus);
      }),
      catchError(() => of(null)),
    );
  }

  /**
   * Renueva el JWT enviando el token actual a DSpace.
   *
   * POST /api/authn/login sin body, solo con el header
   * Authorization: Bearer <token-actual>. DSpace responde
   * con un nuevo JWT en el header Authorization.
   */
  refreshToken(): Observable<void> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.jwt}`,
    });

    return this.http.post(`${this.apiUrl}/login`, null, {
      headers,
      observe: 'response',
    }).pipe(
      tap((response: HttpResponse<unknown>) => {
        const authHeader = response.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          this.jwt = authHeader.substring(7);
        }
      }),
      map(() => undefined),
    );
  }

  /**
   * Devuelve el JWT actual para uso en interceptores.
   */
  getToken(): string | null {
    return this.jwt;
  }

  /**
   * Extrae los campos relevantes del EPerson de DSpace
   * al modelo AuthUser que usa el frontend.
   */
  private mapEPersonToUser(eperson: EPerson): AuthUser {
    return {
      uuid: eperson.uuid,
      email: eperson.email,
      firstName: eperson.metadata?.['eperson.firstname']?.[0]?.value ?? '',
      lastName: eperson.metadata?.['eperson.lastname']?.[0]?.value ?? '',
    };
  }
}
