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
import { inferBitstreamFormat } from '../../../core/api/bitstream-format.util';
import { parseIsoDateLocal } from '../../../core/i18n/iso-date.util';
import { BitstreamView, MetadataFieldView, Item, MetadataMap, Bitstream } from '../../../core/api/models';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SkeletonDetailComponent } from '../../../shared';
import { FileSizePipe } from '../../../shared/pipes';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, SkeletonDetailComponent, FileSizePipe],
  templateUrl: './document-detail.component.html',
})
export class DocumentDetailComponent implements OnInit {
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

    this.dspaceApi.getItem(itemUuid).pipe(
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

        const bundlesAndBitstreams$ = this.dspaceApi.getBundles(itemUuid).pipe(
          switchMap((bundlesResponse) => {
            const bundles = bundlesResponse._embedded?.['bundles'] || [];

            const thumbnailBundle = bundles.find((b) => b.name === 'THUMBNAIL');
            const originalBundle = bundles.find((b) => b.name === 'ORIGINAL');

            const thumbnail$ = thumbnailBundle
              ? this.dspaceApi.getBitstreamsFromBundle(thumbnailBundle.uuid)
              : of(null);
            const original$ = originalBundle
              ? this.dspaceApi.getBitstreamsFromBundle(originalBundle.uuid)
              : of(null);

            return forkJoin({ thumbnail: thumbnail$, original: original$ });
          })
        );

        return forkJoin({
          bundles: bundlesAndBitstreams$,
          vocabLabels: this.resolveVocabLabels$(item.metadata),
        }).pipe(map((res) => ({ item, ...res })));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response) => {
        this.buildMetadataFields(response.item.metadata, null, response.vocabLabels);
        if (response.bundles.original) {
          const originalBitstreams = response.bundles.original._embedded?.['bitstreams'] || [];
          this.documentBitstreams.set(originalBitstreams
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
        }

        if (response.bundles.thumbnail) {
          const thumbnailBitstreams = response.bundles.thumbnail._embedded?.['bitstreams'] || [];
          if (thumbnailBitstreams.length > 0) {
            const thumbnail = thumbnailBitstreams[0];
            this.documentCoverImage.set(`/server/api/core/bitstreams/${thumbnail.uuid}/content`);
          }
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
   * Resuelve los display labels de los vocabularios DSpace que aplica el item:
   * idiomas-digeex para dc.language.iso, niveles-educativos para dc.audience y
   * tipos-documento para dc.type. Devuelve null en cada uno si el item no trae
   * ese campo, asi forkJoin no bloquea por una rama vacia.
   */
  private resolveVocabLabels$(metadata: MetadataMap): Observable<{
    language: string | null;
    audience: string | null;
    type: string | null;
  }> {
    const langValue = metadata?.['dc.language.iso']?.[0]?.value;
    const audienceValue = metadata?.['dc.audience']?.[0]?.value;
    const typeValue = metadata?.['dc.type']?.[0]?.value;

    return forkJoin({
      language: langValue
        ? this.vocabDisplay.display$('idiomas-digeex', langValue)
        : of(null),
      audience: audienceValue
        ? this.vocabDisplay.display$('niveles-educativos', audienceValue)
        : of(null),
      type: typeValue ? this.vocabDisplay.display$('tipos-documento', typeValue) : of(null),
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
      'dc.audience': 'Nivel educativo',
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
      if (this.isVideo() && fieldKey === 'dc.audience') continue;

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
        } else if (fieldKey === 'dc.audience') {
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
   * Abre un PDF en pestana nueva via blob URL para evitar el "open with"
   * del browser. Para otros mimes el navegador no tiene preview universal,
   * asi que cae al download directo.
   */
  viewBitstream(bitstream: BitstreamView): void {
    if (bitstream.format !== 'application/pdf') {
      this.downloadBitstream(bitstream);
      return;
    }
    fetch(bitstream.url)
      .then((response) => response.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const viewerWindow = window.open(blobUrl, '_blank');
        if (viewerWindow) {
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }
      })
      .catch(() => {
        window.open(bitstream.url, '_blank');
      });
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
