/**
 * Estructuras del recurso /api/submission/workspaceitems de DSpace 9.x.
 * El workspaceitem es un item en construcción que vive durante el flujo
 * de submission antes de archivarse.
 */

export interface WorkspaceItemError {
  message: string;
  paths: string[];
}

/**
 * Modelo mínimo del workspaceitem. El shape de `sections` varía según la
 * configuración de submission-forms.xml: cada step puede tener su propia
 * estructura interna. Se modela como `unknown` para preservar el shape
 * original sin perder información que el caller pueda necesitar.
 */
export interface WorkspaceItem {
  id: number;
  type: 'workspaceitem';
  errors?: WorkspaceItemError[];
  lastModified?: string;
  sections?: Record<string, unknown>;
  _links?: Record<string, { href: string }>;
  _embedded?: Record<string, unknown>;
}
