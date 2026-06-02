import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ItemApiService } from './item-api.service';
import { JsonPatchEntry } from './json-patch.util';
import { Item } from './models/item.model';
import itemPatchFixture from './test-fixtures/item-patch-metadata-response.json';
import itemWithdrawnTrueFixture from './test-fixtures/item-patch-withdrawn-true-response.json';

/**
 * Tests de ItemApiService.
 *
 * Wrapper del recurso /api/core/items de DSpace 9.x. En este ciclo se
 * agrega solo `updateMetadata`, que el SubmissionFacade usa para hacer
 * PATCH /discoverable=false cuando la submission queda marcada como
 * privada. Los métodos de lectura siguen viviendo en DSpaceApiService;
 * la migración + withdraw + restore se hacen en C15.
 *
 * Ciclo 14 TDD — Sprint 6
 */
describe('ItemApiService', () => {
  let service: ItemApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ItemApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ItemApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('updateMetadata()', () => {
    it('should PATCH /api/core/items/{uuid} with the JsonPatchEntry array and return the updated item', () => {
      const patch: JsonPatchEntry[] = [
        { op: 'replace', path: '/discoverable', value: false },
      ];
      let received: Item | undefined;

      service.updateMetadata('item-uuid', patch).subscribe((item) => (received = item));

      const req = httpMock.expectOne('/server/api/core/items/item-uuid');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(patch);
      req.flush(itemPatchFixture);

      expect(received?.uuid).toBe(itemPatchFixture.uuid);
    });
  });

  describe('getOne()', () => {
    it('should GET /api/core/items/{uuid} and return the item', () => {
      let received: typeof itemPatchFixture | undefined;

      service.getOne('item-uuid').subscribe((item) => (received = item as typeof itemPatchFixture));

      const req = httpMock.expectOne('/server/api/core/items/item-uuid');
      expect(req.request.method).toBe('GET');
      req.flush(itemPatchFixture);

      expect(received?.uuid).toBe(itemPatchFixture.uuid);
    });
  });

  describe('withdraw()', () => {
    it('should PATCH /api/core/items/{uuid} with [{op:replace, path:/withdrawn, value:true}] and return the item with withdrawn=true', () => {
      let received: typeof itemWithdrawnTrueFixture | undefined;

      service.withdraw('item-uuid').subscribe(
        (item) => (received = item as typeof itemWithdrawnTrueFixture),
      );

      const req = httpMock.expectOne('/server/api/core/items/item-uuid');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual([
        { op: 'replace', path: '/withdrawn', value: true },
      ]);
      req.flush(itemWithdrawnTrueFixture);

      expect(received?.withdrawn).toBe(true);
    });
  });

  describe('restore()', () => {
    it('should PATCH /api/core/items/{uuid} with [{op:replace, path:/withdrawn, value:false}] and return the item with withdrawn=false', () => {
      const restoredFixture = { ...itemWithdrawnTrueFixture, withdrawn: false };
      let received: typeof restoredFixture | undefined;

      service.restore('item-uuid').subscribe(
        (item) => (received = item as typeof restoredFixture),
      );

      const req = httpMock.expectOne('/server/api/core/items/item-uuid');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual([
        { op: 'replace', path: '/withdrawn', value: false },
      ]);
      req.flush(restoredFixture);

      expect(received?.withdrawn).toBe(false);
    });
  });
});
