import { Injectable, signal } from '@angular/core';
import { Observable, of, tap, map, shareReplay } from 'rxjs';
import { CollectionApiService } from './collection-api.service';
import { Collection } from './models/collection.model';

/**
 * Caché centralizado de colecciones del repositorio.
 * Carga todas las colecciones agotando páginas con `paginateAll$` (vía
 * `listAll`) y guarda el resultado en un signal. Sus consumidores (Home, header
 * y layout públicos, galería y estadísticas) leen de aquí, no por su cuenta.
 */
@Injectable({ providedIn: 'root' })
export class CollectionCacheService {
  private collections = signal<Collection[]>([]);
  private loaded = false;
  private cache$: Observable<Collection[]> | null = null;

  /**
   * True cuando la primera carga de colecciones terminó, con datos o con
   * error. Alimenta el splash de primera carga del portal público; es de
   * una sola vía a propósito: invalidate() no lo apaga porque las recargas
   * del cache no deben volver a tapar el portal.
   */
  readonly menuReady = signal(false);

  constructor(private collectionApi: CollectionApiService) {}

  /**
   * Devuelve todas las colecciones del repositorio.
   * Si ya se cargaron antes, las devuelve del signal sin hacer HTTP.
   * Si dos componentes llaman al mismo tiempo, shareReplay(1) comparte
   * la misma petición para que no se duplique.
   * @returns Observable con el arreglo completo de colecciones
   */
  getAll(): Observable<Collection[]> {
    if (this.loaded) {
      return of(this.collections());
    }

    if (!this.cache$) {
      this.cache$ = this.collectionApi.listAll({ embed: 'logo' }).pipe(
        tap({
          next: (cols) => {
            this.collections.set(cols);
            this.loaded = true;
            this.cache$ = null;
            this.menuReady.set(true);
          },
          // El error también libera el splash: el portal aparece con menús
          // vacíos en lugar de quedarse encerrado en la pantalla de carga.
          error: () => this.menuReady.set(true),
        }),
        shareReplay(1)
      );
    }

    return this.cache$;
  }

  /**
   * Filtra colecciones por su valor de digeex.navLocation y las ordena
   * por dc.identifier.other (campo de orden en el menú).
   * @param menuType - Valor de digeex.navLocation a buscar (ej: 'menu-principal', 'menu-secundario')
   * @returns Observable con las colecciones filtradas y ordenadas
   */
  getByMenuType(menuType: string): Observable<Collection[]> {
    return this.getAll().pipe(
      map((collections) =>
        collections
          .filter((c) => c.metadata?.['digeex.navLocation']?.[0]?.value === menuType)
          .sort((a, b) => {
            const orderA = parseInt(a.metadata?.['dc.identifier.other']?.[0]?.value || '999');
            const orderB = parseInt(b.metadata?.['dc.identifier.other']?.[0]?.value || '999');
            return orderA - orderB;
          })
      )
    );
  }

  /**
   * Busca una colección por su valor de dspace.entity.type y devuelve su UUID.
   * Lanza error si no encuentra ninguna coincidencia.
   * @param format - Valor de dspace.entity.type a buscar (ej: 'galeria', 'estadistica')
   * @returns Observable con el UUID de la colección encontrada
   */
  findByFormat(format: string): Observable<string> {
    return this.getAll().pipe(
      map((collections) => {
        const found = collections.find(
          (c) => c.metadata?.['dspace.entity.type']?.[0]?.value === format
        );
        if (!found) {
          throw new Error(`No se encontró colección con dspace.entity.type = "${format}"`);
        }
        return found.uuid;
      })
    );
  }

  /**
   * Limpia el caché para forzar una nueva petición HTTP en la siguiente lectura.
   * Útil después de crear o eliminar colecciones desde el panel de admin.
   */
  invalidate(): void {
    this.loaded = false;
    this.collections.set([]);
    this.cache$ = null;
  }
}
