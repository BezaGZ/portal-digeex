import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';

import { Bitstream } from '../../../core/api/models/bitstream.model';

/**
 * Sección "archivos actuales" compartida por los submission forms. Presenta los
 * bitstreams del bundle ORIGINAL con su acción de quitar/restaurar y un paginador
 * opcional; sin lógica de negocio, solo emite la intención del usuario.
 */
@Component({
  selector: 'app-bitstream-bundle-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, PaginatorModule],
  templateUrl: './bitstream-bundle-manager.html',
})
export class BitstreamBundleManager {
  @Input({ required: true }) bitstreams: Bitstream[] = [];
  @Input({ required: true }) pendingDeletes: ReadonlySet<string> = new Set();
  @Input() label = 'Archivos actuales';
  @Input() emptyMessage = 'No hay archivos cargados.';
  @Input() total = 0;
  @Input() size = 0;
  @Input() page = 0;

  @Output() toggleDelete = new EventEmitter<string>();
  @Output() pageChange = new EventEmitter<{ page?: number; rows?: number | null }>();

  /** Paginador visible solo cuando hay tamaño de página y el total lo supera. */
  get showPaginator(): boolean {
    return this.size > 0 && this.total > this.size;
  }

  isPending(uuid: string): boolean {
    return this.pendingDeletes.has(uuid);
  }

  onToggle(uuid: string): void {
    this.toggleDelete.emit(uuid);
  }

  onPage(ev: { page?: number; rows?: number | null }): void {
    this.pageChange.emit(ev);
  }
}
