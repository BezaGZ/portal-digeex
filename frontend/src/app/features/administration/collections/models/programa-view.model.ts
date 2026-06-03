import { Collection } from '../../../../core/api/models/collection.model';

/**
 * Vista enriquecida de un programa (collection) para la pantalla de
 * gestión. Agrega `recursosCount` derivado de `archivedItemsCount`
 * (requiere `webui.strengths.show=true` en backend).
 */
export interface ProgramaView extends Collection {
  recursosCount?: number;
}
