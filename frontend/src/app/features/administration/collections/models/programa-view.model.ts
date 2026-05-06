import { Collection } from '../../../../core/api/models/collection.model';

/**
 * Vista enriquecida de un programa (collection) para la pantalla de
 * gestión. Extiende Collection con `recursosCount` resuelto vía
 * Discovery scope-filtered, no se lee del campo `archivedItemsCount`
 * del recurso porque DSpace 9.x lo devuelve sin actualizar incluso
 * después de reindexar Solr.
 */
export interface ProgramaView extends Collection {
  recursosCount?: number;
}
