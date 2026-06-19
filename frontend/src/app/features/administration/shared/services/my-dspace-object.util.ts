import { MyDSpaceObject } from '../../../../core/api/models/my-dspace.model';

/**
 * Helpers puros sobre `MyDSpaceObject` para las pantallas de admin que
 * listan items via Discovery (`Mis envíos`, `/administrador/recursos`).
 * Cada función deriva un string o flag a partir de la metadata cruda;
 * no toca HTTP ni signals.
 */

/** Título visible del item; cae a `name` si no hay `dc.title`. */
export function titleOf(o: MyDSpaceObject): string {
  return o.indexableObject.metadata?.['dc.title']?.[0]?.value ?? o.indexableObject.name;
}

/** URL del thumbnail embebido; `null` cuando el item no tiene bundle THUMBNAIL. */
export function coverUrlOf(o: MyDSpaceObject): string | null {
  const uuid = o.indexableObject.thumbnail?.uuid;
  return uuid ? `/server/api/core/bitstreams/${uuid}/content` : null;
}

/** Valor crudo de `dc.date.issued`; string vacío si no viene poblado. El
 *  formato de display lo aplica el pipe `isoDateLocal` en el template (fuente
 *  única del formato de fecha del proyecto). */
export function issuedOf(o: MyDSpaceObject): string {
  return o.indexableObject.metadata?.['dc.date.issued']?.[0]?.value ?? '';
}

/** Entity-type del item (Documento, Galeria, Estadistica) o `—` si no lo trae. */
export function resourceTypeOf(o: MyDSpaceObject): string {
  return o.indexableObject.metadata?.['dspace.entity.type']?.[0]?.value ?? '—';
}

/**
 * Etiqueta de tipo granular: `dc.type` (Video, Manual, Capacitación...) con
 * fallback al entity-type cuando el item no tiene `dc.type` (caso Estadística).
 */
export function entityTypeOf(o: MyDSpaceObject): string {
  return (
    o.indexableObject.metadata?.['dc.type']?.[0]?.value ??
    o.indexableObject.metadata?.['dspace.entity.type']?.[0]?.value ??
    '—'
  );
}

/**
 * Estado del item a partir de los flags nativos: `withdrawn` gana porque
 * oculta el acceso directo; `discoverable=false` marca privacidad nivel
 * discovery sobre los activos.
 */
export function stateOf(o: MyDSpaceObject): 'Pública' | 'Privada' | 'Eliminada' {
  const item = o.indexableObject;
  if (item.withdrawn) return 'Eliminada';
  if (!item.discoverable) return 'Privada';
  return 'Pública';
}

/** True cuando el item está retirado del archivo público. */
export function isWithdrawn(o: MyDSpaceObject): boolean {
  return o.indexableObject.withdrawn === true;
}
