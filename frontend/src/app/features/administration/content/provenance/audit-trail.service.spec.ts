import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { AuditTrailService } from './audit-trail.service';
import { ItemApiService } from '../../../../core/api/item-api.service';
import { CommunityApiService } from '../../../../core/api/community-api.service';
import { CollectionApiService } from '../../../../core/api/collection-api.service';
import { AuthCallerService } from '../../shared/services/auth-caller.service';
import { Actor } from '../specifications/scope-context.model';
import { JsonPatchEntry } from '../../../../core/api/json-patch.util';

/**
 * Tests de `AuditTrailService`.
 *
 * Service centralizado del Bloque 3 que appendea una entrada formateada al
 * `dc.description.provenance` de items, communities y collections vía PATCH
 * JSON `op: add` sobre `/metadata/dc.description.provenance/-`. Resuelve el
 * actor desde `AuthCallerService.currentActor$` y dispatcha al wrapper HTTP
 * correspondiente; el control de error es responsabilidad del consumidor.
 *
 * Ciclo 19 TDD — Sprint 8.
 */
describe('AuditTrailService', () => {
  let service: AuditTrailService;
  let itemUpdateFn: Mock;
  let communityUpdateFn: Mock;
  let collectionUpdateFn: Mock;
  let actor$: Observable<Actor | null>;

  const sampleActor: Actor = {
    firstName: 'Mynor',
    lastName: 'Ramos',
    email: 'mynor@mineduc.gob.gt',
  };

  beforeEach(() => {
    itemUpdateFn = vi.fn().mockReturnValue(of({ uuid: 'i' }));
    communityUpdateFn = vi.fn().mockReturnValue(of({ uuid: 'c' }));
    collectionUpdateFn = vi.fn().mockReturnValue(of({ uuid: 'col' }));
    actor$ = of(sampleActor);

    TestBed.configureTestingModule({
      providers: [
        AuditTrailService,
        { provide: ItemApiService, useValue: { updateMetadata: itemUpdateFn } },
        { provide: CommunityApiService, useValue: { updateMetadata: communityUpdateFn } },
        { provide: CollectionApiService, useValue: { updateMetadata: collectionUpdateFn } },
        { provide: AuthCallerService, useFactory: () => ({ currentActor$: actor$ }) },
      ],
    });
    service = TestBed.inject(AuditTrailService);
  });

  /** Verifica que `appendProvenance$('item', uuid, action)` dispatchee al wrapper de items con `op: add` al path canónico. */
  it('should dispatch to ItemApiService.updateMetadata with op:add and the canonical provenance path', async () => {
    await new Promise<void>((resolve, reject) => {
      service.appendProvenance$('item', 'item-1', 'Edited').subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(itemUpdateFn).toHaveBeenCalledTimes(1);
    const [uuid, patch] = itemUpdateFn.mock.calls[0] as [string, JsonPatchEntry[]];
    expect(uuid).toBe('item-1');
    expect(patch).toHaveLength(1);
    expect(patch[0]).toMatchObject({ op: 'add', path: '/metadata/dc.description.provenance/-' });
  });

  /** Verifica que el dispatch a community use `CommunityApiService.updateMetadata` con el mismo shape del patch. */
  it('should dispatch to CommunityApiService.updateMetadata for dsoType=community', async () => {
    await new Promise<void>((resolve, reject) => {
      service.appendProvenance$('community', 'com-1', 'Created').subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(communityUpdateFn).toHaveBeenCalledTimes(1);
    expect(itemUpdateFn).not.toHaveBeenCalled();
    expect(collectionUpdateFn).not.toHaveBeenCalled();
  });

  /** Verifica que el dispatch a collection use `CollectionApiService.updateMetadata`. */
  it('should dispatch to CollectionApiService.updateMetadata for dsoType=collection', async () => {
    await new Promise<void>((resolve, reject) => {
      service.appendProvenance$('collection', 'col-1', 'Edited').subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    expect(collectionUpdateFn).toHaveBeenCalledTimes(1);
    expect(itemUpdateFn).not.toHaveBeenCalled();
    expect(communityUpdateFn).not.toHaveBeenCalled();
  });

  /** Verifica que el `value` del patch siga el formato `<action> by <firstName> <lastName> (<email>) on <ISO>`. */
  it('should format the patch value as "<action> by <firstName> <lastName> (<email>) on <ISO>"', async () => {
    await new Promise<void>((resolve, reject) => {
      service.appendProvenance$('item', 'item-1', 'Withdrawn').subscribe({
        next: () => resolve(),
        error: reject,
      });
    });

    const [, patch] = itemUpdateFn.mock.calls[0] as [string, JsonPatchEntry[]];
    const value = (patch[0] as { value: string }).value;
    expect(value).toMatch(
      /^Withdrawn by Mynor Ramos \(mynor@mineduc\.gob\.gt\) on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  /** Verifica que cuando `currentActor$` emite null el observable falle y no dispare ningún PATCH. */
  it('should fail and not dispatch any PATCH when currentActor$ emits null', async () => {
    actor$ = of(null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuditTrailService,
        { provide: ItemApiService, useValue: { updateMetadata: itemUpdateFn } },
        { provide: CommunityApiService, useValue: { updateMetadata: communityUpdateFn } },
        { provide: CollectionApiService, useValue: { updateMetadata: collectionUpdateFn } },
        { provide: AuthCallerService, useFactory: () => ({ currentActor$: actor$ }) },
      ],
    });
    service = TestBed.inject(AuditTrailService);

    const error = await new Promise<Error>((resolve) => {
      service.appendProvenance$('item', 'item-1', 'Edited').subscribe({
        next: () => resolve(new Error('expected error but got next')),
        error: (e) => resolve(e),
      });
    });

    expect(error.message).toMatch(/no authenticated actor/);
    expect(itemUpdateFn).not.toHaveBeenCalled();
  });

  /** Verifica que el error del wrapper HTTP se propague sin swallow. */
  it('should propagate the HTTP error from the wrapper without swallowing', async () => {
    itemUpdateFn.mockReturnValue(throwError(() => new Error('500 Server Error')));

    const error = await new Promise<Error>((resolve) => {
      service.appendProvenance$('item', 'item-1', 'Edited').subscribe({
        next: () => resolve(new Error('expected error but got next')),
        error: (e) => resolve(e),
      });
    });

    expect(error.message).toBe('500 Server Error');
  });

  /** Verifica que el observable emita `undefined` y complete cuando el PATCH resuelve OK. */
  it('should emit undefined and complete when the PATCH resolves successfully', async () => {
    let emittedValue: unknown = 'not-emitted';
    let completed = false;
    await new Promise<void>((resolve, reject) => {
      service.appendProvenance$('item', 'item-1', 'Edited').subscribe({
        next: (v) => {
          emittedValue = v;
        },
        complete: () => {
          completed = true;
          resolve();
        },
        error: reject,
      });
    });

    expect(emittedValue).toBeUndefined();
    expect(completed).toBe(true);
  });
});
