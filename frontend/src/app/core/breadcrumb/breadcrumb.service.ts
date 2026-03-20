import { Injectable, signal } from '@angular/core';
import { MenuItem } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private _trail = signal<MenuItem[]>([]);
  readonly trail = this._trail.asReadonly();

  setTrail(items: MenuItem[]): void {
    this._trail.set(items);
  }

  clear(): void {
    this._trail.set([]);
  }
}
