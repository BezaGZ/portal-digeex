import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ItemView, BitstreamView } from '../../../core/api/models';

@Component({
  selector: 'app-document-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './document-card.html',
})
export class DocumentCardComponent {
  item = input.required<ItemView>();

  cardClick = output<ItemView>();
  download = output<BitstreamView>();
  watchVideo = output<ItemView>();

  get isVideo(): boolean {
    return this.item().type === 'MovingImage';
  }

  onCardClick() {
    this.cardClick.emit(this.item());
  }

  onDownload(event: Event, bitstream: BitstreamView) {
    event.stopPropagation();
    this.download.emit(bitstream);
  }

  onWatchVideo(event: Event) {
    event.stopPropagation();
    this.watchVideo.emit(this.item());
  }
}
