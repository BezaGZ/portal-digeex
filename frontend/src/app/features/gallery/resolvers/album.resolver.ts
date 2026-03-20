import { ResolveFn } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GalleryService, Album } from '../services/gallery.service';

export const albumResolver: ResolveFn<Album | undefined> = (
  route,
): Observable<Album | undefined> => {
  const galleryService = inject(GalleryService);
  const albumId = route.paramMap.get('id');

  if (!albumId) {
    return new Observable((observer) => {
      observer.next(undefined);
      observer.complete();
    });
  }

  return galleryService.getAlbumById(albumId);
};
