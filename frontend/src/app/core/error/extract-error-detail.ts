/**
 * Devuelve el detail mas informativo para el toast: mensaje del body del
 * backend, mensaje del propio error, o el fallback del llamador. Un string
 * vacio se trata como ausente (DSpace a veces manda `message: ""`). Acepta
 * tanto `HttpErrorResponse` como `Error` plano para poder consumirse desde
 * `errorToToast` cuando el origen del error no esta estrechado a HTTP.
 */
export function extractErrorDetail(
  err: { error?: unknown; message?: unknown },
  fallback: string,
): string {
  const body = err.error as { message?: unknown } | null | undefined;
  const fromBody = body && typeof body === 'object' ? pickString(body.message) : null;
  return fromBody ?? pickString(err.message) ?? fallback;
}

/** Devuelve el string solo si es no-vacio tras trim; sino null. */
function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
