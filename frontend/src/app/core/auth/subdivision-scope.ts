/**
 * ¿El recurso pertenece a la subdirección del caller? Compara el sufijo del
 * caller con el del recurso; un sufijo de recurso nulo nunca cae en scope
 * (fail-closed). El superadmin y los recursos top-level se resuelven antes,
 * en cada consumidor.
 */
export function isSameSubdireccion(
  callerSufijo: string | null,
  targetSufijo: string | null,
): boolean {
  return targetSufijo !== null && callerSufijo === targetSufijo;
}
