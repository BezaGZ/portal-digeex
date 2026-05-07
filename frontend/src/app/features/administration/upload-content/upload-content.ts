import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * Placeholder de la pantalla "Cargar contenido". El destino final lista las
 * colecciones (programas) donde el caller puede subir items, filtradas por
 * el sufijo de su sub para admin_subdireccion y personal_delegado, sin
 * filtro para superadmin. Cada fila lleva al `<app-submission-host>` que
 * monta el formulario correspondiente segun `dspace.entity.type` de la
 * coleccion. Por ahora solo el stub para que el sidebar no rompa la nav.
 */
@Component({
  selector: 'app-upload-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upload-content.html',
})
export class UploadContent {}
