import { Directive, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';

import { Collection } from '../../../core/api/models/collection.model';
import { Item } from '../../../core/api/models/item.model';
import { MetadataValue } from '../../../core/api/models/metadata.model';
import { Caller } from '../content/specifications/scope-context.model';
import {
  SubmissionFacade,
  SubmitItemRequest,
} from '../content/services/submission-facade';

/**
 * Base abstracta para los formularios de submission. Define el flujo común
 * (validar, armar el request, llamar al facade, manejar estado y errores) y
 * delega a cada subform las decisiones específicas del tipo: nombre de la
 * sección del submission process, construcción del metadata, archivos a
 * subir y visibilidad. Patrón Template Method.
 */
@Directive()
export abstract class BaseSubmissionForm {
  protected readonly facade = inject(SubmissionFacade);
  protected readonly toast = inject(MessageService);
  protected readonly router = inject(Router);

  readonly collection = input.required<Collection>();
  readonly caller = input.required<Caller>();

  /** True mientras el submit está en vuelo; los subforms lo bindean a `[disabled]` del botón. */
  readonly submitting = signal(false);

  /** Nombre de la `<step-definition>` del submission process configurado para el entity-type. */
  protected abstract getSectionName(): string;

  /** Dict `dc.<element>.<qualifier>` → array de valores que el facade traduce a JSON Patch. */
  protected abstract buildMetadata(): Record<string, MetadataValue[]>;

  /** Bitstreams a subir al bundle ORIGINAL del workspaceitem. */
  protected abstract getFiles(): File[];

  /** `private` hace un PATCH extra a `/discoverable=false` post-archivo (privacidad nivel discovery). */
  protected abstract getVisibility(): 'public' | 'private';

  /**
   * Imagen opcional que el subform expone como portada del item. La submission
   * API solo soporta upload al bundle ORIGINAL; el facade coloca esta imagen
   * en el bundle THUMBNAIL post-archive. Default null para los subforms que
   * no la usan (Estadística por ejemplo).
   */
  protected getCoverFile(): File | null {
    return null;
  }

  /**
   * Orquesta la submission completa. Idempotente: si ya hay un submit en
   * vuelo, el segundo llamado se ignora para que un doble click del botón
   * no dispare dos workspaceitems.
   */
  submit(): void {
    if (this.submitting()) return;

    const req: SubmitItemRequest = {
      collectionUuid: this.collection().uuid,
      sectionName: this.getSectionName(),
      metadata: this.buildMetadata(),
      files: this.getFiles(),
      visibility: this.getVisibility(),
      sufijoSubdireccion: this.caller().sufijo ?? '',
      coverFile: this.getCoverFile() ?? undefined,
    };

    this.submitting.set(true);
    this.facade.submitItem$(req).subscribe({
      next: (item) => {
        this.toast.add({
          severity: 'success',
          summary: 'Item enviado',
          detail: 'El recurso quedó archivado en la colección.',
        });
        this.afterSuccess(item);
        this.submitting.set(false);
      },
      error: (err) => {
        this.toast.add({
          severity: 'error',
          summary: 'Error al subir',
          detail: this.extractErrorMessage(err),
        });
        this.submitting.set(false);
      },
    });
  }

  /** Hook opcional para side-effects post-éxito (resetear el form, navegar, etc.). */
  protected afterSuccess(_item: Item): void {
    /* default: no-op. Los subforms sobreescriben si necesitan. */
  }

  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return 'No se pudo completar la operación';
  }
}
