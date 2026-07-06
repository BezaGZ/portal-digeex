/** Lee el claim `exp` (epoch en segundos) del JWT, o null si no se puede decodificar. */
export function tokenExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True si el `exp` del JWT ya pasó. Token ilegible o sin `exp` → false (no expira). */
export function isTokenExpired(token: string): boolean {
  const exp = tokenExp(token);
  if (exp === null) return false;
  return exp <= Math.floor(Date.now() / 1000);
}
