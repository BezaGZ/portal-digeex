import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { AuthCardShell } from './auth-card-shell';

/**
 * Tests de `AuthCardShell`.
 *
 * Shell compartido por las tres pantallas auth. Cubre la presencia del
 * título obligatorio, los defaults del subtítulo y footer institucional,
 * y la proyección del contenido a través de `<ng-content>`.
 *
 * Ciclo 2 TDD — Sprint 8.
 */
describe('AuthCardShell', () => {
  @Component({
    standalone: true,
    imports: [AuthCardShell],
    template: `
      <app-auth-card-shell [title]="title()">
        <div data-testid="projected">Contenido del consumidor</div>
      </app-auth-card-shell>
    `,
  })
  class Host {
    title = () => 'Inicio de Sesión';
  }

  @Component({
    standalone: true,
    imports: [AuthCardShell],
    template: `
      <app-auth-card-shell
        [title]="'Restablecer contraseña'"
        [subtitle]="'Subtítulo custom'"
        [footer]="'Footer custom'"
      ></app-auth-card-shell>
    `,
  })
  class HostWithOverrides {}

  /** Verifica que el título obligatorio se proyecte al `.page-title` del shell. */
  it('should render the required title in the page-title heading', () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('h1.page-title');
    expect(h1.textContent).toContain('Inicio de Sesión');
  });

  /**
   * Verifica que el shell muestre el subtítulo y footer por defecto cuando el
   * consumidor no los provee, manteniendo la identidad institucional uniforme.
   */
  it('should fall back to the institutional subtitle and footer when not overridden', () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Portal de Gestión del Conocimiento DIGEEX');
    expect(text).toContain('Ministerio de Educación — Guatemala');
  });

  /** Verifica que `subtitle` y `footer` aceptan override desde el consumidor. */
  it('should accept overrides for subtitle and footer', () => {
    TestBed.configureTestingModule({
      imports: [HostWithOverrides],
      providers: [provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(HostWithOverrides);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Subtítulo custom');
    expect(text).toContain('Footer custom');
  });

  /** Verifica que el contenido del consumidor se proyecte a través de ng-content. */
  it('should project consumer content via ng-content', () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const projected = fixture.nativeElement.querySelector('[data-testid="projected"]');
    expect(projected?.textContent).toContain('Contenido del consumidor');
  });
});
