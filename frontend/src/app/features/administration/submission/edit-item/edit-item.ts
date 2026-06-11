import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

import { BreadcrumbService } from '../../../../core/breadcrumb/breadcrumb.service';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { Item } from '../../../../core/api/models/item.model';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { DocumentSubmissionForm } from '../forms/document-submission-form/document-submission-form';
import { GallerySubmissionForm } from '../forms/gallery-submission-form/gallery-submission-form';
import { StatsSubmissionForm } from '../forms/stats-submission-form/stats-submission-form';

/**
 * Página `/administrador/envios/:uuid/editar`. Carga el item por UUID,
 * lee `dspace.entity.type` de su metadata y monta el form correspondiente
 * en modo edición. Reusa los mismos formularios de creación pasándoles
 * el input `item`, que activa el branch de edición en `BaseSubmissionForm`.
 */
@Component({
  selector: 'app-edit-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-item.html',
  imports: [
    LoadingSpinnerComponent,
    DocumentSubmissionForm,
    GallerySubmissionForm,
    StatsSubmissionForm,
  ],
})
export class EditItem {
  private readonly route = inject(ActivatedRoute);
  private readonly itemApi = inject(ItemApiService);
  private readonly authCaller = inject(AuthCallerService);
  private readonly router = inject(Router);
  private readonly breadcrumb = inject(BreadcrumbService);

  readonly item = signal<Item | null>(null);
  readonly loading = signal(true);
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  /** Tipo de entidad del item; el template lo usa para dispatch al form correcto. */
  readonly entityType = computed(() => {
    const it = this.item();
    return it?.metadata?.['dspace.entity.type']?.[0]?.value ?? '';
  });

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((p) => {
          const uuid = p.get('uuid');
          if (!uuid) return of(null);
          return this.itemApi.getOne(uuid);
        }),
      )
      .subscribe({
        next: (it) => {
          this.item.set(it);
          this.loading.set(false);
          if (!it) {
            this.router.navigate(['/administrador/envios']);
            return;
          }
          this.breadcrumb.setTrail([
            { label: 'Mis envíos', routerLink: '/administrador/envios' },
            { label: 'Editar envío' },
          ]);
        },
        error: () => {
          this.loading.set(false);
          this.router.navigate(['/administrador/envios']);
        },
      });
  }
}
