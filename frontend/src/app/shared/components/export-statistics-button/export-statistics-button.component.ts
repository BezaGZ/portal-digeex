import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { LoadedReport, UsageReportDsoType } from '../../../core/api/usage-report.model';
import { slugifyForFilename } from '../pdf/pdf-filename';
import { buildStatisticsPdf } from './statistics-pdf-builder';

/**
 * Botón reusable para exportar las estadísticas de uso a PDF. Solo arma el
 * input, calcula el filename e inicia la descarga; la composición del PDF
 * vive en `buildStatisticsPdf`.
 */
@Component({
  selector: 'app-export-statistics-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, TooltipModule],
  templateUrl: './export-statistics-button.component.html',
})
export class ExportStatisticsButton {
  readonly dsoTitle = input.required<string>();
  readonly dsoType = input.required<UsageReportDsoType>();
  readonly reports = input.required<readonly LoadedReport[]>();
  readonly monthsBack = input<number | null>(null);
  readonly handle = input<string | undefined>(undefined);
  readonly uuid = input<string | undefined>(undefined);

  /** Sin ningún report cargado no hay nada que exportar; el botón se deshabilita. */
  readonly disabled = computed(() => this.reports().every((r) => r.report === null));

  /** Genera el archivo PDF a partir de los datos de entrada e inicia su descarga. */
  onExport(): void {
    const blob = buildStatisticsPdf({
      dsoTitle: this.dsoTitle(),
      dsoType: this.dsoType(),
      reports: this.reports(),
      monthsBack: this.monthsBack(),
      handle: this.handle(),
      uuid: this.uuid(),
      generatedAt: new Date(),
    });
    this.triggerDownload(blob, this.computeFilename());
  }

  /** Genera el nombre de archivo en formato `estadisticas-{slug-del-titulo}-{fecha}.pdf`. */
  private computeFilename(): string {
    const slug = slugifyForFilename(this.dsoTitle()) || 'recurso';
    const today = new Date().toISOString().slice(0, 10);
    return `estadisticas-${slug}-${today}.pdf`;
  }

  /**
   * Crea un enlace temporal para la descarga del archivo Blob y revoca la URL
   * del objeto para liberar memoria.
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
