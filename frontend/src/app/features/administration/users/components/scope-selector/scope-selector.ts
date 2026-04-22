import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  effect,
  computed,
  OnDestroy,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { map, switchMap, takeUntil } from 'rxjs/operators';
import { Select } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { FloatLabelModule } from 'primeng/floatlabel';

import { UserRole } from '../../models/user-view.model';
import { DSpaceApiService } from '../../../../../core/api/dspace-api.service';

/**
 * Subcomponente para elegir el "scope" de un usuario administrativo:
 *  - subdivisión (community) cuando el rol no es superadmin
 *  - colecciones puntuales (al menos una) cuando el rol es personal_delegado
 *
 * Vive aparte para que UserDialog y ChangeRoleDialog compartan la misma
 * lógica y la misma carga de communities/collections, en vez de
 * duplicar selects, validators y refetches en cada uno.
 *
 * Emite `scopeChange` con los valores actuales y un flag `valid`. El
 * parent decide cuándo habilitar el botón submit sin tener que mirar
 * dentro del form interno.
 */
@Component({
  selector: 'app-scope-selector',
  standalone: true,
  imports: [ReactiveFormsModule, Select, MultiSelectModule, FloatLabelModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scope-selector.html',
  styles: [
    `
      :host {
        display: block;
      }

      .form-field {
        margin-bottom: 1.5rem;
      }

      :host ::ng-deep .p-float-label {
        margin-top: 1.5rem;
      }
    `,
  ],
})
export class ScopeSelector implements OnDestroy {
  private fb = inject(FormBuilder);
  private dspaceApi = inject(DSpaceApiService);
  private destroy$ = new Subject<void>();

  role = input.required<UserRole>();
  disabledSubdivision = input<boolean>(false);
  initialSubdivisionUuid = input<string | null>(null);
  initialCollectionUuids = input<string[]>([]);

  scopeChange = output<{
    subdivisionCommunityUuid: string | null;
    collectionUuids: string[];
    valid: boolean;
  }>();

  form = this.fb.group({
    subdivisionCommunityUuid: [null as string | null, Validators.required],
    collectionUuids: [[] as string[]],
  });

  /**
   * Lista plana de subdirecciones (communities de nivel superior). Se
   * pide una sola vez y se cachea con toSignal: como toSignal se
   * suscribe ahí mismo, no hay que pedir el listado cada vez que se
   * abre el dialog.
   */
  private communities = toSignal(
    this.dspaceApi.getCommunities().pipe(map((response) => response._embedded['communities'])),
    { initialValue: [] },
  );

  subdivisionOptions = computed(() =>
    this.communities().map((community) => ({ label: community.name, value: community.uuid })),
  );

  /**
   * Subject con la subdivisión seleccionada actual. BehaviorSubject para
   * sembrar el initial null sin esperar al primer valueChanges. Cada
   * push dispara el switchMap a getCollections.
   */
  private currentSubdivision$ = new BehaviorSubject<string | null>(null);

  collectionOptions = toSignal(
    this.currentSubdivision$.pipe(
      switchMap((uuid) =>
        uuid
          ? this.dspaceApi.getCollections(uuid).pipe(
              map((response) =>
                (response._embedded?.['collections'] ?? []).map((coll) => ({
                  label: coll.name,
                  value: coll.uuid,
                })),
              ),
            )
          : of([] as { label: string; value: string }[]),
      ),
    ),
    { initialValue: [] as { label: string; value: string }[] },
  );

  showCollections = computed(() => this.role() === 'personal_delegado');

  constructor() {
    /**
     * Reconfigura validators de collectionUuids según el rol. Cuando el
     * rol deja de ser personal_delegado se limpia la selección para que
     * el form no quede con valores que ya no aplican.
     */
    effect(() => {
      const role = this.role();
      const collectionsControl = this.form.get('collectionUuids')!;
      if (role === 'personal_delegado') {
        collectionsControl.setValidators([Validators.required, this.minOneCollection]);
      } else {
        collectionsControl.clearValidators();
        collectionsControl.setValue([], { emitEvent: false });
      }
      collectionsControl.updateValueAndValidity({ emitEvent: false });
      this.emitScope();
    });

    /**
     * Sincroniza los initial values pasados por el parent con el form.
     * Solo aplica al primer render o cuando el parent cambia el target,
     * no en cada interacción del usuario.
     */
    effect(() => {
      const initSub = this.initialSubdivisionUuid();
      const initCols = this.initialCollectionUuids();
      this.form.patchValue(
        { subdivisionCommunityUuid: initSub, collectionUuids: initCols },
        { emitEvent: false },
      );
      this.currentSubdivision$.next(initSub);
      this.emitScope();
    });

    /**
     * El caller admin_subdireccion ya tiene su community fija, así que
     * el select queda bloqueado y se usa solo para mostrar el valor.
     */
    effect(() => {
      const sub = this.form.get('subdivisionCommunityUuid')!;
      if (this.disabledSubdivision()) {
        sub.disable({ emitEvent: false });
      } else {
        sub.enable({ emitEvent: false });
      }
    });

    /**
     * Cuando el usuario cambia de subdivisión se limpia la selección de
     * colecciones (las anteriores eran de otra community y dejarían el
     * form inconsistente) y se dispara el refetch.
     */
    this.form
      .get('subdivisionCommunityUuid')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((uuid) => {
        this.form.get('collectionUuids')!.setValue([], { emitEvent: false });
        this.currentSubdivision$.next(uuid ?? null);
        this.emitScope();
      });

    this.form
      .get('collectionUuids')!
      .valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.emitScope());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private emitScope() {
    const raw = this.form.getRawValue();
    this.scopeChange.emit({
      subdivisionCommunityUuid: raw.subdivisionCommunityUuid ?? null,
      collectionUuids: raw.collectionUuids ?? [],
      valid: this.form.valid,
    });
  }

  /**
   * Validator extra para que personal_delegado tenga al menos una
   * colección asignada. Sin esto el `[]` por defecto pasa el `required`
   * de Angular porque no es null.
   */
  private minOneCollection(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string[] | null;
    return value && value.length >= 1 ? null : { required: true };
  }
}
