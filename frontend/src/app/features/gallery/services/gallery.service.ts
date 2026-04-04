import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { Item } from '../../../core/api/models/item.model';
import { MetadataValue } from '../../../core/api/models/metadata.model';
import { Album, Photo, AlbumPage, GalleryFilters, FilterOption, FilterOptions } from '../models';
export type { Album, Photo, AlbumPage, GalleryFilters, FilterOption, FilterOptions } from '../models';

@Injectable({
  providedIn: 'root',
})
export class GalleryService {
  private galleryCollectionUuid: string | null = null;

  constructor(private dspaceApi: DSpaceApiService) {}

  // ─── Buscar colección de galería ───────────────────────

  private findGalleryCollection(): Observable<string> {
    if (this.galleryCollectionUuid) {
      return of(this.galleryCollectionUuid);
    }

    return this.dspaceApi.getAllCollections(0, 100).pipe(
      map((response) => {
        const collections = response._embedded?.['collections'] || [];
        const gallery = collections.find(
          (c) => c.metadata?.['dc.format']?.[0]?.value === 'galeria'
        );

        if (!gallery) {
          throw new Error('No se encontró la colección de galería (dc.format = "galeria")');
        }

        this.galleryCollectionUuid = gallery.uuid;
        return gallery.uuid;
      })
    );
  }

  // ─── Cargar álbumes (paginado) ─────────────────────────

  searchAlbums(filters: GalleryFilters = {}, page = 0, size = 6): Observable<AlbumPage> {
    return this.findGalleryCollection().pipe(
      switchMap((collectionUuid) =>
        this.dspaceApi.getItems(collectionUuid, page, size)
      ),
      switchMap((itemsResponse) => {
        const items = itemsResponse._embedded?.['items'] || [];
        const totalElements = itemsResponse.page?.totalElements ?? 0;
        const totalPages = Math.ceil(totalElements / size);

        if (items.length === 0) {
          return of({ albums: [], totalElements, totalPages, page, size });
        }

        const albumRequests$ = items.map((item) =>
          this.dspaceApi.getBundles(item.uuid).pipe(
            map((bundlesResponse) => {
              const bundles = bundlesResponse._embedded?.['bundles'] || [];
              return {
                item,
                thumbnailBundleUuid: bundles.find((b) => b.name === 'THUMBNAIL')?.uuid || null,
                originalBundleUuid: bundles.find((b) => b.name === 'ORIGINAL')?.uuid || null,
              };
            }),
            switchMap(({ item, thumbnailBundleUuid, originalBundleUuid }) => {
              const thumbnail$ = thumbnailBundleUuid
                ? this.dspaceApi.getBitstreamsFromBundle(thumbnailBundleUuid).pipe(
                    map((res) => {
                      const bitstreams = res._embedded?.['bitstreams'] || [];
                      return bitstreams.length > 0
                        ? `/server/api/core/bitstreams/${bitstreams[0].uuid}/content`
                        : '';
                    }),
                    catchError(() => of(''))
                  )
                : of('');

              const count$ = originalBundleUuid
                ? this.dspaceApi.getBitstreamsFromBundle(originalBundleUuid, 0, 1).pipe(
                    map((res) => res.page?.totalElements ?? 0),
                    catchError(() => of(0))
                  )
                : of(0);

              return forkJoin({ coverPhoto: thumbnail$, photoCount: count$ }).pipe(
                map(({ coverPhoto, photoCount }) => this.mapItemToAlbum(item, coverPhoto, photoCount))
              );
            }),
            catchError(() => of(this.mapItemToAlbum(item, '', 0)))
          )
        );

        return forkJoin(albumRequests$).pipe(
          map((albums) => ({
            albums: this.applyFilters(albums, filters),
            totalElements,
            totalPages,
            page,
            size,
          }))
        );
      }),
      catchError((error) => {
        console.error('Error al cargar álbumes desde DSpace:', error);
        return of({ albums: [], totalElements: 0, totalPages: 0, page, size });
      })
    );
  }

  // ─── Cargar un álbum con todas sus fotos ───────────────

