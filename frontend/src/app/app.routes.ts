import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { ROLE_SCOPES } from './core/auth/role-scopes';

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
        loadComponent: () => import('./features/programs/program-view/program-view.component').then(m => m.ProgramViewComponent),
      },
      {
        path: 'programas/:id/documentos/:docId',
        loadComponent: () => import('./features/programs/document-detail/document-detail.component').then(m => m.DocumentDetailComponent),
      },
      {
        path: 'documentos/:docId',
        loadComponent: () => import('./features/programs/document-detail/document-detail.component').then(m => m.DocumentDetailComponent),
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
            path: ':uuid',
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
            path: ':id',
            loadComponent: () => import('./features/gallery/components/album-viewer/album-viewer').then(m => m.AlbumViewer),
            data: { breadcrumb: 'Álbum' }
          }
        ]
      }
    ]
  },

  {
    path: 'iniciar-sesion',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },

  {
    path: 'restablecer-contrasena/:token',
    loadComponent: () =>
      import('./features/auth/password-reset-confirm/password-reset-confirm').then(
        m => m.PasswordResetConfirm,
      ),
  },

  {
    path: 'administrador',
    canActivate: [authGuard],
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
        loadComponent: () => import('./features/administration/dashboard/dashboard').then(m => m.Dashboard),
        data: { breadcrumb: 'Estadísticas' }
      },
      {
        path: 'subdirecciones',
        canActivate: [roleGuard(ROLE_SCOPES.SUPERADMIN_ONLY)],
        loadComponent: () => import('./features/administration/communities/communities').then(m => m.Communities),
        data: { breadcrumb: 'Subdirecciones' }
      },
      {
        path: 'programas',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN)],
        loadComponent: () => import('./features/administration/collections/collections').then(m => m.Collections),
        data: { breadcrumb: 'Programas' }
      },
      {
        path: 'programas/:uuid/cargar',
        canActivate: [roleGuard(ROLE_SCOPES.STAFF)],
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
        canActivate: [roleGuard(ROLE_SCOPES.STAFF)],
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
      {
        path: 'reportes',
        canActivate: [roleGuard(ROLE_SCOPES.ADMIN)],
        loadComponent: () => import('./features/administration/reports/reports').then(m => m.Reports),
        data: { breadcrumb: 'Reportes' }
      }
    ]
  },


  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full'
  }
];
