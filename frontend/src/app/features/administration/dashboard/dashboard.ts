import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { TotalCard } from './components/total-card/total-card';
import { FacetBarCard } from './components/facet-bar-card/facet-bar-card';
import { RangeBarCard } from './components/range-bar-card/range-bar-card';
import { TopListCard, TopListEntry } from './components/top-list-card/top-list-card';
import {
  DashboardWidgetSpec,
  DASHBOARD_WIDGETS_BY_ROLE,
} from './dashboard.config';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { Community } from '../../../core/api/models/community.model';
import { AuthCallerService } from '../shared/services/auth-caller.service';
import { findCallerSub } from '../shared/services/scope-resolver';

/**
 * Contenedor del Dashboard de KPIs. Resuelve el scope desde el caller
 * (null para SuperAdmin, UUID de su community para admin_subdireccion)
 * y renderiza los widgets que `DASHBOARD_WIDGETS_BY_ROLE` define por rol.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    CardModule,
    ButtonModule,
    TotalCard,
    FacetBarCard,
    RangeBarCard,
    TopListCard,
  ],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly router = inject(Router);
  private readonly communityApi = inject(CommunityApiService);
  private readonly authCaller = inject(AuthCallerService);

  /** Caller actual (rol + sufijo); null mientras el observable no resuelve. */
  readonly caller = toSignal(this.authCaller.currentCaller$, { initialValue: null });

  /**
   * Scope resuelto: `undefined` mientras carga, `null` para SuperAdmin
   * (universal), UUID para admin_subdireccion. Si el caller no tiene
   * sub válida, queda `null` (defensa contra estado inconsistente).
   */
  readonly scope = toSignal(this.resolveScope$(), { initialValue: undefined });

  /** Lista de widgets para el rol del caller actual. */
  readonly widgets = computed<readonly DashboardWidgetSpec[]>(() => {
    const role = this.caller()?.role;
    if (!role) return [];
    return DASHBOARD_WIDGETS_BY_ROLE[role] ?? [];
  });

  /** UI lista cuando el caller resolvió y el scope está estable. */
  readonly ready = computed(() => this.caller() !== null && this.scope() !== undefined);

  goBack(): void {
    this.router.navigate(['/']);
  }

  /**
   * Click en una fila del top-list-card. Navega a la pantalla de
   * Programas filtrada por la colección clickeada.
   */
  onTopListEntryClick(entry: TopListEntry): void {
    this.router.navigate(['/administrador/programas', entry.uuid]);
  }

  /**
   * Resuelve el scope desde el caller: null para SuperAdmin, UUID de la
   * Community con sufijo matching para admin_subdireccion, null si no hay match.
   */
  private resolveScope$(): Observable<string | null> {
    return this.authCaller.currentCaller$.pipe(
      switchMap((caller) => {
        if (!caller || caller.role === 'superadmin' || !caller.sufijo) {
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
