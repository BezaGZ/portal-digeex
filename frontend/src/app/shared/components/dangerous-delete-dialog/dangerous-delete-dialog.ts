import { Component, ChangeDetectionStrategy, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';

/** Tipo de recurso que se borra; gobierna los textos del diálogo. */
export type DangerousDeleteKind = 'programa' | 'subdireccion' | 'recurso';

/**
 * Diálogo presentacional de borrado destructivo, reusable para programa,
 * subdirección y recurso. Pide teclear el nombre completo del recurso para
 * habilitar el botón Eliminar (confirmación deliberada) y muestra qué se borrará.
 *
 * No hace HTTP ni conoce facades: recibe los datos por inputs y emite la
 * intención; la pantalla que lo monta resuelve conteos/títulos y el borrado.
 */
@Component({
  selector: 'app-dangerous-delete-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dangerous-delete-dialog.html',
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, LoadingSpinnerComponent],
})
export class DangerousDeleteDialog {
  readonly visible = input.required<boolean>();
  readonly entityKind = input.required<DangerousDeleteKind>();
  /** Nombre completo (dc.title) que el usuario debe teclear para confirmar. */
  readonly entityLabel = input.required<string>();
  /** true mientras corre el borrado: bloquea los botones para evitar doble disparo. */
  readonly deleting = input<boolean>(false);

  /** Recursos (items propios) que se borrarán; null mientras se resuelve. */
  readonly itemsCount = input<number | null>(null);
  /** Programas que se borrarán; solo aplica a subdirección. */
  readonly programsCount = input<number | null>(null);
  /** Títulos a listar: items para programa, programas para subdirección. */
  readonly affectedTitles = input<string[]>([]);
  /** Encabezado de la lista de títulos. */
  readonly affectedTitlesLabel = input<string>('');
  /** true mientras llega el detalle del backend (conteos/títulos). */
  readonly loadingContent = input<boolean>(false);
  /** true si el detalle no se pudo cargar; se avisa sin bloquear el borrado. */
  readonly loadError = input<boolean>(false);

  /** El usuario tecleó bien el nombre y confirmó el borrado. */
  readonly confirmed = output<void>();
  /** El usuario canceló o cerró el diálogo sin borrar. */
  readonly cancelled = output<void>();
  /** Pide a la pantalla padre cerrar el diálogo (para el binding de visibilidad). */
  readonly visibleChange = output<boolean>();

  /** Texto tecleado por el usuario en el campo de confirmación. */
  readonly typed = signal<string>('');

  constructor() {
    // Al cerrarse descarta lo tecleado: evita que la próxima apertura quede
    // pre-confirmada con el nombre de un recurso anterior.
    effect(() => {
      if (!this.visible()) {
        this.typed.set('');
      }
    });
  }

  /**
   * Habilita Eliminar solo con coincidencia exacta (trim para tolerar espacios
   * accidentales; sin normalizar acentos/mayúsculas para que sea deliberado).
   */
  readonly canConfirm = computed(
    () => !this.deleting() && this.typed().trim().length > 0 && this.typed().trim() === this.entityLabel().trim(),
  );

  readonly headerText = computed(() => {
    switch (this.entityKind()) {
      case 'subdireccion':
        return 'Eliminar subdirección';
      case 'recurso':
        return 'Eliminar recurso';
      default:
        return 'Eliminar programa';
    }
  });

  /** Resumen de lo que se borra; para subdirección suma programas + recursos. */
  readonly summaryText = computed(() => {
    if (this.entityKind() === 'recurso') {
      return 'Se eliminará el recurso de forma permanente.';
    }
    const items = this.itemsCount() ?? 0;
    const itemsText = `${items} ${items === 1 ? 'recurso' : 'recursos'}`;
    if (this.entityKind() === 'subdireccion') {
      const programs = this.programsCount() ?? 0;
      const programsText = `${programs} ${programs === 1 ? 'programa' : 'programas'}`;
      return `Se eliminarán ${programsText} y ${itemsText} de forma permanente.`;
    }
    return `Se eliminarán ${itemsText} de forma permanente.`;
  });

  /**
   * Cuántos quedan sin listar. La lista trae una muestra acotada; el total es
   * programsCount (subdirección) o itemsCount (programa). El resto va como "y N más".
   */
  readonly extraCount = computed(() => {
    const total = this.entityKind() === 'subdireccion' ? (this.programsCount() ?? 0) : (this.itemsCount() ?? 0);
    return Math.max(0, total - this.affectedTitles().length);
  });

  /** Confirma el borrado; ignora el clic si el nombre no coincide (defensa extra al [disabled]). */
  onConfirm(): void {
    if (this.canConfirm()) {
      this.confirmed.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
    this.visibleChange.emit(false);
  }
}