  getAlbumById(uuid: string): Observable<Album | undefined> {
    return this.dspaceApi.getItem(uuid).pipe(
      switchMap((item) =>
        this.dspaceApi.getBundles(item.uuid).pipe(
          switchMap((bundlesResponse) => {
            const bundles = bundlesResponse._embedded?.['bundles'] || [];
            const thumbnailBundle = bundles.find((b) => b.name === 'THUMBNAIL');
            const originalBundle = bundles.find((b) => b.name === 'ORIGINAL');

            const thumbnail$ = thumbnailBundle
              ? this.dspaceApi.getBitstreamsFromBundle(thumbnailBundle.uuid).pipe(
                  map((res) => {
                    const bitstreams = res._embedded?.['bitstreams'] || [];
                    return bitstreams.length > 0
                      ? `/server/api/core/bitstreams/${bitstreams[0].uuid}/content`
                      : '';
                  }),
                  catchError(() => of(''))
                )
              : of('');

            const photos$ = originalBundle
              ? this.dspaceApi.getBitstreamsFromBundle(originalBundle.uuid, 0, 200).pipe(
                  map((res) => {
                    const bitstreams = res._embedded?.['bitstreams'] || [];
                    return bitstreams
                      .filter((b) => {
                        const name = b.name?.toLowerCase() || '';
                        return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
                      })
                      .map((b) => ({
                        id: b.uuid,
                        url: `/server/api/core/bitstreams/${b.uuid}/content`,
                        thumbnailUrl: `/server/api/core/bitstreams/${b.uuid}/content`,
                      } as Photo));
                  }),
                  catchError(() => of([] as Photo[]))
                )
              : of([] as Photo[]);

            return forkJoin({ coverPhoto: thumbnail$, photos: photos$ }).pipe(
              map(({ coverPhoto, photos }) => {
                const album = this.mapItemToAlbum(item, coverPhoto, photos.length);
                album.photos = photos;
                return album;
              })
            );
          })
        )
      ),
      catchError((error) => {
        console.error('Error al cargar álbum desde DSpace:', error);
        return of(undefined);
      })
    );
  }

  // ─── Opciones de filtro (facetas) ──────────────────────

  getFilterOptions(): Observable<FilterOptions> {
    return this.searchAlbums({}, 0, 200).pipe(
      map(({ albums }) => {
        const programCounts = new Map<string, number>();
        const eventTypeCounts = new Map<string, number>();
        const populationCounts = new Map<string, number>();
        const imageContextCounts = new Map<string, number>();

        albums.forEach((album) => {
          if (album.program) {
            programCounts.set(album.program, (programCounts.get(album.program) || 0) + 1);
          }
          if (album.eventType) {
            eventTypeCounts.set(album.eventType, (eventTypeCounts.get(album.eventType) || 0) + 1);
          }
          if (album.populationType) {
            populationCounts.set(album.populationType, (populationCounts.get(album.populationType) || 0) + 1);
          }
          if (album.imageContext) {
            imageContextCounts.set(album.imageContext, (imageContextCounts.get(album.imageContext) || 0) + 1);
          }
        });

        const toSortedOptions = (counts: Map<string, number>): FilterOption[] =>
          Array.from(counts.entries())
            .map(([value, count]) => ({ label: value, value, count }))
            .sort((a, b) => a.label.localeCompare(b.label));

        return {
          programs: toSortedOptions(programCounts),
          eventTypes: toSortedOptions(eventTypeCounts),
          populationTypes: toSortedOptions(populationCounts),
          imageContexts: toSortedOptions(imageContextCounts),
        };
      })
    );
  }

  // ─── Helpers privados ──────────────────────────────────

  private mapItemToAlbum(item: Item, coverPhoto: string, photoCount: number): Album {
    const allSubjects: string[] = (item.metadata?.['dc.subject'] || []).map((s: MetadataValue) => s.value);

    return {
      id: item.uuid,
      title: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
      description: item.metadata?.['dc.description.abstract']?.[0]?.value || item.metadata?.['dc.description']?.[0]?.value || '',
      date: item.metadata?.['dc.date.issued']?.[0]?.value || '',
      program: allSubjects[0] || '',
      subjects: allSubjects,
      eventType: item.metadata?.['dc.type']?.[0]?.value || '',
      author: item.metadata?.['dc.contributor.author']?.[0]?.value || '',
      publisher: item.metadata?.['dc.publisher']?.[0]?.value || '',
      populationType: item.metadata?.['dc.description.sponsorship']?.[0]?.value || '',
      imageContext: item.metadata?.['dc.coverage.spatial']?.[0]?.value || '',
      coverPhoto,
      photos: [],
      photoCount,
    };
  }

  private applyFilters(albums: Album[], filters: GalleryFilters): Album[] {
    let filtered = [...albums];

    if (filters.searchQuery?.trim()) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (album) =>
          album.title.toLowerCase().includes(query) ||
          album.description.toLowerCase().includes(query)
      );
    }

    if (filters.programs && filters.programs.length > 0) {
      filtered = filtered.filter((album) => filters.programs!.includes(album.program));
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      filtered = filtered.filter((album) => filters.eventTypes!.includes(album.eventType));
    }

    if (filters.populationTypes && filters.populationTypes.length > 0) {
      filtered = filtered.filter((album) => filters.populationTypes!.includes(album.populationType));
    }

    if (filters.imageContexts && filters.imageContexts.length > 0) {
      filtered = filtered.filter((album) => filters.imageContexts!.includes(album.imageContext));
    }

    return filtered;
  }
}
