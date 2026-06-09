import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { TimelineEntry } from '../../../features/administration/content/provenance/timeline-entry.model';
import {
  HistoryDsoType,
  buildHistoryPdf,
  slugifyForFilename,
} from './history-pdf-builder';

/**
 * Botón "Exportar PDF" reusable. Wrapper UI fino sobre `buildHistoryPdf`:
 * el componente se ocupa del click y la descarga; la lógica del PDF vive
 * en el builder puro para que sea testeable sin Angular.
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

  /** Construye el blob del PDF vía `buildHistoryPdf` y lo descarga con un `<a download>` temporal. */
  onExport(): void {
    const blob = buildHistoryPdf({
      dsoTitle: this.dsoTitle,
      dsoSubtitle: this.dsoSubtitle,
      dsoDescription: this.dsoDescription,
      dsoType: this.dsoType,
      entries: this.entries,
      handle: this.handle,
      generatedAt: new Date(),
    });
    this.triggerDownload(blob, this.computeFilename());
  }

  /** Filename `historial-{slug-del-titulo}-{YYYY-MM-DD}.pdf` con slug seguro para filesystem. */
  private computeFilename(): string {
    const slug = slugifyForFilename(this.dsoTitle) || 'documento';
    const today = new Date().toISOString().slice(0, 10);
    return `historial-${slug}-${today}.pdf`;
  }

  /**
   * Descarga el blob con un `<a download>` temporal y revoca el object URL
   * en el siguiente tick para no filtrar memoria.
   */
  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
