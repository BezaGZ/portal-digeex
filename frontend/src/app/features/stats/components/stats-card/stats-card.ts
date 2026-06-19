import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { StatsItem } from '../../models/stats-item.model';
import { IsoDateLocalPipe } from '../../../../core/i18n/iso-date-local.pipe';

/**
 * Card del listado público de Estadística. Layout: icono grande arriba,
 * título, descripción truncada (line-clamp-3) y fecha en columna, botón
 * "Ver" abajo. Un icono `i` en la esquina superior derecha abre un
 * `<p-dialog>` con la descripción completa para los textos largos sin
 * romper el layout de la card. El click del icono detiene la propagación
 * para no disparar la navegación al detalle.
 */
@Component({
  selector: 'app-stats-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule, DialogModule, IsoDateLocalPipe],
  templateUrl: './stats-card.html',
})
export class StatsCardComponent {
  @Input({ required: true }) item!: StatsItem;
  @Output() readonly open = new EventEmitter<string>();

  readonly showInfoDialog = signal(false);

  emitOpen(): void {
    this.open.emit(this.item.uuid);
  }

  /**
   * Abre el dialog con la descripción completa. `stopPropagation` evita que
   * el click escale al `<p-card>` y dispare la navegación al detalle, que es
   * el comportamiento esperado del click sobre el cuerpo de la card.
   */
  openInfo(event: MouseEvent): void {
    event.stopPropagation();
    this.showInfoDialog.set(true);
  }

  closeInfo(): void {
    this.showInfoDialog.set(false);
  }
}
