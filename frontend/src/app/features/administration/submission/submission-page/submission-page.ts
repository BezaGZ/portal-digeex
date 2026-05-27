import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, switchMap } from 'rxjs/operators';
import { EMPTY } from 'rxjs';

import { Collection } from '../../../../core/api/models/collection.model';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { SubmissionFormHost } from '../submission-form-host';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';

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
  imports: [SubmissionFormHost, LoadingSpinnerComponent],
  templateUrl: './submission-page.html',
})
export class SubmissionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

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
