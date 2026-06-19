import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

import { AlbumCardComponent } from './album-card';
import { Album } from '../../models';

/**
 * Tests de `AlbumCardComponent`.
 *
 * Card del listado público de álbumes: muestra portada, fecha y tipo de
 * evento. La fecha se renderiza con `isoDateLocal` para respetar el día
 * local.
  *
 * Ciclo 36 TDD — Sprint 6.
 */
describe('AlbumCardComponent', () => {
  function buildAlbum(date: string): Album {
    return {
      id: 'a1',
      title: 'Álbum prueba',
      description: '',
      date,
      coverPhoto: '',
      photos: [],
      program: '',
      subjects: [],
      eventType: '',
      author: '',
      publisher: '',
      populationType: '',
      imageContext: '',
      photoCount: 0,
    };
  }

  beforeAll(() => registerLocaleData(localeEsGT));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlbumCardComponent],
      providers: [provideNoopAnimations(), { provide: LOCALE_ID, useValue: 'es-GT' }],
    }).compileComponents();
  });

  /** Verifica que `album.date` se renderice con el día local del ISO. */
  it('should render album.date preserving the local day for a full ISO date', () => {
    const fixture = TestBed.createComponent(AlbumCardComponent);
    fixture.componentRef.setInput('album', buildAlbum('2026-05-04'));
    fixture.detectChanges();

    const text = (fixture.nativeElement.textContent ?? '') as string;
    expect(text).toContain('04/05/2026');
    expect(text).not.toContain('03/05/2026');
  });
});
