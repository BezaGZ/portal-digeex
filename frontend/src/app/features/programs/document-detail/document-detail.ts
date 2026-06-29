import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  DestroyRef,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { CollectionApiService } from '../../../core/api/collection-api.service';
import { StatisticsTrackingService } from '../../../core/api/statistics-tracking.service';
import { VocabularyDisplayService } from '../../../core/api/vocabulary-display.service';
import { BitstreamDownloadService } from '../../../core/api/bitstream-download.service';
import { LoadingService } from '../../../core/loading';
import { inferBitstreamFormat } from '../../../core/api/bitstream-format.util';
import { parseIsoDateLocal } from '../../../core/i18n/iso-date.util';
import { paginateAll$ } from '../../../core/api/dspace-rest.util';
import { BitstreamView, MetadataFieldView, Item, MetadataMap, Bitstream } from '../../../core/api/models';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SkeletonDetail } from '../../../shared';
import { FileSizePipe } from '../../../shared/pipes';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, SkeletonDetail, FileSizePipe],
  templateUrl: './document-detail.html',
})
export class DocumentDetail implements OnInit {
  private destroyRef = inject(DestroyRef);
  documentId: string = '';
  programId: string = '';
  readonly documentTitle = signal('Documento');
  readonly documentDescription = signal('');
  readonly documentCoverImage = signal('');
  /** True cuando el <img> de la portada falla; el template muestra el ícono PDF. */
  readonly coverImageError = signal(false);
  readonly documentBitstreams = signal<BitstreamView[]>([]);
  readonly metadataFields = signal<MetadataFieldView[]>([]);
  readonly isLoading = signal(false);
  readonly isVideo = signal(false);
  readonly videoUrl = signal('');
  /** Estado del boton ZIP mientras se arma el archivo en memoria. */
  readonly downloadingZip = signal(false);

  onCoverImageError(): void {
    this.coverImageError.set(true);
  }

