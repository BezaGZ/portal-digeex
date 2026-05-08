import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

import { Collection } from '../../../../core/api/models/collection.model';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { SubmissionFormHost } from '../submission-form-host';

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
  imports: [SubmissionFormHost],
  templateUrl: './submission-page.html',
})
export class SubmissionPage {
  private readonly route = inject(ActivatedRoute);
  private readonly collectionApi = inject(CollectionApiService);
  private readonly authCaller = inject(AuthCallerService);

  readonly collection = signal<Collection | null>(null);
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const uuid = params.get('uuid');
          if (!uuid) return of(null);
          return this.collectionApi.getOne(uuid);
        }),
      )
      .subscribe((c) => this.collection.set(c));
  }
}
