/**
 * Modelo crudo de eperson según lo devuelve DSpace 9.2 en
 * GET /api/eperson/epersons. Refleja el payload tal como llega,
 * sin transformaciones de UI.
 */
export interface EPerson {
  uuid: string;
  name: string;
  email: string;
  netid: string | null;
  canLogIn: boolean;
  requireCertificate: boolean;
  selfRegistered: boolean;
  lastActive: string | null;
  metadata: {
    'eperson.firstname'?: Array<{ value: string }>;
    'eperson.lastname'?: Array<{ value: string }>;
    [key: string]: Array<{ value: string }> | undefined;
  };
  type: 'eperson';
}

/**
 * Envoltorio genérico para respuestas paginadas del wrapper HTTP.
 * Aplana la estructura HAL de DSpace (_embedded + page)
 */
export interface Paginated<T> {
  items: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}
