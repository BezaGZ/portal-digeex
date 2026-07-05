import { Directive, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';

import { Collection } from '../../../core/api/models/collection.model';
import { Item } from '../../../core/api/models/item.model';
import { MetadataValue } from '../../../core/api/models/metadata.model';
import { JsonPatchEntry } from '../../../core/api/json-patch.util';
import { Caller } from '../content/specifications/scope-context.model';
import { canToggleItemVisibility } from '../../../core/auth/role-capabilities';
import {
  SubmissionFacade,
  SubmitItemRequest,
} from '../content/services/submission-facade';
import { ItemAdminFacade } from '../content/services/item-admin-facade';
import { LoadingService, withLoading } from '../../../core/loading';

/**
 * Base abstracta para los formularios de submission. Define el flujo común
 * (validar, armar el request, llamar al facade, manejar estado y errores) y
 * delega a cada subform las decisiones específicas del tipo: nombre de la
 * sección del submission process, construcción del metadata, archivos a
 * subir y visibilidad. Patrón Template Method.
 *
 * El mismo subform sirve para "crear" y "editar": cuando se le pasa el input
 * `item`, el form entra en modo edición. En ese modo se ocultan los dropzones
 * (la gestión de bitstreams va en el ciclo siguiente), se pre-llena el form
 * desde `item.metadata` y el submit dispara `ItemAdminFacade.updateItem$`
 * con el diff JSON Patch que cada subform calcula.
 */
@Directive()
export abstract class BaseSubmissionForm {
  protected readonly facade = inject(SubmissionFacade);
  protected readonly itemFacade = inject(ItemAdminFacade);
  protected readonly toast = inject(MessageService);
  protected readonly router = inject(Router);
  private readonly loading = inject(LoadingService);

  readonly collection = input<Collection | null>(null);
  readonly caller = input.required<Caller>();

  /** Item a editar; si está presente, el form opera en modo edición en lugar de creación. */
  readonly item = input<Item | null>(null);

  /** True mientras el submit está en vuelo; los subforms lo bindean a `[disabled]` del botón. */
  readonly submitting = signal(false);

  /** Conveniencia: el template se ramifica con esto para mostrar/ocultar dropzones y cambiar el label del botón. */
  readonly isEditMode = computed(() => this.item() !== null);

  /** Gate del toggle Pública/Privada: oculto para el delegado, que no podría revertir un item privado. */
  readonly canToggleVisibility = computed(() => canToggleItemVisibility(this.caller()));

  /** Pre-llena el form la primera vez que el input `item` entra con un valor no nulo. */
  private prefilledFor: string | null = null;

  constructor() {
    effect(() => {
      const it = this.item();
      if (it && this.prefilledFor !== it.uuid) {
        this.prefilledFor = it.uuid;
        this.applyItemToForm(it);
      }
    });
  }

  /** Nombre de la `<step-definition>` del submission process configurado para el entity-type. */
  protected abstract getSectionName(): string;

  /** Dict `dc.<element>.<qualifier>` → array de valores que el facade traduce a JSON Patch. */
  protected abstract buildMetadata(): Record<string, MetadataValue[]>;

  /** Bitstreams a subir al bundle ORIGINAL del workspaceitem. */
  protected abstract getFiles(): File[];

  /** `private` hace un PATCH extra a `/discoverable=false` post-archivo (privacidad nivel discovery). */
  protected abstract getVisibility(): 'public' | 'private';

  /** Pre-llena el form desde la metadata del item; solo se invoca en modo edición. */
  protected abstract applyItemToForm(item: Item): void;

  /** Calcula el JSON Patch mínimo para reflejar los cambios del form sobre el item original. */
  protected abstract buildPatchFromForm(item: Item): JsonPatchEntry[];

  /**
   * Imagen opcional que el subform expone como portada del item. La submission
   * API solo soporta upload al bundle ORIGINAL; el facade coloca esta imagen
   * en el bundle THUMBNAIL post-archive. Default null para los subforms que
   * no la usan (Estadística por ejemplo).
   */
  protected getCoverFile(): File | null {
    return null;
  }

  /** Archivos nuevos a subir al bundle ORIGINAL en modo edición. Default vacío. */
  protected getBitstreamsToAdd(): File[] {
    return [];
  }

  /** UUIDs de bitstreams a borrar del bundle ORIGINAL en modo edición. Default vacío. */
  protected getBitstreamsToRemove(): string[] {
    return [];
  }

  /**
   * Orquesta create o update según el modo. Idempotente: si ya hay un submit
   * en vuelo, el segundo llamado se ignora para que un doble click del botón
   * no dispare dos requests.
   */
  submit(): void {
    if (this.submitting()) return;
    if (this.isEditMode()) {
      this.runUpdate();
    } else {
      this.runCreate();
    }
  }

  private runCreate(): void {
    const col = this.collection();
    if (!col) return;

    const req: SubmitItemRequest = {
      collectionUuid: col.uuid,
      sectionName: this.getSectionName(),
      metadata: this.buildMetadata(),
      files: this.getFiles(),
      visibility: this.getVisibility(),
      sufijoSubdireccion: this.caller().sufijo ?? '',
      coverFile: this.getCoverFile() ?? undefined,
    };

    this.submitting.set(true);
    this.facade
      .submitItem$(req)
      .pipe(withLoading(this.loading, { message: 'Subiendo el recurso…' }))
      .subscribe({
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

  private runUpdate(): void {
    const it = this.item();
    if (!it) return;
    const patch = this.buildPatchFromForm(it);
    const visibility = this.getVisibility();
    const coverFile = this.getCoverFile() ?? undefined;
    const visibilityChanged = (visibility === 'public') !== it.discoverable;
    const bitstreamsToAdd = this.getBitstreamsToAdd();
    const bitstreamsToRemove = this.getBitstreamsToRemove();
    const bitstreamsChanged =
      bitstreamsToAdd.length > 0 || bitstreamsToRemove.length > 0;
    if (
      patch.length === 0 &&
      !visibilityChanged &&
      !coverFile &&
      !bitstreamsChanged
    ) {
      this.toast.add({
        severity: 'info',
        summary: 'Sin cambios',
        detail: 'No hay diferencias para guardar.',
      });
      return;
    }

    this.submitting.set(true);
    this.itemFacade
      .editItem$(
        it.uuid,
        {
          patch,
          visibility,
          coverFile,
          bitstreamsToAdd,
          bitstreamsToRemove,
          item: it,
        },
        this.caller().sufijo ?? '',
      )
      .pipe(withLoading(this.loading, { message: 'Guardando los cambios…' }))
      .subscribe({
        next: (updated) => {
          this.toast.add({
            severity: 'success',
            summary: 'Cambios guardados',
            detail: 'El item se actualizó correctamente.',
          });
          this.afterSuccess(updated);
          this.submitting.set(false);
          // Cerrar la edición devolviendo al usuario a su bandeja personal.
          this.router.navigate(['/administrador/envios']);
        },
        error: (err) => {
          this.toast.add({
            severity: 'error',
            summary: 'Error al guardar',
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
