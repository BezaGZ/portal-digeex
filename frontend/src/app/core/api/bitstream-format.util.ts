/**
 * Resuelve el par (mime, label) de un bitstream a partir del nombre del
 * archivo. El mime se usa para previsualizadores (PDF embebido, image src) y
 * el label es la etiqueta humana que se muestra junto al archivo en la
 * vista publica. Centralizado para que detail, card y demas consumidores
 * no dupliquen el switch ni los literales de mime types.
 *
 * Si la extension no esta en el mapa, devuelve octet-stream y el label
 * deja la extension cruda en mayusculas para que el usuario al menos
 * vea de que tipo es.
 */
export interface BitstreamFormatInfo {
  mime: string;
  label: string;
}

/** Mapa unico extension -> formato. Agregar una nueva extension es una sola fila. */
const FORMAT_TABLE: Record<string, BitstreamFormatInfo> = {
  pdf: { mime: 'application/pdf', label: 'PDF' },

  doc: { mime: 'application/msword', label: 'Word' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
  },

  xls: { mime: 'application/vnd.ms-excel', label: 'Excel' },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
  },

  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint' },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint',
  },

  odt: { mime: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument' },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', label: 'OpenDocument' },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', label: 'OpenDocument' },

  rtf: { mime: 'application/rtf', label: 'RTF' },
  txt: { mime: 'text/plain', label: 'Texto' },
  csv: { mime: 'text/csv', label: 'CSV' },

  jpg: { mime: 'image/jpeg', label: 'JPEG' },
  jpeg: { mime: 'image/jpeg', label: 'JPEG' },
  png: { mime: 'image/png', label: 'PNG' },
};

export function inferBitstreamFormat(filename: string): BitstreamFormatInfo {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0 || dot === lower.length - 1) {
    return { mime: 'application/octet-stream', label: 'Archivo' };
  }
  const ext = lower.slice(dot + 1);
  const found = FORMAT_TABLE[ext];
  if (found) return found;
  return { mime: 'application/octet-stream', label: ext.toUpperCase() };
}
