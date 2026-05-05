import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ItemApiService } from './item-api.service';
import { JsonPatchEntry } from './json-patch.util';
import itemPatchFixture from './test-fixtures/item-patch-metadata-response.json';

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
      let received: typeof itemPatchFixture | undefined;

      service.updateMetadata('item-uuid', patch).subscribe((item) => (received = item));

      const req = httpMock.expectOne('/server/api/core/items/item-uuid');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(patch);
      req.flush(itemPatchFixture);

      expect(received?.uuid).toBe(itemPatchFixture.uuid);
    });
  });
});
