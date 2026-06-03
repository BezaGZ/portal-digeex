import { buildLastNYearRanges, DASHBOARD_WIDGETS_BY_ROLE } from './dashboard.config';

/**
 * Tests de configuración del Dashboard de KPIs.
 *
 * Verifica que la matriz `DASHBOARD_WIDGETS_BY_ROLE` tenga entradas para
 * los roles activos (SuperAdmin y admin_subdireccion) y que el helper de
 * rangos dinámicos genere ventanas de N años cerradas en el año actual.
 *
 * Ciclo 12 TDD — Sprint 8.
 */
describe('dashboard.config', () => {
  describe('buildLastNYearRanges', () => {
    /** Verifica que con N=1 devuelva solo el año actual con sus bornes Jan 1 - Dec 31. */
    it('should produce a single range covering the current year when count=1', () => {
      const now = new Date('2026-06-03T00:00:00.000Z');
      const ranges = buildLastNYearRanges(1, now);

      expect(ranges).toEqual([{ label: '2026', from: '2026-01-01', to: '2026-12-31' }]);
    });

    /** Verifica que con N=5 devuelva los 5 años terminando en el actual, en orden cronológico. */
    it('should produce N ranges ending at the current year in chronological order', () => {
      const now = new Date('2026-06-03T00:00:00.000Z');
      const ranges = buildLastNYearRanges(5, now);

      expect(ranges.map((r) => r.label)).toEqual(['2022', '2023', '2024', '2025', '2026']);
      expect(ranges[0]).toEqual({ label: '2022', from: '2022-01-01', to: '2022-12-31' });
      expect(ranges[4]).toEqual({ label: '2026', from: '2026-01-01', to: '2026-12-31' });
    });
  });

  describe('DASHBOARD_WIDGETS_BY_ROLE', () => {
    /** Verifica que SuperAdmin tenga la matriz de 4 widgets estándar del Sprint 8. */
    it('should define 4 widgets for superadmin', () => {
      const widgets = DASHBOARD_WIDGETS_BY_ROLE.superadmin;
      expect(widgets?.length).toBe(4);
      expect(widgets?.map((w) => w.kind)).toEqual(['total', 'facet-bar', 'range-bar', 'top-list']);
    });

    /** Verifica que admin_subdireccion tenga su matriz scope-aware. */
    it('should define 4 widgets for admin_subdireccion', () => {
      const widgets = DASHBOARD_WIDGETS_BY_ROLE.admin_subdireccion;
      expect(widgets?.length).toBe(4);
      expect(widgets?.map((w) => w.kind)).toEqual(['total', 'facet-bar', 'range-bar', 'top-list']);
    });

    /** Verifica que personal_delegado NO tenga widgets configurados (defensa). */
    it('should NOT define widgets for personal_delegado (defensive)', () => {
      expect(DASHBOARD_WIDGETS_BY_ROLE.personal_delegado).toBeUndefined();
    });
  });
});
