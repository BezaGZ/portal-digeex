import { Type } from '@angular/core';
import { StatsRenderer } from './renderers/stats-renderer.interface';

/**
 * Registry de renderers por dataset.
 *
 * Mapa `digeex.statsDataset` → clase del `StatsRenderer` correspondiente.
 * Patrón Strategy + Registry: cada renderer es una estrategia auto-registrada
 * como side-effect de su módulo. Mismo patrón canonizado en
 * `submission-form-registry.ts` del Sprint 6. El registry es idempotente:
 * re-registrar la misma clave sobreescribe la entrada anterior sin error.
 */

const REGISTRY: Record<string, Type<StatsRenderer>> = {};

/** Devuelve null si el dataset no está registrado o si `datasetKey` es undefined. */
export function getStatsRenderer(
  datasetKey: string | undefined,
): Type<StatsRenderer> | null {
  if (!datasetKey) return null;
  return REGISTRY[datasetKey] ?? null;
}

/** Idempotente: re-registrar el mismo dataset sobreescribe la entrada. */
export function registerStatsRenderer(
  datasetKey: string,
  renderer: Type<StatsRenderer>,
): void {
  REGISTRY[datasetKey] = renderer;
}

/** Solo para tests; producción no consume esta función. */
export function clearStatsRendererRegistry(): void {
  for (const key of Object.keys(REGISTRY)) {
    delete REGISTRY[key];
  }
}
