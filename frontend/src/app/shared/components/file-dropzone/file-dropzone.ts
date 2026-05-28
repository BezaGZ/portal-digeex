import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadModule } from 'primeng/fileupload';
import { ButtonModule } from 'primeng/button';

import { FileSizePipe } from '../../pipes';
import { inferBitstreamFormat } from '../../../core/api/bitstream-format.util';

/**
 * Dropzone reusable que envuelve `<p-fileupload>` de PrimeNG 20.
 *
 * Esconde los botones Upload/Cancel inertes (el upload real lo dispara el
 * facade post-archive), muestra un dropzone con ícono cuando está vacío y
 * renderiza cada archivo seleccionado en una fila limpia. Soporta selección
 * individual o múltiple y `accept` configurable.
 *
 * Inputs:
 *  - `accept`: extensiones aceptadas, formato del atributo HTML accept.
 *  - `multiple`: si true, permite seleccionar varios archivos.
 *  - `chooseLabel`: texto del botón principal (default "Elegir archivos").
 *  - `dropMessage`: texto que aparece en el dropzone vacío.
 *
 * Outputs:
 *  - `filesChange<File[]>`: emite la lista actual cada vez que cambia
 *    (selección, remoción individual, clear).
 */
@Component({
  selector: 'app-file-dropzone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FileUploadModule, ButtonModule, FileSizePipe],
  templateUrl: './file-dropzone.html',
})
export class FileDropzoneComponent {
  @Input() accept = '';
  @Input() multiple = false;
  @Input() chooseLabel = 'Elegir archivos';
  @Input() dropMessage = 'Arrastrá los archivos aquí o usá el botón de elegir.';

  @Output() readonly filesChange = new EventEmitter<File[]>();

  /**
   * `(onSelect)` del p-fileUpload entrega los archivos en `currentFiles`
   * (advanced mode acumulado) o `files` (sólo el lote actual). Tomamos
   * `currentFiles` cuando viene; sirve también para los specs antiguos
   * que mockean con shape `{files}`.
   */
  onSelect(event: { files?: File[]; currentFiles?: File[] }): void {
    const list = event.currentFiles ?? event.files ?? [];
    this.filesChange.emit(Array.from(list));
  }

  /**
   * `FileUpload.remove` de PrimeNG emite onRemove ANTES del splice, así que
   * `pfu.files` todavía trae el archivo removido; lo descartamos por referencia
   * usando `event.file` y emitimos el resto.
   */
  onRemove(event: { file?: File }, files: File[]): void {
    const removed = event.file;
    const remaining = removed ? files.filter((f) => f !== removed) : [...files];
    this.filesChange.emit(remaining);
  }

  /** El `(onClear)` del p-fileUpload notifica que el usuario limpió la selección. */
  onClear(): void {
    this.filesChange.emit([]);
  }

  /**
   * Devuelve el ícono de PrimeIcons según la extensión del archivo. Usa el
   * helper inferBitstreamFormat que ya conoce los 16 formatos del proyecto.
   */
  iconFor(filename: string): string {
    const fmt = inferBitstreamFormat(filename).label;
    switch (fmt) {
      case 'PDF':
        return 'pi pi-file-pdf';
      case 'Word':
        return 'pi pi-file-word';
      case 'Excel':
      case 'CSV':
        return 'pi pi-file-excel';
      case 'JPEG':
      case 'PNG':
        return 'pi pi-image';
      default:
        return 'pi pi-file';
    }
  }
}
