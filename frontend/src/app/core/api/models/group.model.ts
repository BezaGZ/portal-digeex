import { HalLink, HalLinks } from './hal.model';

/**
 * Representa un grupo de DSpace 9.2 (/api/eperson/groups/{uuid}).
 *
 * Alineado al contrato REST de GroupRest.java:
 *  - `name` es el identificador textual visible (ej. "Administrator").
 *  - `permanent` indica si el grupo es intocable (grupos del sistema).
 *  - `_links.object` apunta al DSO dueño del grupo cuando aplica
 *    (Community para adminGroup, Collection para submittersGroup).
 *    Para grupos globales como Administrator viene vacío.
 *  - `_links.epersons` / `_links.subgroups` exponen los miembros.
 *
 * @see GroupRest.java (dspace-server-webapp)
 */
export interface Group {
  uuid: string;
  name: string;
  permanent: boolean;
  type: 'group';
  _links: HalLinks & {
    self: HalLink;
    object: HalLink;
    epersons: HalLink;
    subgroups: HalLink;
  };
}
