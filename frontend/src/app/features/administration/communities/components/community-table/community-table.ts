import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { Community } from '../../../../../core/api/models/community.model';
import { SubdireccionView } from '../../models/subdireccion-view.model';
import { EmptyState } from '../../../../../shared/components/empty-state/empty-state';

/**
 * Tabla presentacional de subdirecciones. El padre pasa la lista y los
 * flags de visibilidad de botones; cada fila emite editRequest o
 * deleteRequest cuando el usuario interactúa, y el padre maneja el
 * efecto (abrir dialog, confirmar borrado, etc.).
 */
@Component({
  selector: 'app-community-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './community-table.html',
  imports: [TableModule, ButtonModule, TooltipModule, RouterLink, EmptyState],
})
export class CommunityTable {
  readonly items = input.required<SubdireccionView[]>();
  readonly canEdit = input<boolean>(true);
  readonly canDelete = input<boolean>(true);
  readonly pageSize = input<number>(20);
  readonly totalRecords = input<number>(0);

  readonly editRequest = output<Community>();
  readonly deleteRequest = output<Community>();
  readonly lazyLoad = output<TableLazyLoadEvent>();

  /**
   * Nombre corto: convención setup-dspace.sh lo guarda en dc.title.alternative
   * (qualifier nativo del schema dc, semánticamente "título alternativo").
   * El campo `name` no se puede usar como fuente porque DSpace 9.x lo
   * sobrescribe con dc.title al consultarlo.
   */
  getNombreCorto(row: Community): string {
    return row.metadata?.['dc.title.alternative']?.[0]?.value ?? row.name;
  }

  getTituloCompleto(row: Community): string {
    return row.metadata?.['dc.title']?.[0]?.value ?? row.name;
  }
}
