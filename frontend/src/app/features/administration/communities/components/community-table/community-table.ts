import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { Community } from '../../../../../core/api/models/community.model';
import { SubdireccionView } from '../../models/subdireccion-view.model';

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
  imports: [TableModule, ButtonModule],
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
}
