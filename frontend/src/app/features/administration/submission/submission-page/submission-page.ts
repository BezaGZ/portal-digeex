import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, switchMap } from 'rxjs/operators';
import { EMPTY } from 'rxjs';

import { ROLE_SCOPES } from '../../../../core/auth/role-scopes';
import { BreadcrumbService } from '../../../../core/breadcrumb/breadcrumb.service';
import { Collection } from '../../../../core/api/models/collection.model';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { SubmissionFormHost } from '../submission-form-host';
import { LoadingSpinner } from '../../../../shared/components/loading-spinner/loading-spinner';

/**
 * Página destino de la ruta `/administrador/programas/:uuid/cargar`. Resuelve
 * la colección por UUID del paramMap y monta el SubmissionFormHost, que a
 * su vez decide qué formulario montar según `dspace.entity.type` de la
 * colección.
 *
 * Hace falta esta página intermedia porque el SubmissionFormHost recibe
 * una `Collection` ya resolvida (no un UUID). Mantener al host puro y
 * delegar el fetch acá deja al host testeable sin HTTP.
 */
@Component({
  selector: 'app-submission-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SubmissionFormHost, LoadingSpinner],
  templateUrl: './submission-page.html',
})
export class SubmissionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly breadcrumb = inject(BreadcrumbService);

  readonly collection = signal<Collection | null>(null);
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const uuid = params.get('uuid');
          if (!uuid) {
            this.failAndRedirect();
            return EMPTY;
          }
          // catchError sobre el observable interno (no sobre el switchMap)
          // para que un getOne fallido no mate el stream del paramMap.
          return this.collectionApi.getOne(uuid).pipe(
            catchError(() => {
              this.failAndRedirect();
              return EMPTY;
            }),
          );
        }),
      )
      .subscribe((c) => this.collection.set(c));

    /**
     * Trail según el scope del caller: las rutas de Programas exigen rol
     * admin (ROLE_SCOPES.ADMIN), así que el delegado recibe como ancla
     * Cargar contenido, que es su punto de entrada real y sí puede abrir.
     */
    effect(() => {
      const c = this.collection();
      if (!c) return;
      const role = this.caller()?.role;
      const isAdmin = role != null && ROLE_SCOPES.ADMIN.includes(role);
      this.breadcrumb.setTrail(
        isAdmin
          ? [
              { label: 'Programas', routerLink: '/administrador/programas' },
              { label: c.name, routerLink: `/administrador/historial/programas/${c.uuid}` },
              { label: 'Cargar' },
            ]
          : [
              { label: 'Cargar contenido', routerLink: '/administrador/cargar' },
              { label: c.name },
              { label: 'Cargar' },
            ],
      );
    });
  }

  /** Redirige al listado de carga con toast cuando la colección no se resuelve. */
  private failAndRedirect(): void {
    this.toast.add({
      severity: 'error',
      summary: 'Programa no encontrado',
      detail: 'El programa solicitado no existe o no está disponible.',
    });
    this.router.navigate(['/administrador/cargar']);
  }
}
