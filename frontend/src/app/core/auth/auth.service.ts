import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, of, tap, switchMap, map, catchError } from 'rxjs';
import Cookies from 'js-cookie';
import { SKIP_BEARER } from './skip-bearer.context';
import { AuthStatus, AuthUser } from './models/auth-session.model';
import { EPerson } from '../api/models';
import { environment } from '../../../environments/environment';

/**
 * Nombre de la cookie donde se guarda el JWT entre recargas. Se mantiene
 * idéntico al que usa dspace-angular para que el patrón sea reconocible
 * entre proyectos del ecosistema DSpace.
 */
const TOKENITEM = 'dsAuthInfo';

/**
 * Vida útil de la cookie del JWT en milisegundos. DSpace 9.2 emite tokens
 * con `exp` típicamente menor a 24h, así que 24h es un techo conservador.
 */
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Forma serializada que se guarda dentro de la cookie. `expires` se usa
 * en el guard del lado cliente; el `exp` interno del JWT sigue siendo la
 * fuente de verdad para el servidor.
 */
interface AuthTokenInfo {
  accessToken: string;
  expires: number;
}

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

  readonly isAuthenticated = signal(false);
  readonly currentUser = signal<AuthUser | null>(null);

  /**
   * EPerson bruto del caller con `_embedded.groups` incluidos, tal como
   * DSpace lo devuelve ante `GET /epersons/{uuid}?embed=groups`. Fuente
   * única de rol y subdivisión para el facade de usuarios: con este
   * signal cacheado, `currentUserView$` resuelve el rol sin disparar
   * un roundtrip adicional al backend.
   */
  readonly currentEPerson = signal<EPerson | null>(null);

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
      context: new HttpContext().set(SKIP_BEARER, true),
    }).pipe(
      tap((response: HttpResponse<unknown>) => {
        const authHeader = response.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          this.storeToken(authHeader.substring(7));
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
          return this.fetchEPersonWithGroups(epersonHref).pipe(
            tap((eperson: EPerson) => {
              this.currentUser.set(this.mapEPersonToUser(eperson));
              this.currentEPerson.set(eperson);
            }),
            map(() => authStatus),
          );
        }
        return of(authStatus);
      }),
    );
  }

  /**
   * Cierra la sesión invalidando el token en DSpace.
   *
   * POST /api/authn/logout (responde 204). La sesión local se purga también
   * si el POST falla: la intención del usuario es salir, y conservarla con el
   * backend caído dejaría rebotando a la cuenta sin rol entre login y panel.
   */
  logout(): Observable<unknown> {
    const clearLocalSession = () => {
      this.removeToken();
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
      this.currentEPerson.set(null);
    };
    return this.http.post(`${this.apiUrl}/logout`, null).pipe(
      tap({ next: clearLocalSession, error: clearLocalSession }),
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
   * Restaura la sesion al iniciar la app: GET /api/authn/status, y si
   * authenticated es true trae el EPerson y siembra el token CSRF. Antes de
   * llamar al backend purga la cookie `dsAuthInfo` si su `expires` ya paso
   * para que el `jwtInterceptor` no adjunte un Bearer caduco.
   */
  restoreSession(): Observable<AuthStatus | null> {
    this.purgeIfExpired();

    return this.status().pipe(
      switchMap((authStatus: AuthStatus) => {
        if (!authStatus.authenticated) {
          this.isAuthenticated.set(false);
          this.currentUser.set(null);
          this.currentEPerson.set(null);
          return of(authStatus);
        }

        this.isAuthenticated.set(true);

        const epersonHref = authStatus._links?.eperson?.href;
        if (epersonHref) {
          return this.fetchEPersonWithGroups(epersonHref).pipe(
            tap((eperson: EPerson) => {
              this.currentUser.set(this.mapEPersonToUser(eperson));
              this.currentEPerson.set(eperson);
            }),
            map(() => authStatus),
          );
        }

        return of(authStatus);
      }),
      catchError((error: unknown) => {
        /**
         * 401/403 borran la cookie porque el backend rechaza el token actual.
         * Otros errores (red caida, 5xx) la dejan intacta: puede seguir siendo valida.
         */
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          this.removeToken();
        }
        return of(null);
      }),
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
      Authorization: `Bearer ${this.getToken()}`,
    });

    return this.http.post(`${this.apiUrl}/login`, null, {
      headers,
      observe: 'response',
    }).pipe(
      tap((response: HttpResponse<unknown>) => {
        const authHeader = response.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          this.storeToken(authHeader.substring(7));
        }
      }),
      map(() => undefined),
    );
  }

  /**
   * Devuelve el JWT actual leyéndolo de la cookie persistente.
   * Sobrevive al reload del navegador, que es la diferencia con
   * mantener el token solo en memoria.
   *
   * Sanea primero la cookie con `purgeIfExpired()`: un JWT cuyo plazo
   * local ya pasó no debe adjuntarse a nuevas peticiones porque DSpace
   * lo va a rechazar y el `jwtInterceptor` dispararía un redirect a
   * /login en medio del arranque.
   */
  getToken(): string | null {
    this.purgeIfExpired();
    const raw = Cookies.get(TOKENITEM);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AuthTokenInfo;
      return parsed.accessToken ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Persiste el JWT en la cookie `dsAuthInfo` con vencimiento de 24h.
   * `path: '/'` garantiza que la cookie viaje a todas las rutas del portal
   * independientemente de dónde se haya creado. `sameSite: 'lax'` permite
   * el flujo de reset-password que navega al portal desde el enlace del
   * correo. `secure` se activa en HTTPS (prod) y se deja apagado en HTTP
   * local (dev) porque el navegador descarta cookies `Secure` en HTTP.
   */
  private storeToken(accessToken: string): void {
    const tokenInfo: AuthTokenInfo = {
      accessToken,
      expires: Date.now() + TOKEN_LIFETIME_MS,
    };
    Cookies.set(TOKENITEM, JSON.stringify(tokenInfo), {
      expires: new Date(tokenInfo.expires),
      path: '/',
      sameSite: 'lax',
      secure: environment.production,
    });
  }

  /**
   * Borra la cookie `dsAuthInfo` para que un próximo reload arranque sin sesión.
   * Requiere `path: '/'` idéntico al del `set`; si no, `js-cookie` no la elimina.
   */
  removeToken(): void {
    Cookies.remove(TOKENITEM, { path: '/' });
  }

  /**
   * Borra la cookie `dsAuthInfo` si su `expires` ya pasó. Permite que el
   * resto del servicio asuma que cualquier cookie presente sigue vigente
   * del lado cliente y que el `jwtInterceptor` no adjuntará Bearers caducos.
   * Cookies ilegibles se dejan como están: `getToken()` devolverá null y el
   * próximo login las sobrescribe.
   */
  private purgeIfExpired(): void {
    const raw = Cookies.get(TOKENITEM);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as AuthTokenInfo;
      if (parsed.expires && parsed.expires < Date.now()) {
        this.removeToken();
      }
    } catch {
      /* cookie ilegible: getToken devolverá null sin tocar el almacenamiento. */
    }
  }

  /**
   * Rehidrata `currentUser` y `currentEPerson` con el EPerson devuelto por un
   * PATCH de identidad, reusando el mapper de `login()` y `restoreSession()`
   * para que la forma del AuthUser sea idéntica sin importar el origen. El
   * PATCH no pide `?embed=groups`, así que `currentEPerson` se pobla con
   * `mergeEmbeddedGroups`: preserva los grupos del snapshot previo (el rol
   * no cambia por un edit de nombre). Es no-op sin sesión activa para que
   * una respuesta tardía post-logout no pueble los signals por accidente.
   */
  setCurrentUserFromEPerson(eperson: EPerson): void {
    if (!this.currentUser()) return;
    this.currentUser.set(this.mapEPersonToUser(eperson));
    this.currentEPerson.set(this.mergeEmbeddedGroups(eperson));
  }

  /**
   * GET al eperson con `?embed=groups`. Obtiene identidad y membresía en
   * un solo roundtrip para que el facade de usuarios resuelva rol desde
   * el signal cacheado sin pegarle otra vez al backend. El href viene
   * absoluto en el status, así que se recorta al path relativo antes
   * de emitirlo (el interceptor JWT espera rutas del dominio del portal).
   */
  private fetchEPersonWithGroups(epersonHref: string): Observable<EPerson> {
    const relativeUrl = epersonHref.replace(/^https?:\/\/[^/]+/, '');
    const urlWithEmbed = relativeUrl.includes('?')
      ? `${relativeUrl}&embed=groups`
      : `${relativeUrl}?embed=groups`;
    return this.http.get<EPerson>(urlWithEmbed);
  }

  /**
   * Si el EPerson recibido carece de `_embedded.groups` (caso típico de un
   * PATCH de identidad que no pide embed), preserva los del snapshot previo.
   * La membresía no cambia por un edit de nombre y descartarla forzaría al
   * facade a refetch del rol. Devuelve el EPerson tal cual si ya trae embed
   * o si no hay snapshot previo del cual heredar.
   */
  private mergeEmbeddedGroups(eperson: EPerson): EPerson {
    if (eperson._embedded?.groups) return eperson;
    const priorGroups = this.currentEPerson()?._embedded?.groups;
    if (!priorGroups) return eperson;
    return { ...eperson, _embedded: { ...eperson._embedded, groups: priorGroups } };
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
