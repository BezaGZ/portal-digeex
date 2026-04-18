import { Injectable } from '@angular/core';

/**
 * Servicio central de autenticación para el Portal DIGEEX.
 *
 * Consume los endpoints /api/authn/login, /api/authn/status
 * y /api/authn/logout de DSpace 9.2. Expone signals reactivos
 * para que los componentes sepan si hay sesión activa.
 *
 */
@Injectable({ providedIn: 'root' })
export class AuthService {}
