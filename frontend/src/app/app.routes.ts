import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { ROLE_SCOPES } from './core/auth/role-scopes';
import { featureGuard } from './core/auth/feature.guard';
import { ownSubmissionGuard } from './core/auth/own-submission.guard';
import { rolePresenceGuard } from './core/auth/role-presence.guard';
import { ITEMS_PATH, COLLECTIONS_PATH, COMMUNITIES_PATH } from './core/api/dspace-rest.util';
export const routes: Routes = [

  {
    path: '',
    loadComponent: () => import('./layout/public-layout').then(m => m.PublicLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home').then(m => m.Home)
      },
      {
        path: 'programas/:id',
        loadComponent: () => import('./features/programs/program-view/program-view').then(m => m.ProgramView),
      },
      {
        path: 'programas/:id/documentos/:docId',
        loadComponent: () => import('./features/programs/document-detail/document-detail').then(m => m.DocumentDetail),
      },
      {
        path: 'documentos/:docId',
        loadComponent: () => import('./features/programs/document-detail/document-detail').then(m => m.DocumentDetail),
      },
      {
        path: 'busqueda-avanzada',
        loadComponent: () => import('./features/search/advanced-search').then(m => m.AdvancedSearch),
        data: { breadcrumb: 'Búsqueda Avanzada' }
      },
      {
        path: 'estadistica',
        data: { breadcrumb: 'Estadística' },
        children: [
          {
            path: '',
            loadComponent: () => import('./features/stats/stats-list/stats-list').then(m => m.StatsList),
          },
          {
            path: ':uuid/item/:itemUuid',
            /**
             * Importar primero los renderers garantiza que `registerStatsRenderer`
             * de cada dataset (`docentes`, `estudiantes`, etc.) corrió antes de
             * que el detalle intente resolver el `digeex.statsDataset` contra el
             * registry; sin esto el registry queda vacío en runtime con lazy
             * loading y aparece "Tipo de dataset no soportado" para cualquier item.
             */
            loadComponent: () =>
              import('./features/stats/renderers/docentes-renderer')
                .then(() => import('./features/stats/renderers/estudiantes-renderer'))
                .then(() => import('./features/stats/stats-detail/stats-detail'))
                .then(m => m.StatsDetail),
          },
          {
            path: ':uuid',
            loadComponent: () => import('./features/stats/stats-list/stats-list').then(m => m.StatsList),
          },
        ],
      },
      {
        path: 'galeria',
        data: { breadcrumb: 'Galería Institucional' },
        children: [
          {
            path: '',
            loadComponent: () => import('./features/gallery/gallery').then(m => m.Gallery)
          },
          {
            path: ':uuid/album/:id',
            loadComponent: () => import('./features/gallery/components/album-viewer/album-viewer').then(m => m.AlbumViewer),
            data: { breadcrumb: 'Álbum' }
          },
          {
            path: ':uuid',
            loadComponent: () => import('./features/gallery/gallery').then(m => m.Gallery)
          },
        ]
      }
    ]
  },

  {
    path: 'iniciar-sesion',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },

  {
    path: 'restablecer-contrasena',
    loadComponent: () =>
      import('./features/auth/password-reset-request/password-reset-request').then(
        m => m.PasswordResetRequest,
      ),
  },

  {
    path: 'restablecer-contrasena/:token',
    loadComponent: () =>
      import('./features/auth/password-reset-confirm/password-reset-confirm').then(
        m => m.PasswordResetConfirm,
      ),
  },

  {
    path: 'forgot/:token',
    redirectTo: 'restablecer-contrasena/:token',
  },

  {
    path: 'administrador',
    canActivate: [authGuard, rolePresenceGuard()],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/admin-layout/app.layout/app.layout').then(m => m.AppLayout),
    data: { breadcrumb: 'Administrador' },
    children: [
   
      {
        path: '',
        loadComponent: () => import('./features/administration/welcome/welcome').then(m => m.Welcome),
        pathMatch: 'full',
      },
      {
        path: 'estadisticas',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN)],
        loadComponent: () => import('./features/administration/dashboard/dashboard').then(m => m.Dashboard),
        data: { breadcrumb: 'Estadísticas del portal' }
      },
      {
        path: 'digeex',
        canActivate: [roleGuard(ROLE_SCOPES.SUPERADMIN_ONLY)],
        loadComponent: () => import('./features/administration/digeex-root/digeex-root').then(m => m.DigeexRoot),
        data: { breadcrumb: 'DIGEEX' }
      },
      {
        path: 'subdirecciones',
        canActivate: [roleGuard(ROLE_SCOPES.SUPERADMIN_ONLY)],
        loadComponent: () => import('./features/administration/communities/communities').then(m => m.Communities),
        data: { breadcrumb: 'Subdirecciones' }
      },
      {
        path: 'historial/subdirecciones/:uuid',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN), featureGuard('administratorOf', COMMUNITIES_PATH)],
        loadComponent: () =>
          import('./features/administration/history/subdirecciones-detail/subdirecciones-detail').then(
            (m) => m.SubdireccionesDetail,
          ),
      },
      {
        path: 'programas',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN)],
        loadComponent: () => import('./features/administration/collections/collections').then(m => m.Collections),
        data: { breadcrumb: 'Programas' }
      },
      {
        path: 'historial/programas/:uuid',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN), featureGuard('administratorOf', COLLECTIONS_PATH)],
        loadComponent: () =>
          import('./features/administration/history/programas-detail/programas-detail').then(
            (m) => m.ProgramasDetail,
          ),
      },
      {
        path: 'historial/items/:uuid',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN), featureGuard('administratorOf', ITEMS_PATH)],
        loadComponent: () =>
          import('./features/administration/history/items-detail/items-detail').then(
            (m) => m.ItemsDetail,
          ),
      },
      {
        path: 'uso',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN)],
        loadComponent: () =>
          import('./features/administration/statistics/statistics-page').then(
            (m) => m.StatisticsPage,
          ),
        data: { breadcrumb: 'Estadísticas de uso', dsoType: 'site' },
      },
      {
        path: 'uso/items/:uuid',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN), featureGuard('administratorOf', ITEMS_PATH)],
        loadComponent: () =>
          import('./features/administration/statistics/statistics-page').then(
            (m) => m.StatisticsPage,
          ),
        data: { dsoType: 'item' },
      },
      {
        path: 'uso/programas/:uuid',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN), featureGuard('administratorOf', COLLECTIONS_PATH)],
        loadComponent: () =>
          import('./features/administration/statistics/statistics-page').then(
            (m) => m.StatisticsPage,
          ),
        data: { dsoType: 'collection' },
      },
      {
        path: 'programas/:uuid/cargar',
        canActivate: [roleGuard(ROLE_SCOPES.STAFF), featureGuard('canSubmit', COLLECTIONS_PATH)],
        /**
         * Importar primero el bootstrap garantiza que registerSubmissionForm()
         * de cada formulario corrió antes de que el host intente montar el
         * componente; sin esto el registry queda vacío en runtime con lazy
         * loading y aparece "Tipo no soportado" para cualquier colección.
         */
        loadComponent: () =>
          import('./features/administration/submission/submission-forms-bootstrap')
            .then(() => import('./features/administration/submission/submission-page/submission-page'))
            .then(m => m.SubmissionPage),
        data: { breadcrumb: 'Cargar' }
      },
      {
        path: 'cargar',
        canActivate: [roleGuard(ROLE_SCOPES.STAFF)],
        loadComponent: () => import('./features/administration/submission/upload-content/upload-content').then(m => m.UploadContent),
        data: { breadcrumb: 'Cargar contenido' }
      },
      {
        path: 'envios',
        canActivate: [roleGuard(ROLE_SCOPES.STAFF)],
        loadComponent: () => import('./features/administration/submission/my-submissions/my-submissions').then(m => m.MySubmissions),
        data: { breadcrumb: 'Mis envíos' }
      },
      {
        path: 'envios/:uuid/editar',
        canActivate: [roleGuard(ROLE_SCOPES.STAFF), featureGuard('canEditItem', ITEMS_PATH), ownSubmissionGuard()],
        loadComponent: () =>
          import('./features/administration/submission/submission-forms-bootstrap')
            .then(() => import('./features/administration/submission/edit-item/edit-item'))
            .then(m => m.EditItem),
        data: { breadcrumb: 'Editar envío' }
      },
      {
        path: 'recursos',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN)],
        loadComponent: () => import('./features/administration/resources/resources-admin').then(m => m.ResourcesAdmin),
        data: { breadcrumb: 'Recursos' }
      },
      {
        path: 'usuarios',
        canActivate: [roleGuard(ROLE_SCOPES.SUPERADMIN_ONLY)],
        loadComponent: () => import('./features/administration/users/users').then(m => m.Users),
        data: { breadcrumb: 'Usuarios' }
      },
      {
        path: 'perfil',
        loadComponent: () => import('./features/administration/profile/profile').then(m => m.Profile),
        data: { breadcrumb: 'Perfil' }
      },
    ]
  },


  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];
