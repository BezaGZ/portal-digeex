/**
 * Con `appendTo="body"` el panel del `p-select` flota en el body y no hereda el
 * ancho ni queda alineado al campo; en iOS un panel más ancho o corrido ensancha
 * la página. Esto lo topa al ancho del trigger y lo alinea a su izquierda; los
 * nombres largos igual se leen por el wrap forzado del overlay (styles.css).
 *
 * `triggerId` es el `inputId` del `p-select`; `panelClass` es su `panelStyleClass`.
 */
export function alignOverlayToTrigger(triggerId: string, panelClass: string): void {
  requestAnimationFrame(() => {
    const trigger = document.getElementById(triggerId)?.closest('p-select') as HTMLElement | null;
    const panel = document.querySelector(`.${panelClass}`) as HTMLElement | null;
    if (trigger && panel) {
      const rect = trigger.getBoundingClientRect();
      panel.style.width = `${rect.width}px`;
      panel.style.left = `${rect.left + window.scrollX}px`;
    }
  });
}
