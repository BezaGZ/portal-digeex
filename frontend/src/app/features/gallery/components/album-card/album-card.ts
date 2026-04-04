import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { Album } from '../../models';

@Component({
  selector: 'app-album-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './album-card.html',
  styleUrls: ['./album-card.scss'],
})
export class AlbumCardComponent {
  album = input.required<Album>();

  cardClick = output<Album>();

  onCardClick() {
    this.cardClick.emit(this.album());
  }

  onButtonClick(event: Event) {
    event.stopPropagation();
    this.cardClick.emit(this.album());
  }
}
