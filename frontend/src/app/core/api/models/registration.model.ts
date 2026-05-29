/**
 * Datos expuestos por `/api/eperson/registrations` de DSpace 9.x.
 * `registrationType` discrimina el flujo: `forgot` trae el `user` UUID del
 * eperson existente; `register` puede traerlo null porque aún no se creó.
 */
export interface Registration {
  id: number;
  email: string;
  user: string | null;
  registrationType: string;
  netId: string | null;
}
