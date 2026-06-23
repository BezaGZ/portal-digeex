import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Mock, vi } from 'vitest';
import { EMPTY, of, throwError } from 'rxjs';

import { DigeexRoot } from './digeex-root';
import { CommunityApiService } from '../../../core/api/community-api.service';
import { CommunityFacade } from '../content/services/community-facade';

/**
 * Tests de DigeexRoot.
 *
 * Pantalla de inicialización del repositorio (solo superadmin). Detecta la
 * comunidad raíz vía searchTop: si no existe muestra la confirmación de solo
 * lectura para crearla (datos fijos DIGEEX, sin inputs); si existe muestra el
 * estado inicializado. Crear delega en CommunityFacade.createRoot$ y navega a
 * Subdirecciones. Reemplaza el bloque de raíz de setup-dspace.sh.
 */
describe('DigeexRoot', () => {
  let searchTopFn: Mock;
  let createRootFn: Mock;
  let navigateFn: Mock;
  let messageAddFn: Mock;

  function topResponse(count: number) {
    return of({
      _embedded: { communities: count > 0 ? [{ uuid: 'root-uuid' }] : [] },
      _links: {},
      page: { size: 20, totalElements: count, totalPages: 1, number: 0 },
    });
  }

  function configure(rootCount: number) {
    searchTopFn = vi.fn().mockReturnValue(topResponse(rootCount));
    createRootFn = vi.fn().mockReturnValue(of({ uuid: 'root-uuid', name: 'DIGEEX' }));
    navigateFn = vi.fn();
    messageAddFn = vi.fn();
    TestBed.configureTestingModule({
      imports: [DigeexRoot],
      providers: [
        provideNoopAnimations(),
        { provide: CommunityApiService, useValue: { searchTop: searchTopFn } },
        { provide: CommunityFacade, useValue: { createRoot$: createRootFn } },
        { provide: Router, useValue: { navigate: navigateFn } },
        { provide: MessageService, useValue: { add: messageAddFn, messageObserver: EMPTY, clearObserver: EMPTY } },
      ],
    });
  }

  it('should show the create state when no root community exists', () => {
    configure(0);
    const fixture = TestBed.createComponent(DigeexRoot);
    fixture.detectChanges();

    expect(fixture.componentInstance.rootExists()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="state-create"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="root-exists"]')).toBeNull();
  });

  it('should show the already-initialized state when the root exists', () => {
    configure(1);
    const fixture = TestBed.createComponent(DigeexRoot);
    fixture.detectChanges();

    expect(fixture.componentInstance.rootExists()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="root-exists"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="state-create"]')).toBeNull();
  });

  it('should create the root with the fixed DIGEEX body and navigate to subdirecciones on success', () => {
    configure(0);
    const fixture = TestBed.createComponent(DigeexRoot);
    fixture.detectChanges();

    fixture.componentInstance.onCreate();

    expect(createRootFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'DIGEEX',
        type: 'community',
        metadata: expect.objectContaining({
          'dc.title': expect.arrayContaining([
            expect.objectContaining({ value: 'Dirección General de Educación Extraescolar' }),
          ]),
          'dc.title.alternative': expect.arrayContaining([
            expect.objectContaining({ value: 'DIGEEX' }),
          ]),
        }),
      }),
    );
    expect(navigateFn).toHaveBeenCalledWith(['/administrador/subdirecciones']);
    expect(messageAddFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('should show an error toast and stay on the create state when creation fails', () => {
    configure(0);
    createRootFn.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = TestBed.createComponent(DigeexRoot);
    fixture.detectChanges();

    fixture.componentInstance.onCreate();

    expect(messageAddFn).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(navigateFn).not.toHaveBeenCalled();
    expect(fixture.componentInstance.creating()).toBe(false);
  });
});
