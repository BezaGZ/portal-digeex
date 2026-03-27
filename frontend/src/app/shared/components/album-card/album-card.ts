import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { Album } from '../../../features/gallery/services/gallery.service';

@Component({
  selector: 'app-album-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './album-card.html',
  styles: [
    `
      :host {
        display: block;
      }

      .album-card {
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        height: 100%;
      }

      .album-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 12px 24px -10px rgba(30, 49, 89, 0.3);
      }

      .album-cover {
        width: 100%;
        height: 240px;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .album-card:hover .album-cover {
        transform: scale(1.05);
      }

      .cover-container {
        position: relative;
        overflow: hidden;
        border-radius: 8px 8px 0 0;
      }

      .album-date {
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .album-title {
        font-size: 1.25rem;
        color: var(--gob-azul-gobierno);
        margin-bottom: 8px;
        line-height: 1.3;
        text-align: center;
      }

      .album-description {
        color: var(--color-text-secondary);
        line-height: 1.5;
        margin-bottom: 16px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-align: center;
      }
    `,
  ],
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
