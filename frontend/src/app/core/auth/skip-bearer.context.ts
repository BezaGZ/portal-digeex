import { HttpContextToken } from '@angular/common/http';

/**
 * Marca la petición para que el jwtInterceptor no adjunte el Bearer. La usa el
 * login con credenciales: con Bearer presente DSpace lo trata como refresh y
 * conserva la sesión vieja en lugar de autenticar las credenciales nuevas.
 */
export const SKIP_BEARER = new HttpContextToken<boolean>(() => false);
