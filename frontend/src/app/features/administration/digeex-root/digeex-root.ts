import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CommunityFacade } from '../content/services/community-facade';
import { CommunityCreateBody } from '../../../core/api/models/community.model';
import { LoadingSpinner } from '../../../shared/components/loading-spinner/loading-spinner';

/** Datos fijos de la comunidad raíz. Sin descripción ni uri (DSpace asigna el handle). */
const ROOT_NAME = 'DIGEEX';
const ROOT_TITLE = 'Dirección General de Educación Extraescolar';

const ROOT_BODY: CommunityCreateBody = {
  name: ROOT_NAME,
  type: 'community',
  metadata: {
    'dc.title': [{ value: ROOT_TITLE, language: null, authority: null, confidence: -1, place: 0 }],
    // DSpace sobrescribe `name` con dc.title; el nombre corto "DIGEEX" se preserva
    // en dc.title.alternative (mismo patrón que el nombre corto de las subdirecciones).
    'dc.title.alternative': [{ value: ROOT_NAME, language: null, authority: null, confidence: -1, place: 0 }],
  },
};

/**
 * Pantalla de inicialización del repositorio (ruta `/administrador/digeex`, solo
 * superadmin). Si no existe la comunidad raíz DIGEEX, ofrece crearla con datos
 * fijos de solo lectura (sin inputs, sin validaciones). Si ya existe, muestra el
 * estado inicializado y el acceso a Subdirecciones — no permite crear otra ni
 * editar. Reemplaza el bloque de creación de la raíz de setup-dspace.sh.
 */
@Component({
  selector: 'app-digeex-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './digeex-root.html',
  imports: [CardModule, ButtonModule, MessageModule, LoadingSpinner],
})
export class DigeexRoot {
  private readonly communityApi = inject(CommunityApiService);
  private readonly facade = inject(CommunityFacade);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly loading = signal<boolean>(true);
  readonly rootExists = signal<boolean>(false);
  readonly creating = signal<boolean>(false);

  readonly rootName = ROOT_NAME;
  readonly rootTitle = ROOT_TITLE;

  constructor() {
    // Detecta la raíz una vez al entrar: searchTop devuelve la comunidad top-level.
    this.communityApi.searchTop(0, 1).subscribe({
      next: (resp) => {
        this.rootExists.set((resp._embedded?.['communities']?.length ?? 0) > 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onCreate(): void {
    this.creating.set(true);
    this.facade.createRoot$(ROOT_BODY).subscribe({
      next: () => {
        this.toast.add({ severity: 'success', summary: 'Comunidad raíz creada' });
        this.router.navigate(['/administrador/subdirecciones']);
      },
      error: (err: unknown) => {
        this.creating.set(false);
        this.toast.add({
          severity: 'error',
          summary: 'Error',
          detail: err instanceof Error ? err.message : 'No se pudo crear la comunidad raíz',
        });
      },
    });
  }

  goToSubdirecciones(): void {
    this.router.navigate(['/administrador/subdirecciones']);
  }

  cancel(): void {
    this.router.navigate(['/administrador']);
  }
}
