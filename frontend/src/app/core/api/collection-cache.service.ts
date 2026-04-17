import { Injectable, signal } from '@angular/core';
import { Observable, of, tap, map, shareReplay } from 'rxjs';
import { DSpaceApiService } from './dspace-api.service';
import { Collection } from './models/collection.model';

/**
 * Caché centralizado de colecciones del repositorio.
 * Hace UNA sola petición HTTP y guarda el resultado en un signal.
 * Tres consumidores (Home, PublicHeader, GalleryService) leen de aquí
 * en vez de hacer peticiones independientes a getAllCollections.
 */
@Injectable({ providedIn: 'root' })
export class CollectionCacheService {
  private collections = signal<Collection[]>([]);
  private loaded = false;
  private cache$: Observable<Collection[]> | null = null;

  constructor(private dspaceApi: DSpaceApiService) {}

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
      this.cache$ = this.dspaceApi.getAllCollections(0, 100).pipe(
        map((response) => response._embedded?.['collections'] || []),
        tap((cols) => {
          this.collections.set(cols);
          this.loaded = true;
          this.cache$ = null;
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
   * Busca una colección por su valor de digeex.renderType y devuelve su UUID.
   * Lanza error si no encuentra ninguna coincidencia.
   * @param format - Valor de digeex.renderType a buscar (ej: 'galeria', 'estadistica')
   * @returns Observable con el UUID de la colección encontrada
   */
  findByFormat(format: string): Observable<string> {
    return this.getAll().pipe(
      map((collections) => {
        const found = collections.find(
          (c) => c.metadata?.['digeex.renderType']?.[0]?.value === format
        );
        if (!found) {
          throw new Error(`No se encontró colección con digeex.renderType = "${format}"`);
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
