import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { DiscoveryService } from '../../../core/api/discovery.service';
import { CollectionCacheService } from '../../../core/api/collection-cache.service';
import { FacetFilter, FacetValue } from '../../../core/api/models/discovery.model';
import { Item } from '../../../core/api/models/item.model';
import { Bitstream } from '../../../core/api/models/bitstream.model';
import { MetadataValue } from '../../../core/api/models/metadata.model';
import { paginateAll$ } from '../../../core/api/dspace-rest.util';
import { Album, Photo, AlbumVideo, AlbumPage, GalleryFilters, FilterOption, FilterOptions } from '../models';
import { ENTITY_TYPE } from '../../../core/config/digeex-values.config';
export type { Album, Photo, AlbumVideo, AlbumPage, GalleryFilters, FilterOption, FilterOptions } from '../models';

/**
 * Servicio dedicado a la galería institucional.
 * Busca álbumes de fotos dentro de la colección con dspace.entity.type = 'galeria'
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
   * Devuelve el UUID de la colección con `dspace.entity.type = 'Galeria'`.
   * Lo usan el container para registrar visitas en `viewevents` y los
   * métodos internos del service para acotar el scope de Discovery.
   */
  getGalleryCollectionUuid$(): Observable<string> {
    return this.collectionCache.findByFormat(ENTITY_TYPE.GALERIA);
  }

  /** ─── Cargar álbumes (paginado) ─── */

  /**
   * Busca álbumes dentro de una colección de galería con filtros y paginación.
   * Si `collectionUuid` viene, lo usa como scope directo; si no, resuelve la
   * primera colección con `dspace.entity.type = 'Galeria'` vía el cache para
   * preservar el comportamiento de la ruta raíz `/galeria` sin UUID.
   * La portada viene embebida en el discover (`embed=thumbnail`); el conteo de
   * fotos sale del bundle ORIGINAL pedido con `embed=bitstreams`, una petición
   * por álbum.
   * @param filters - Filtros de galería (programa, tipo evento, población, contexto)
   * @param page - Página actual (default: 0)
   * @param size - Cantidad de álbumes por página (default: 6)
   * @param collectionUuid - UUID de la colección a consultar (opcional)
   * @returns Observable con AlbumPage (álbumes + datos de paginación)
   */
  searchAlbums(
    filters: GalleryFilters = {},
    page = 0,
    size = 6,
    collectionUuid?: string,
  ): Observable<AlbumPage> {
    const scope$ = collectionUuid ? of(collectionUuid) : this.getGalleryCollectionUuid$();
    return scope$.pipe(
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

        const albumRequests$ = items.map((item) => {
          // Portada: viene embebida en el discover (`embed=thumbnail`) como
          // `item.thumbnail`, el bitstream del bundle THUMBNAIL donde el facade
          // coloca la portada curada. Se arma la URL directo, sin un request de
          // bundles+bitstreams del THUMBNAIL por álbum.
          const coverPhoto = item.thumbnail
            ? `/server/api/core/bitstreams/${item.thumbnail.uuid}/content`
            : '';
          // El conteo sale de `_embedded.bitstreams.page.totalElements` del bundle
          // ORIGINAL; `embed.size=bitstreams=1` trae el total sin arrastrar las fotos.
          return this.dspaceApi.getBundles(item.uuid, 0, 20, 'bitstreams', 'bitstreams=1').pipe(
            map((bundlesResponse) => {
              const bundles = bundlesResponse._embedded?.['bundles'] || [];
              const original = bundles.find((b) => b.name === 'ORIGINAL');
              const photoCount = original?._embedded?.bitstreams?.page?.totalElements ?? 0;
              return this.mapItemToAlbum(item, coverPhoto, photoCount);
            }),
            catchError(() => of(this.mapItemToAlbum(item, coverPhoto, 0)))
          );
        });

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
   * Carga un álbum completo por UUID con las fotos y videos del bundle
   * ORIGINAL, agotando las páginas. El mismo bundle guarda ambos; se reparten
   * por extensión y lo que no es imagen ni video (p. ej. un marcador .txt)
   * queda fuera. No pide portada: el visor no la muestra.
   * @param uuid - UUID del ítem (álbum) en DSpace
   * @returns Observable con el álbum completo o undefined si falla
   */
  getAlbumById(uuid: string): Observable<Album | undefined> {
    return this.dspaceApi.getItem(uuid).pipe(
      switchMap((item) =>
        this.dspaceApi.getBundles(item.uuid).pipe(
          switchMap((bundlesResponse) => {
            const bundles = bundlesResponse._embedded?.['bundles'] || [];
            const originalBundle = bundles.find((b) => b.name === 'ORIGINAL');

            const media$ = originalBundle
              ? paginateAll$(
                  (page) => this.dspaceApi.getBitstreamsFromBundle(originalBundle.uuid, page, 100),
                  (res) => res._embedded?.['bitstreams'] || [],
                ).pipe(catchError(() => of([] as Bitstream[])))
              : of([] as Bitstream[]);

            return media$.pipe(
              map((bitstreams) => {
                const photos = bitstreams
                  .filter((b) => this.isImageBitstream(b.name))
                  .map((b) => this.toPhoto(b));
                const album = this.mapItemToAlbum(item, '', photos.length);
                album.photos = photos;
                album.videos = bitstreams
                  .filter((b) => this.isVideoBitstream(b.name))
                  .map((b) => this.toVideo(b));
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
   * Opciones de filtro de la galería. Si `collectionUuid` viene lo usa como
   * scope; si no, resuelve la primera colección `dspace.entity.type = 'Galeria'`.
   * Cada filtro trae el universo completo de su faceta vía el endpoint dedicado.
   * @param collectionUuid - UUID de la colección a consultar (opcional)
   * @returns Observable con FilterOptions (programas, tipos evento, población, contexto)
   */
  getFilterOptions(collectionUuid?: string): Observable<FilterOptions> {
    const scope$ = collectionUuid ? of(collectionUuid) : this.getGalleryCollectionUuid$();
    return scope$.pipe(
      switchMap((scope) =>
        // El endpoint dedicado evita el tope `facetLimit` de los facets embebidos.
        forkJoin({
          programs: this.discoveryService.getFacetValues('classification', scope),
          eventTypes: this.discoveryService.getFacetValues('itemtype', scope),
          populationTypes: this.discoveryService.getFacetValues('populationType', scope),
          imageContexts: this.discoveryService.getFacetValues('imageFocus', scope),
        })
      ),
      map(({ programs, eventTypes, populationTypes, imageContexts }) => ({
        programs: this.toFilterOptions(programs),
        eventTypes: this.toFilterOptions(eventTypes),
        populationTypes: this.toFilterOptions(populationTypes),
        imageContexts: this.toFilterOptions(imageContexts),
      })),
      catchError((error) => {
        console.error('Error al cargar opciones de filtro:', error);
        return of({ programs: [], eventTypes: [], populationTypes: [], imageContexts: [] });
      })
    );
  }

  /** Mapea los valores de una faceta a opciones de filtro, ordenadas por label. */
  private toFilterOptions(values: FacetValue[]): FilterOption[] {
    return values
      .map((v) => ({ label: v.label, value: v.label, count: v.count }))
      .sort((a, b) => a.label.localeCompare(b.label));
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
  /** True si el nombre del bitstream corresponde a una imagen soportada. */
  private isImageBitstream(name?: string | null): boolean {
    const n = (name || '').toLowerCase();
    return n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || n.endsWith('.webp');
  }

  /** Mapea un bitstream del bundle ORIGINAL a Photo apuntando a su contenido. */
  private toPhoto(bitstream: Bitstream): Photo {
    const url = `/server/api/core/bitstreams/${bitstream.uuid}/content`;
    return { id: bitstream.uuid, url, thumbnailUrl: url };
  }

  /**
   * True si el nombre corresponde a un video reproducible en navegador. Solo
   * mp4 y webm.
   */
  private isVideoBitstream(name?: string | null): boolean {
    const n = (name || '').toLowerCase();
    return n.endsWith('.mp4') || n.endsWith('.webm');
  }

  /** Mapea un bitstream del bundle ORIGINAL a AlbumVideo apuntando a su contenido. */
  private toVideo(bitstream: Bitstream): AlbumVideo {
    return {
      id: bitstream.uuid,
      url: `/server/api/core/bitstreams/${bitstream.uuid}/content`,
      name: bitstream.name || '',
    };
  }

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
      populationType: item.metadata?.['digeex.populationType']?.[0]?.value || '',
      imageContext: item.metadata?.['digeex.imageFocus']?.[0]?.value || '',
      coverPhoto,
      photos: [],
      videos: [],
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
        facets.push({ name: 'populationType', value: popType, operator: 'equals' });
      }
    }

    if (filters.imageContexts && filters.imageContexts.length > 0) {
      for (const context of filters.imageContexts) {
        facets.push({ name: 'imageFocus', value: context, operator: 'equals' });
      }
    }

    return facets;
  }
}
