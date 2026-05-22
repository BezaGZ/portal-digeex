import { Injectable } from '@angular/core';

import { StatsRenderer } from './renderers/stats-renderer.interface';
import { StatsDashboard, FilterConfig } from './models/stats-dashboard.model';
import {
  clearStatsRendererRegistry,
  getStatsRenderer,
  registerStatsRenderer,
} from './stats-dataset-registry';

@Injectable({ providedIn: 'root' })
class FakeRendererA implements StatsRenderer {
  parse(): StatsDashboard {
    return { sections: [] };
  }
  getFilters(): readonly FilterConfig[] {
    return [];
  }
  applyFilters(dashboard: StatsDashboard): StatsDashboard {
    return dashboard;
  }
  getForbiddenColumns(): readonly string[] {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
class FakeRendererB implements StatsRenderer {
  parse(): StatsDashboard {
    return { sections: [] };
  }
  getFilters(): readonly FilterConfig[] {
    return [];
  }
  applyFilters(dashboard: StatsDashboard): StatsDashboard {
    return dashboard;
  }
  getForbiddenColumns(): readonly string[] {
    return [];
  }
}

/**
 * Tests de `stats-dataset-registry`.
 *
 * Módulo con funciones standalone que mantiene el mapa `digeex.statsDataset`
 * → `Type<StatsRenderer>`. Patrón Strategy + Registry, paralelo al
 * `submission-form-registry` del Sprint 6. Los tests cubren el retorno null
 * para dataset no registrado o `datasetKey` undefined, y la idempotencia del
 * registro al sobreescribir entradas con la misma clave.
 *
 * Ciclo 3 TDD — Sprint 7.
 */
describe('stats-dataset-registry', () => {
  beforeEach(() => {
    clearStatsRendererRegistry();
  });

  /** Verifica que getStatsRenderer devuelva null cuando el dataset nunca fue registrado. */
  it('should return null for an unregistered dataset', () => {
    expect(getStatsRenderer('inexistente')).toBeNull();
  });

  /** Verifica que getStatsRenderer devuelva null cuando datasetKey es undefined. */
  it('should return null when datasetKey is undefined', () => {
    expect(getStatsRenderer(undefined)).toBeNull();
  });

  /** Verifica que registerStatsRenderer agregue la entrada y getStatsRenderer la recupere. */
  it('should return the renderer registered for a dataset', () => {
    registerStatsRenderer('docentes', FakeRendererA);
    expect(getStatsRenderer('docentes')).toBe(FakeRendererA);
  });

  /** Verifica idempotencia: re-registrar el mismo dataset sobreescribe la entrada anterior. */
  it('should overwrite the entry when registering twice for the same dataset', () => {
    registerStatsRenderer('docentes', FakeRendererA);
    registerStatsRenderer('docentes', FakeRendererB);
    expect(getStatsRenderer('docentes')).toBe(FakeRendererB);
  });
});
