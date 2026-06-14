import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { TimelineEntry } from '../../../core/provenance/timeline-entry.model';
import { slugifyForFilename } from '../pdf/pdf-filename';
import { HistoryDsoType, buildHistoryPdf } from './history-pdf-builder';

/**
 * Componente de botón reusable para exportar el historial a PDF.
 * Gestiona el evento de exportación e inicia la descarga del archivo generado por `buildHistoryPdf`.
 */
@Component({
  selector: 'app-export-history-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, TooltipModule],
  templateUrl: './export-history-button.component.html',
})
export class ExportHistoryButton {
  @Input({ required: true }) dsoTitle = '';
  @Input() dsoSubtitle?: string;
  @Input() dsoDescription?: string;
  @Input({ required: true }) dsoType: HistoryDsoType = 'item';
  @Input({ required: true }) entries: readonly TimelineEntry[] = [];
  @Input() handle?: string;
  @Input() uuid?: string;

  /** Genera el archivo PDF a partir de los datos de entrada e inicia su descarga. */
  onExport(): void {
    const blob = buildHistoryPdf({
      dsoTitle: this.dsoTitle,
      dsoSubtitle: this.dsoSubtitle,
      dsoDescription: this.dsoDescription,
      dsoType: this.dsoType,
      entries: this.entries,
      handle: this.handle,
      uuid: this.uuid,
      generatedAt: new Date(),
    });
    this.triggerDownload(blob, this.computeFilename());
  }

  /** Genera el nombre de archivo en formato `historial-{slug-del-titulo}-{fecha}.pdf`. */
  private computeFilename(): string {
    const slug = slugifyForFilename(this.dsoTitle) || 'documento';
    const today = new Date().toISOString().slice(0, 10);
    return `historial-${slug}-${today}.pdf`;
  }

  /**
   * Crea un enlace temporal para la descarga del archivo Blob y revoca la URL del objeto
   * para liberar memoria.
   */
  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => {
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }, 0);
  }
}
