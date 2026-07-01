/**
 * Con `appendTo="body"` PrimeNG posiciona el wrapper `.p-overlay` alineado al
 * campo, pero si el panel a su ancho natural no cabe hacia la derecha,
 * `absolutePosition` lo corre a la izquierda para alinear bordes derechos.
 * Esto topa el panel interno al ancho del trigger y devuelve el wrapper a la
 * izquierda del campo (ya achicado, siempre cabe); en iOS un panel que
 * sobresale ensancha la página. Los nombres largos igual se leen por el wrap
 * forzado del overlay (styles.css). No tocar el `left` del panel interno: trae
 * `position:absolute; left:0` dentro del wrapper y moverlo duplica el offset.
 *
 * `triggerId` es el `inputId` (o `id`) del `p-select`; `panelClass` es su
 * `panelStyleClass`.
 */
export function alignOverlayToTrigger(triggerId: string, panelClass: string): void {
  requestAnimationFrame(() => {
    const trigger = document.getElementById(triggerId)?.closest('p-select') as HTMLElement | null;
    const panel = document.querySelector(`.${panelClass}`) as HTMLElement | null;
    if (trigger && panel) {
      const rect = trigger.getBoundingClientRect();
      panel.style.width = `${rect.width}px`;
      const wrapper = panel.closest('.p-overlay') as HTMLElement | null;
      if (wrapper) {
        wrapper.style.insetInlineStart = `${rect.left + window.scrollX}px`;
      }
    }
  });
}
