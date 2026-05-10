import { Injectable } from '@angular/core';

import { BitstreamView } from './models/view.model';

/**
 * Centraliza la descarga de bitstreams para que el detalle del item y la
 * card del listado compartan la misma lógica.
 *
 * downloadAuto elige solo: un bitstream baja directo via <a download>;
 * varios se empaquetan en un ZIP en memoria via JSZip (import lazy para
 * no inflar el bundle hasta que la feature se use). Lista vacía es no-op.
 */
@Injectable({ providedIn: 'root' })
export class BitstreamDownloadService {
  async downloadAuto(bitstreams: BitstreamView[], zipBaseName: string): Promise<void> {
    if (bitstreams.length === 0) return;
    if (bitstreams.length === 1) {
      this.downloadOne(bitstreams[0]);
      return;
    }
    await this.downloadManyAsZip(bitstreams, zipBaseName);
  }

  private downloadOne(bitstream: BitstreamView): void {
    const link = document.createElement('a');
    link.href = bitstream.url;
    link.download = bitstream.name;
    link.click();
  }

  private async downloadManyAsZip(
    bitstreams: BitstreamView[],
    zipBaseName: string,
  ): Promise<void> {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    // Fetch en paralelo de los blobs; cada bitstream queda en el zip con su
    // nombre original. Si dos comparten nombre JSZip los desambigua solo.
    await Promise.all(
      bitstreams.map(async (b) => {
        const response = await fetch(b.url);
        const blob = await response.blob();
        zip.file(b.name, blob);
      }),
    );
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${zipBaseName || 'documento'}.zip`;
    link.click();
    // Defer para que el browser inicie la descarga antes de invalidar el blob.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
}
