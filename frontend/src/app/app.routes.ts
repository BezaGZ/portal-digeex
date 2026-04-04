import { Routes } from '@angular/router';

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
        loadComponent: () => import('./features/administration/dashboard/dashboard').then(m => m.Dashboard),
        data: { breadcrumb: 'Estadística' }
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
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'restablecer-contrasena',
    loadComponent: () => import('./features/auth/reset-password/reset-password').then(m => m.ResetPasswordComponent)
  },

  {
    path: 'administrador',
    loadComponent: () => import('./layout/admin-layout/app.layout/app.layout').then(m => m.AppLayout),
    data: { breadcrumb: 'Administrador' },
    children: [
      {
        path: 'estadisticas',
        loadComponent: () => import('./features/administration/dashboard/dashboard').then(m => m.Dashboard),
        data: { breadcrumb: 'Estadísticas' }
      },
      {
        path: 'comunidades',
        loadComponent: () => import('./features/administration/communities/communities').then(m => m.Communities),
        data: { breadcrumb: 'Comunidades' }
      },
      {
        path: 'colecciones',
        loadComponent: () => import('./features/administration/collections/collections').then(m => m.Collections),
        data: { breadcrumb: 'Colecciones' }
      },
      {
        path: 'envios',
        loadComponent: () => import('./features/administration/submissions/submissions').then(m => m.Submissions),
        data: { breadcrumb: 'Envíos' }
      },
      {
        path: 'usuarios',
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
