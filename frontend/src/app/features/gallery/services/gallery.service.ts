import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { FacetFilter } from '../../../core/api/models/discovery.model';
import { Item } from '../../../core/api/models/item.model';
import { MetadataValue } from '../../../core/api/models/metadata.model';
import { Album, Photo, AlbumPage, GalleryFilters, FilterOption, FilterOptions } from '../models';
export type { Album, Photo, AlbumPage, GalleryFilters, FilterOption, FilterOptions } from '../models';

/**
 * Servicio dedicado a la galería institucional.
 * Busca álbumes de fotos dentro de la colección con dc.format = 'galeria'
 * usando Discovery para filtros y paginación del servidor.
 */
@Injectable({
  providedIn: 'root',
})
export class GalleryService {
  constructor(
    private dspaceApi: DSpaceApiService,
    private discoveryService: DiscoveryService,
    private collectionCache: CollectionCacheService,
  ) {}

  /** ─── Buscar colección de galería ─── */

  /**
   * Obtiene el UUID de la colección de galería desde el caché global.
   * @returns Observable con el UUID de la colección que tiene dc.format = 'galeria'
   */
  private findGalleryCollection(): Observable<string> {
    return this.collectionCache.findByFormat('galeria');
  }

  /** ─── Cargar álbumes (paginado) ─── */

  /**
   * Busca álbumes dentro de la colección de galería con filtros y paginación.
   * Para cada ítem obtiene el thumbnail del bundle THUMBNAIL y el conteo
   * de fotos del bundle ORIGINAL.
   * @param filters - Filtros de galería (programa, tipo evento, población, contexto)
   * @param page - Página actual (default: 0)
   * @param size - Cantidad de álbumes por página (default: 6)
   * @returns Observable con AlbumPage (álbumes + datos de paginación)
   */
  searchAlbums(filters: GalleryFilters = {}, page = 0, size = 6): Observable<AlbumPage> {
    return this.findGalleryCollection().pipe(
      switchMap((collectionUuid) => {
        const facetFilters = this.buildGalleryFacetFilters(filters);

        return this.discoveryService.search({
          query: filters.searchQuery?.trim() || undefined,
          scope: collectionUuid,
          filters: facetFilters.length > 0 ? facetFilters : undefined,
          page,
          size,
        });
      }),
      switchMap((result) => {
        const items = result.items;
        const totalElements = result.totalElements;
        const totalPages = result.totalPages;

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
            albums,
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

  /** ─── Cargar un álbum con todas sus fotos ─── */

  /**
   * Carga un álbum completo por UUID incluyendo todas sus fotos.
   * Obtiene el thumbnail del bundle THUMBNAIL y las fotos del bundle ORIGINAL.
   * @param uuid - UUID del ítem (álbum) en DSpace
   * @returns Observable con el álbum completo o undefined si falla
   */
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

  /** ─── Opciones de filtro (facetas) ─── */

  /**
   * Obtiene las opciones de filtro disponibles para la galería.
   * Hace un request con size=0 para obtener solo las facetas sin ítems.
   * @returns Observable con FilterOptions (programas, tipos evento, población, contexto)
   */
  getFilterOptions(): Observable<FilterOptions> {
    return this.findGalleryCollection().pipe(
      switchMap((collectionUuid) =>
        this.discoveryService.search({ scope: collectionUuid, page: 0, size: 0 })
      ),
      map((result) => {
        const facetMap = new Map(result.facets.map((f) => [f.name, f.values]));

        const toFilterOptions = (facetName: string): FilterOption[] =>
          (facetMap.get(facetName) || [])
            .map((v) => ({ label: v.label, value: v.label, count: v.count }))
            .sort((a, b) => a.label.localeCompare(b.label));

        return {
          programs: toFilterOptions('classification'),
          eventTypes: toFilterOptions('itemtype'),
          populationTypes: toFilterOptions('sponsorship'),
          imageContexts: toFilterOptions('spatial'),
        };
      }),
      catchError((error) => {
        console.error('Error al cargar opciones de filtro:', error);
        return of({ programs: [], eventTypes: [], populationTypes: [], imageContexts: [] });
      })
    );
  }

  /** ─── Helpers privados ─── */

  /**
   * Transforma un ítem de DSpace al modelo Album del frontend.
   * Extrae la metadata Dublin Core y la mapea a propiedades legibles.
   * @param item - Ítem crudo de DSpace
   * @param coverPhoto - URL del thumbnail
   * @param photoCount - Cantidad de fotos en el bundle ORIGINAL
   * @returns Album con los datos mapeados
   */
  private mapItemToAlbum(item: Item, coverPhoto: string, photoCount: number): Album {
    const allSubjects: string[] = (item.metadata?.['dc.subject'] || []).map((s: MetadataValue) => s.value);

    return {
      id: item.uuid,
      title: item.metadata?.['dc.title']?.[0]?.value || 'Sin título',
      description: item.metadata?.['dc.description.abstract']?.[0]?.value || item.metadata?.['dc.description']?.[0]?.value || '',
      date: item.metadata?.['dc.date.issued']?.[0]?.value || '',
      program: item.metadata?.['dc.subject.classification']?.[0]?.value || '',
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

  /**
   * Construye los filtros de faceta para la petición de Discovery.
   * Convierte los filtros del frontend al formato que espera DSpace.
   * @param filters - Filtros seleccionados por el usuario
   * @returns Arreglo de FacetFilter para enviar a DiscoveryService
   */
  private buildGalleryFacetFilters(filters: GalleryFilters): FacetFilter[] {
    const facets: FacetFilter[] = [];

    if (filters.programs && filters.programs.length > 0) {
      for (const program of filters.programs) {
        facets.push({ name: 'classification', value: program, operator: 'equals' });
      }
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      for (const eventType of filters.eventTypes) {
        facets.push({ name: 'itemtype', value: eventType, operator: 'equals' });
      }
    }

    if (filters.populationTypes && filters.populationTypes.length > 0) {
      for (const popType of filters.populationTypes) {
        facets.push({ name: 'sponsorship', value: popType, operator: 'equals' });
      }
    }

    if (filters.imageContexts && filters.imageContexts.length > 0) {
      for (const context of filters.imageContexts) {
        facets.push({ name: 'spatial', value: context, operator: 'equals' });
      }
    }

    return facets;
  }
}
