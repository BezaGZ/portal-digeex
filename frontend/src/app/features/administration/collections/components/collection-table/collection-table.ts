import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { Collection } from '../../../../../core/api/models/collection.model';
import { extractLogoUrl } from '../../../../../core/api/collection-logo.util';
import { ProgramaView } from '../../models/programa-view.model';
import { EmptyStateComponent } from '../../../../../shared/components/empty-state/empty-state.component';

/**
 * Tabla presentacional de programas (colecciones bajo una subdirección).
 * El padre pasa la lista y los flags de visibilidad de botones; cada
 * fila emite editRequest o deleteRequest cuando el usuario interactúa.
 */
@Component({
  selector: 'app-collection-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-table.html',
  imports: [TableModule, ButtonModule, TooltipModule, RouterLink, EmptyStateComponent],
})
export class CollectionTable {
  readonly items = input.required<ProgramaView[]>();
  readonly canEdit = input<boolean>(true);
  readonly canDelete = input<boolean>(true);
  readonly pageSize = input<number>(10);
  readonly totalRecords = input<number>(0);

  readonly editRequest = output<Collection>();
  readonly deleteRequest = output<Collection>();
  readonly lazyLoad = output<TableLazyLoadEvent>();

  /** Lee dspace.entity.type del metadata para mostrar el tipo en la tabla. */
  getEntityType(c: Collection): string {
    return c.metadata?.['dspace.entity.type']?.[0]?.value ?? '—';
  }

  /** Lee digeex.navLocation del metadata para mostrar la ubicación en la tabla. */
  getNavLocation(c: Collection): string {
    return c.metadata?.['digeex.navLocation']?.[0]?.value ?? '—';
  }

  /** Sigla del programa (PEAC, PRONEA, etc.); guardada en dc.title.alternative (qualifier nativo del schema dc). */
  getSigla(c: Collection): string {
    return c.metadata?.['dc.title.alternative']?.[0]?.value ?? '—';
  }

  /** Título completo; guardado en dc.title. DSpace además sobrescribe `name` con este valor. */
  getTitulo(c: Collection): string {
    return c.metadata?.['dc.title']?.[0]?.value ?? c.name ?? '—';
  }

  /** Orden en el menú; convención DIGEEX guarda el número en dc.identifier.other. */
  getOrden(c: Collection): string {
    return c.metadata?.['dc.identifier.other']?.[0]?.value ?? '—';
  }

  /** URL relativa del logo cuando viene embebido; null para mostrar placeholder. */
  getLogoUrl(c: Collection): string | null {
    return extractLogoUrl(c);
  }
}
