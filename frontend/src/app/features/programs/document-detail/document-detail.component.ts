import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { BitstreamView, MetadataFieldView, Item, MetadataMap, Bitstream } from '../../../core/api/models';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
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
  documentTitle: string = 'Documento';
  documentDescription: string = '';
  documentCoverImage: string = '';
  documentBitstreams: BitstreamView[] = [];
  metadataFields: MetadataFieldView[] = [];
  isLoading = false;
  isVideo = false;
  videoUrl = '';

  constructor(
    private route: ActivatedRoute,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.documentId = params['docId'];
      this.programId = params['id'] || '';
      this.loadDocument(this.documentId);
    });
  }

  private loadDocument(itemUuid: string) {
    this.isLoading = true;

    this.dspaceApi.getItem(itemUuid).pipe(
      switchMap((item: Item) => {
        this.documentTitle = item.metadata?.['dc.title']?.[0]?.value || 'Sin título';
        this.documentDescription = item.metadata?.['dc.description.abstract']?.[0]?.value || '';
        this.isVideo = item.metadata?.['dc.type']?.[0]?.value === 'Video';
        this.videoUrl = item.metadata?.['dc.relation.uri']?.[0]?.value || '';
        this.buildMetadataFields(item.metadata, null);

        return this.dspaceApi.getBundles(itemUuid).pipe(
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
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response) => {
        if (response.original) {
          const originalBitstreams = response.original._embedded?.['bitstreams'] || [];
          this.documentBitstreams = originalBitstreams.map((bitstream: Bitstream) => {
            const fileName = bitstream.name?.toLowerCase() || '';
            let format = 'application/octet-stream';
            if (fileName.endsWith('.pdf')) {
              format = 'application/pdf';
            } else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
              format = 'image/jpeg';
            } else if (fileName.endsWith('.png')) {
              format = 'image/png';
            }

            return {
              name: bitstream.name || '',
              url: `/server/api/core/bitstreams/${bitstream.uuid}/content`,
              size: bitstream.sizeBytes || 0,
              format: format,
              uuid: bitstream.uuid,
            } as BitstreamView;
          });
        }

        if (response.thumbnail) {
          const thumbnailBitstreams = response.thumbnail._embedded?.['bitstreams'] || [];
          if (thumbnailBitstreams.length > 0) {
            const thumbnail = thumbnailBitstreams[0];
            this.documentCoverImage = `/server/api/core/bitstreams/${thumbnail.uuid}/content`;
          }
        } else {
          const imageBitstream = this.documentBitstreams.find((b) =>
            b.format.startsWith('image/'),
          );
          if (imageBitstream) {
            this.documentCoverImage = imageBitstream.url;
          }
        }

        this.isLoading = false;
        this.cdr.markForCheck();

        const ancestorTrail: MenuItem[] = history.state?.trail || [];

        if (ancestorTrail.length > 0) {
          this.breadcrumbService.setTrail([...ancestorTrail, { label: this.documentTitle }]);
        } else if (this.programId) {
          this.loadProgramForBreadcrumb(this.programId);
        } else {
          this.breadcrumbService.setTrail([{ label: this.documentTitle }]);
        }
      },
      error: (error) => {
        console.error('Error al cargar Item desde DSpace:', error);
        this.documentTitle = 'Error';
        this.documentDescription = 'No se pudo cargar el documento';
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadProgramForBreadcrumb(collectionUuid: string) {
    this.dspaceApi.getCollection(collectionUuid).subscribe({
      next: (collection) => {
        const programName = collection.metadata?.['dc.subject']?.[0]?.value || collection.name;
        this.breadcrumbService.setTrail([
          { label: programName, routerLink: `/programas/${collectionUuid}` },
          { label: this.documentTitle },
        ]);
      },
      error: (error) => {
        console.error('Error al cargar programa para breadcrumb:', error);
        this.breadcrumbService.setTrail([{ label: this.documentTitle }]);
      },
    });
  }

  private buildMetadataFields(metadata: MetadataMap, collectionName: string | null) {
    this.metadataFields = [];

    // TODO: Consumir labels desde DSpace submission-forms.xml vía REST API
    // Ver: GET /server/api/submission/vocabularies
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
      this.metadataFields.push({
        label: 'Colección / Programa',
        value: collectionName,
        type: 'text',
      });
    }

    for (const [fieldKey, fieldLabel] of Object.entries(fieldLabels)) {
      const fieldValues = metadata?.[fieldKey];

      if (fieldValues && fieldValues.length > 0) {
        if (fieldKey === 'dc.subject') {
          const keywords = fieldValues.map((v) => v.value);
          this.metadataFields.push({
            label: fieldLabel,
            value: keywords,
            type: 'list',
          });
        } else if (fieldKey === 'dc.language.iso') {
          const langCode = fieldValues[0].value;
          // TODO: Consumir desde GET /server/api/submission/vocabularies
          // Los 25 idiomas oficiales están en docker/submission-forms.xml
          // Mapeo temporal de los 5 más comunes
          const commonLanguages: Record<string, string> = {
            es: 'Español',
            quc: "K'iche'",
            cak: 'Kaqchikel',
            mam: 'Mam',
            kek: "Q'eqchi'",
          };
          const langName = commonLanguages[langCode] || langCode.toUpperCase();
          this.metadataFields.push({
            label: fieldLabel,
            value: langName,
            type: 'text',
          });
        } else if (fieldKey === 'dc.date.issued') {
          const dateValue = fieldValues[0].value;
          const displayValue = dateValue.length === 4 ? dateValue : this.formatDate(dateValue);
          this.metadataFields.push({
            label: fieldLabel,
            value: displayValue,
            type: 'date',
          });
        } else {
          this.metadataFields.push({
            label: fieldLabel,
            value: fieldValues[0].value,
            type: 'text',
          });
        }
      }
    }
  }

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }

  downloadDocument() {
    const pdfBitstream = this.documentBitstreams.find((b) => b.format === 'application/pdf');

    if (pdfBitstream) {
      const link = document.createElement('a');
      link.href = pdfBitstream.url;
      link.download = pdfBitstream.name;
      link.click();
    } else if (this.documentBitstreams.length > 0) {
      const primaryBitstream = this.documentBitstreams[0];
      const link = document.createElement('a');
      link.href = primaryBitstream.url;
      link.download = primaryBitstream.name;
      link.click();
    }
  }

  viewDocument() {
    const pdfBitstream = this.documentBitstreams.find((b) => b.format === 'application/pdf');

    if (pdfBitstream) {
      fetch(pdfBitstream.url)
        .then((response) => response.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);

          const viewerWindow = window.open(blobUrl, '_blank');

          if (viewerWindow) {
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          }
        })
        .catch((error) => {
          console.error('Error al cargar PDF para visualización:', error);
          window.open(pdfBitstream.url, '_blank');
        });
    } else if (this.documentBitstreams.length > 0) {
      window.open(this.documentBitstreams[0].url, '_blank');
    }
  }

  openVideo() {
    if (this.videoUrl) {
      window.open(this.videoUrl, '_blank', 'noopener');
    }
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