  constructor(
    private route: ActivatedRoute,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
    private collectionApi: CollectionApiService,
    private vocabDisplay: VocabularyDisplayService,
    private downloader: BitstreamDownloadService,
    private tracking: StatisticsTrackingService,
    private loading: LoadingService,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.documentId = params['docId'];
      this.programId = params['id'] || '';
      this.loadDocument(this.documentId);
    });
  }

  private loadDocument(itemUuid: string) {
    this.isLoading.set(true);

    this.dspaceApi.getItem(itemUuid, 'thumbnail').pipe(
      switchMap((item: Item) => {
        this.documentTitle.set(item.metadata?.['dc.title']?.[0]?.value || 'Sin título');
        this.documentDescription.set(item.metadata?.['dc.description.abstract']?.[0]?.value || '');
        this.isVideo.set(item.metadata?.['dc.type']?.[0]?.value === 'Video');
        this.videoUrl.set(item.metadata?.['dc.relation.uri']?.[0]?.value || '');

        // Registra la visita al item en Solr Statistics (best-effort).
        this.tracking
          .trackView$(item.uuid, 'item')
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe();

        const originalBitstreams$ = this.dspaceApi.getBundles(itemUuid, 0, 20, 'bitstreams').pipe(
          switchMap((bundlesResponse) => {
            const bundles = bundlesResponse._embedded?.['bundles'] || [];
            const original = bundles.find((b) => b.name === 'ORIGINAL');
            if (!original) {
              return of([] as Bitstream[]);
            }
            const embedded = original._embedded?.bitstreams?._embedded?.bitstreams ?? [];
            const total = original._embedded?.bitstreams?.page?.totalElements ?? embedded.length;
            if (total <= embedded.length) {
              return of(embedded);
            }
            return paginateAll$(
              (page) => this.dspaceApi.getBitstreamsFromBundle(original.uuid, page, 100),
              (res) => res._embedded?.['bitstreams'] ?? [],
            );
          })
        );

        return forkJoin({
          originalBitstreams: originalBitstreams$,
          vocabLabels: this.resolveVocabLabels$(item.metadata),
        }).pipe(map((res) => ({ item, ...res })));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response) => {
        this.buildMetadataFields(response.item.metadata, null, response.vocabLabels);

        this.documentBitstreams.set(response.originalBitstreams
          .filter((b: Bitstream) => b.name !== '_video_link.txt')
          .map((bitstream: Bitstream) => {
            const fmt = inferBitstreamFormat(bitstream.name || '');
            return {
              name: bitstream.name || '',
              url: `/server/api/core/bitstreams/${bitstream.uuid}/content`,
              size: bitstream.sizeBytes || 0,
              format: fmt.mime,
              formatLabel: fmt.label,
              uuid: bitstream.uuid,
            } as BitstreamView;
          }));

        // Portada: el thumbnail designado del item (la portada manual). Si el
        // item no tiene portada, cae a una imagen del ORIGINAL.
        if (response.item.thumbnail?.uuid) {
          this.documentCoverImage.set(`/server/api/core/bitstreams/${response.item.thumbnail.uuid}/content`);
        } else {
          const imageBitstream = this.documentBitstreams().find((b) =>
            b.format.startsWith('image/'),
          );
          if (imageBitstream) {
            this.documentCoverImage.set(imageBitstream.url);
          }
        }

        this.isLoading.set(false);

        const ancestorTrail: MenuItem[] = history.state?.trail || [];

        if (ancestorTrail.length > 0) {
          this.breadcrumbService.setTrail([...ancestorTrail, { label: this.documentTitle() }]);
        } else if (this.programId) {
          this.loadProgramForBreadcrumb(this.programId);
        } else {
          this.breadcrumbService.setTrail([{ label: this.documentTitle() }]);
        }
      },
      error: (error) => {
        console.error('Error al cargar Item desde DSpace:', error);
        this.documentTitle.set('Error');
        this.documentDescription.set('No se pudo cargar el documento');
        this.isLoading.set(false);
      },
    });
  }

  private loadProgramForBreadcrumb(collectionUuid: string) {
    this.collectionApi.getOne(collectionUuid).subscribe({
      next: (collection) => {
        const programName = collection.metadata?.['dc.title.alternative']?.[0]?.value || collection.name;
        this.breadcrumbService.setTrail([
          { label: programName, routerLink: `/programas/${collectionUuid}` },
          { label: this.documentTitle() },
        ]);
      },
      error: (error) => {
        console.error('Error al cargar programa para breadcrumb:', error);
        this.breadcrumbService.setTrail([{ label: this.documentTitle() }]);
      },
    });
  }

  /**
   * Resuelve el display label del idioma (`dc.language.iso`), único campo que
   * guarda un código (ISO `es` → `Español`). `dcterms.educationLevel` y `dc.type` ya llegan
   * legibles desde DSpace, así que no se traducen.
   */
  private resolveVocabLabels$(metadata: MetadataMap): Observable<{
    language: string | null;
    audience: string | null;
    type: string | null;
  }> {
    const langValue = metadata?.['dc.language.iso']?.[0]?.value;

    return forkJoin({
      language: langValue
        ? this.vocabDisplay.display$('idiomas-digeex', langValue)
        : of(null),
      audience: of(null),
      type: of(null),
    });
  }

  private buildMetadataFields(
    metadata: MetadataMap,
    collectionName: string | null,
    vocabLabels: { language: string | null; audience: string | null; type: string | null },
  ) {
    const fields: MetadataFieldView[] = [];

    const fieldLabels: Record<string, string> = {
      'dc.contributor.author': 'Autor / Área responsable',
      'dc.date.issued': 'Fecha de publicación',
      'dc.type': 'Tipo de documento',
      'dcterms.educationLevel': 'Nivel educativo',
      'dc.subject': 'Palabras clave',
      'dc.language.iso': 'Idioma',
      'dc.publisher': 'Publicado por',
    };

    if (collectionName) {
      fields.push({
        label: 'Colección / Programa',
        value: collectionName,
        type: 'text',
      });
    }

    for (const [fieldKey, fieldLabel] of Object.entries(fieldLabels)) {
      if (this.isVideo() && fieldKey === 'dcterms.educationLevel') continue;

      const fieldValues = metadata?.[fieldKey];

      if (fieldValues && fieldValues.length > 0) {
        if (fieldKey === 'dc.subject') {
          const keywords = fieldValues.map((v) => v.value);
          fields.push({
            label: fieldLabel,
            value: keywords,
            type: 'list',
          });
        } else if (fieldKey === 'dc.language.iso') {
          fields.push({
            label: fieldLabel,
            value: vocabLabels.language ?? fieldValues[0].value,
            type: 'text',
          });
        } else if (fieldKey === 'dcterms.educationLevel') {
          fields.push({
            label: fieldLabel,
            value: vocabLabels.audience ?? fieldValues[0].value,
            type: 'text',
          });
        } else if (fieldKey === 'dc.type') {
          fields.push({
            label: fieldLabel,
            value: vocabLabels.type ?? fieldValues[0].value,
            type: 'text',
          });
        } else if (fieldKey === 'dc.date.issued') {
          const dateValue = fieldValues[0].value;
          const displayValue = dateValue.length === 4 ? dateValue : this.formatDate(dateValue);
          fields.push({
            label: fieldLabel,
            value: displayValue,
            type: 'date',
          });
        } else {
          fields.push({
            label: fieldLabel,
            value: fieldValues[0].value,
            type: 'text',
          });
        }
      }
    }

    this.metadataFields.set(fields);
  }

  private formatDate(dateString: string): string {
    const date = parseIsoDateLocal(dateString);
    if (!date) return dateString;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /** Dispara la descarga del bitstream individual via <a download>. */
  downloadBitstream(bitstream: BitstreamView): void {
    const link = document.createElement('a');
    link.href = bitstream.url;
    link.download = bitstream.name;
    link.click();
  }

  /**
   * Abre un PDF en pestana nueva via blob URL para evitar el "open with" del
   * browser; otros mimes caen al download directo. El overlay de carga cubre la
   * descarga para que un PDF pesado no parezca un clic muerto.
   */
  async viewBitstream(bitstream: BitstreamView): Promise<void> {
    if (bitstream.format !== 'application/pdf') {
      this.downloadBitstream(bitstream);
      return;
    }
    const taskId = this.loading.begin({ message: 'Preparando documento…' });
    try {
      const response = await fetch(bitstream.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const viewerWindow = window.open(blobUrl, '_blank');
      if (viewerWindow) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch {
      window.open(bitstream.url, '_blank');
    } finally {
      this.loading.end(taskId);
    }
  }

  /**
   * Delega en BitstreamDownloadService que decide single vs ZIP segun la
   * cantidad de bitstreams. Mantiene el flag downloadingZip para [loading]
   * del boton y evitar dobles clicks; el servicio se encarga del JSZip y
   * del <a download>.
   */
  async downloadAllAsZip(): Promise<void> {
    if (this.downloadingZip() || this.documentBitstreams().length === 0) return;
    this.downloadingZip.set(true);
    try {
      await this.downloader.downloadAuto(
        this.documentBitstreams(),
        this.documentTitle() || 'documento',
      );
    } finally {
      this.downloadingZip.set(false);
    }
  }

  openVideo() {
    if (this.videoUrl()) {
      window.open(this.videoUrl(), '_blank', 'noopener');
    }
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
