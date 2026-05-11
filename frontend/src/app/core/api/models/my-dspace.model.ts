import { Item } from './item.model';

/**
 * Cada object del `discover/search/objects?configuration=workspace` viene
 * envuelto como un resultado de búsqueda: `type` siempre "discover" y
 * `indexableObject` contiene el recurso real (item archivado, workspaceitem
 * en borrador o workflowitem en revisión). Por ahora el portal solo expone
 * items archivados; los otros tipos se agregan al union cuando aparezcan
 * en el flujo y se cubran con tests.
 */
export interface MyDSpaceObject {
  type: 'discover';
  indexableObject: Item;
}
