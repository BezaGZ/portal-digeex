import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { Home } from './home';
import { CollectionCacheService } from '../../core/api/collection-cache.service';

/**
 * Tests de `Home`.
 *
 * Componente del listado público raíz (`/`). Renderiza las colecciones
 * marcadas con `digeex.navLocation=menu-principal` como cards con sigla
 * (`dc.title.alternative`) arriba y título largo (`dc.title`) abajo. Lee
 * la metadata vía `CollectionCacheService.getByMenuType`.
 *
 * Sprint 6. Ajustado en Ciclo 2 (Sprint 7) y Ciclo 5 (Sprint 8).
 */
describe('Home', () => {
  let collectionCacheStub: { getByMenuType: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    collectionCacheStub = {
      getByMenuType: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: () => {}, navigateByUrl: () => {} } },
        { provide: CollectionCacheService, useValue: collectionCacheStub },
      ],
    }).compileComponents();
  });

  /** Verifica que el componente se instancie correctamente. */
  it('should create', () => {
    const fixture = TestBed.createComponent(Home);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  /**
   * Verifica que `children[0].name` lea la sigla desde `dc.title.alternative` de la colección.
   * Si la lectura cayera al fallback `collection.name`, la card mostraría el título largo
   * dos veces; el spec ancla la fuente correcta para evitar esa regresión.
   */
  it('should read the program acronym from dc.title.alternative not from dc.subject', () => {
    const mockCollection = {
      uuid: 'uuid-peac',
      name: 'Programa de Educación de Adultos por Correspondencia',
      metadata: {
        'dc.title.alternative': [{ value: 'PEAC' }],
        'dc.title': [{ value: 'Programa de Educación de Adultos por Correspondencia' }],
      },
    };
    collectionCacheStub.getByMenuType.mockReturnValue(of([mockCollection]));

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.children()[0].name).toBe('PEAC');
    expect(component.children()[0].description).toBe('Programa de Educación de Adultos por Correspondencia');
  });

  /**
   * Verifica que cuando la collection trae logo embebido, el view model exponga la URL relativa.
   * Sin esto el template no podría renderizar la portada y dejaría siempre el placeholder.
   */
  it('should expose logoUrl in the view model when the embedded logo is present', () => {
    const mockCollection = {
      uuid: 'uuid-eva',
      name: 'EVA',
      metadata: { 'dc.title.alternative': [{ value: 'EVA' }] },
      _embedded: { logo: { uuid: 'logo-bs-eva', type: 'bitstream' } },
    };
    collectionCacheStub.getByMenuType.mockReturnValue(of([mockCollection]));

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    expect(fixture.componentInstance.children()[0].logoUrl)
      .toBe('/server/api/core/bitstreams/logo-bs-eva/content');
  });

  /** Verifica que sin logo embebido el view model exponga logoUrl null para mostrar el placeholder. */
  it('should expose logoUrl null when the collection has no embedded logo', () => {
    const mockCollection = {
      uuid: 'uuid-x',
      name: 'X',
      metadata: { 'dc.title.alternative': [{ value: 'X' }] },
      _embedded: { logo: null },
    };
    collectionCacheStub.getByMenuType.mockReturnValue(of([mockCollection]));

    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    expect(fixture.componentInstance.children()[0].logoUrl).toBeNull();
  });
});
