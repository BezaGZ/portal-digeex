import { Component, ChangeDetectionStrategy, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ItemView } from '../../../core/api/models';
import { IsoDateLocalPipe } from '../../../core/i18n/iso-date-local.pipe';

/**
 * Card de un item para listados públicos. Lazy: no asume que el listado
 * pre-cargó los bitstreams. El click en "Descargar" emite el ItemView
 * entero y el padre se encarga del lookup de bitstreams + descarga.
 *
 * downloading es un flag opcional que el padre setea mientras resuelve
 * el lookup, así el botón muestra spinner (PrimeNG [loading]).
 */
@Component({
  selector: 'app-document-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule, IsoDateLocalPipe],
  templateUrl: './document-card.html',
})
export class DocumentCardComponent {
  item = input.required<ItemView>();
  downloading = input<boolean>(false);

  cardClick = output<ItemView>();
  download = output<ItemView>();
  watchVideo = output<ItemView>();

  /** True cuando el endpoint /thumbnail devolvió 204/404 y el <img> falló. */
  readonly imageError = signal(false);

  constructor() {
    effect(() => {
      this.item().coverImage;
      this.imageError.set(false);
    });
  }

  get isVideo(): boolean {
    const t = this.item().type;
    return t === 'Video' || t === 'MovingImage';
  }

  onImageError(): void {
    this.imageError.set(true);
  }

  onCardClick() {
    this.cardClick.emit(this.item());
  }

  onDownload(event: Event) {
    event.stopPropagation();
    this.download.emit(this.item());
  }

  onWatchVideo(event: Event) {
    event.stopPropagation();
    this.watchVideo.emit(this.item());
  }
}
