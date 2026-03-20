import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { BreadcrumbService } from '../../../core/breadcrumb/breadcrumb.service';
import { DSpaceApiService } from '../../../core/api/dspace-api.service';
import { BitstreamView, MetadataFieldView, Item, MetadataMap } from '../../../core/api/models';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SkeletonDetailComponent } from '../../../shared';
import { FileSizePipe } from '../../../shared/pipes';

@Component({
  selector: 'app-document-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, SkeletonDetailComponent, FileSizePipe],
  templateUrl: './document-detail.component.html',
})
export class DocumentDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  documentId: string = '';
  programId: string = '';
  documentTitle: string = 'Documento';
  documentDescription: string = '';
  documentCoverImage: string = '';
  documentBitstreams: BitstreamView[] = [];
  metadataFields: MetadataFieldView[] = [];
  isLoading = false;

  constructor(
    private route: ActivatedRoute,
    private breadcrumbService: BreadcrumbService,
    private dspaceApi: DSpaceApiService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.documentId = params['docId'];
      this.programId = params['id'] || '';
      this.loadDocument(this.documentId);
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDocument(itemUuid: string) {
    this.isLoading = true;

    forkJoin({
      item: this.dspaceApi.getItem(itemUuid),
      bitstreams: this.dspaceApi.getBitstreams(itemUuid, 0, 20),
    }).subscribe({
      next: (response) => {
        const item: Item = response.item;
        const bitstreamsResponse = response.bitstreams;

        this.documentTitle = item.metadata?.['dc.title']?.[0]?.value || 'Sin título';
        this.documentDescription = item.metadata?.['dc.description']?.[0]?.value || '';
        this.buildMetadataFields(item.metadata, null);

        const bitstreams = bitstreamsResponse._embedded?.['bitstreams'] || [];
        this.documentBitstreams = bitstreams.map((bitstream) => {
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

        const thumbnailBitstream = this.documentBitstreams.find((b) =>
          b.format.startsWith('image/'),
        );

        if (thumbnailBitstream) {
          this.documentCoverImage = thumbnailBitstream.url;
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

    const fieldLabels: Record<string, string> = {
      'dc.contributor.author': 'Autor / Área responsable',
      'dc.date.issued': 'Fecha de publicación',
      'dc.type': 'Tipo de documento',
      'dcterms.audience': 'Nivel educativo',
      'dc.subject': 'Palabras clave',
      'dc.language.iso': 'Idioma',
      'dc.publisher': 'Publicado por',
    };

    const languageNames: Record<string, string> = {
      es: 'Español',
      quc: "K'iche'",
      kaq: 'Kaqchikel',
      mam: 'Mam',
      qeq: "Q'eqchi'",
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
          const langName = languageNames[langCode] || langCode;
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
    }
  }

  goBack() {
    if (typeof history !== 'undefined') {
      history.back();
    }
  }
}
