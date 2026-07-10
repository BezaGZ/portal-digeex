import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { TotalCard } from './components/total-card/total-card';
import { FacetBarCard } from './components/facet-bar-card/facet-bar-card';
import { RangeBarCard } from './components/range-bar-card/range-bar-card';
import { TopListCard, TopListEntry } from './components/top-list-card/top-list-card';
import { EmptyState } from '../../../shared';
import { LoadingSpinner } from '../../../shared/components/loading-spinner/loading-spinner';
import {
  DashboardWidgetSpec,
  DASHBOARD_WIDGETS_BY_ROLE,
  buildLastNYearRanges,
} from './dashboard.config';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { Community } from '../../../core/api/models/community.model';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { findCallerSub } from '../shared/services/scope-resolver';
import { DashboardStatsService } from './services/dashboard-stats.service';
import * as roleCaps from '../../../core/auth/role-capabilities';

/**
 * Componente contenedor del Dashboard de KPIs.
 * Resuelve el scope según el rol del usuario autenticado (SuperAdmin o Administrador de Subdirección)
 * y renderiza los widgets correspondientes configurados en `DASHBOARD_WIDGETS_BY_ROLE`.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    SelectModule,
    TotalCard,
    FacetBarCard,
    RangeBarCard,
    TopListCard,
    EmptyState,
    LoadingSpinner,
  ],
  // Instancia propia por visita: el caché de la búsqueda compartida de las
  // cards muere con el componente y cada entrada al dashboard trae datos frescos.
  providers: [DashboardStatsService],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly router = inject(Router);
  private readonly communityApi = inject(CommunityApiService);
  private readonly authCaller = inject(AuthCallerService);

  /** Datos del usuario autenticado y su rol, inicializados en `null`. */
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  /**
   * Identificador del ámbito de administración (UUID de la comunidad para administradores
   * o `null` para SuperAdmin). Es `undefined` durante la carga inicial.
   */
  readonly scope = toSignal(this.resolveScope$(), { initialValue: undefined });

  /** Lista de widgets para el rol del caller actual. */
  readonly widgets = computed<readonly DashboardWidgetSpec[]>(() => {
    const role = this.caller()?.role;
    if (!role) return [];
    return DASHBOARD_WIDGETS_BY_ROLE[role] ?? [];
  });

  /** Indica si la carga inicial del usuario y el scope ha finalizado. */
  readonly ready = computed(() => this.caller() !== null && this.scope() !== undefined);

  /**
   * Fail-closed: ¿el scope resuelto sirve para renderizar widgets sin caer en
   * "global" por error? SuperAdmin → sí (global es su scope legítimo). Un
   * no-superadmin necesita un uuid de sub real; si su sufijo no resolvió (rol
   * huérfano), no se muestran widgets para no pedir métricas de todas las subs.
   */
  readonly hasUsableScope = computed(() =>
    roleCaps.hasUsableScope(this.caller(), this.scope()),
  );

  /** Ventana temporal del dashboard expresada en años (por defecto 5). */
  readonly selectedYearWindow = signal<number>(5);

  /** Opciones de selección para la ventana temporal en años. */
  readonly yearWindowOptions: { label: string; value: number }[] = [
    { label: 'Últimos 3 años', value: 3 },
    { label: 'Últimos 5 años', value: 5 },
    { label: 'Últimos 10 años', value: 10 },
  ];

  /**
   * Rangos anuales calculados a partir de la ventana de años seleccionada (`selectedYearWindow`).
   */
  readonly yearRanges = computed(() => buildLastNYearRanges(this.selectedYearWindow()));

  /**
   * Navega al historial del programa de la entrada seleccionada.
   */
  onTopListEntryClick(entry: TopListEntry): void {
    this.router.navigate(['/administrador/historial/programas', entry.uuid]);
  }

  /**
   * Resuelve el identificador de la comunidad que corresponde al rol y sufijo del usuario autenticado.
   */
  private resolveScope$(): Observable<string | null> {
    return this.authCaller.currentCaller$.pipe(
      switchMap((caller) => {
        if (!roleCaps.isCallerScoped(caller)) {
          return of<string | null>(null);
        }
        return this.communityApi.searchTop(0, 1).pipe(
          switchMap((resp) => {
            const root = resp._embedded?.['communities']?.[0];
            if (!root) return of<string | null>(null);
            return this.communityApi.listAllSubcommunities(root.uuid).pipe(
              switchMap((subs: Community[]) => {
                const matching = findCallerSub(subs, caller);
                return of<string | null>(matching?.uuid ?? null);
              }),
            );
          }),
        );
      }),
    );
  }
}
