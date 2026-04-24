import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableLazyLoadEvent } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api'; // MessageService se consume desde la raíz de la app

import { UserTable } from './components/user-table/user-table';
import { UserDialog } from './components/user-dialog/user-dialog';
import { ChangeRoleDialog } from './components/change-role-dialog/change-role-dialog';
import { EditUserDialog } from './components/edit-user-dialog/edit-user-dialog';
import {
  UserManagementService,
  CreateUserInput,
  ChangeUserRoleInput,
  UpdateUserInput,
} from './services/user-management.service';
import { BusinessRuleError, BusinessRuleErrorCode } from './services/business-rule-error';
import { UserView } from './models/user-view.model';
import { Paginated } from '../../../core/api/models/hal.model';
import { Group } from '../../../core/api/models/group.model';
import { extractErrorDetail } from '../../../core/error/extract-error-detail';

/** Scope de búsqueda del listado: alineado al patrón `EPeopleRegistryComponent`. */
export type UserSearchScope = 'metadata' | 'email';

interface TablePageState {
  readonly page: number;
  readonly size: number;
}

const INITIAL_PAGE_STATE: TablePageState = { page: 0, size: 10 };
const SEARCH_DEBOUNCE_MS = 300;

function emptyPaginatedView(size: number): Paginated<UserView> {
  return { items: [], totalElements: 0, totalPages: 0, size, page: 0 };
}

/** Fallback del detail cuando el error no trae ningun texto util. */
const UNEXPECTED_ERROR_FALLBACK = 'Ocurrió un error al procesar la solicitud. Intenta más tarde.';

/**
 * Contenedor de gestión de usuarios. Consume los Observable del facade,
 * delega las mutaciones y traduce BusinessRuleError a toasts en es-GT.
 */
@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    InputTextModule,
    Select,
    ToastModule,
    UserTable,
    UserDialog,
    ChangeRoleDialog,
    EditUserDialog,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.html',
})
export class Users {
  private userService = inject(UserManagementService);
  private messageService = inject(MessageService);
  private destroyRef = inject(DestroyRef);

  showCreateDialog = signal(false);
  showChangeRoleDialog = signal(false);
  changeRoleTarget = signal<UserView | null>(null);
  showEditDialog = signal(false);
  editTarget = signal<UserView | null>(null);

  /** Texto crudo del input de búsqueda; viaja a `queryDebounced` tras 300ms. */
  queryRaw = signal<string>('');

  /** Scope bound al p-select: `metadata` busca parcial en campos, `email` exacto. */
  scope = signal<UserSearchScope>('metadata');

  /** Estado paginado del p-table. Se actualiza desde `onLazyLoad`. */
  private tableState = signal<TablePageState>(INITIAL_PAGE_STATE);

  /** Opciones del dropdown de scope. Array mutable para que PrimeNG p-select lo acepte. */
  readonly scopeOptions: { label: string; value: UserSearchScope }[] = [
    { label: 'Nombre o apellido', value: 'metadata' },
    { label: 'Correo', value: 'email' },
  ];

  /** Versión debounced del queryRaw para evitar una request por cada tecla. */
  private queryDebounced = toSignal(
    toObservable(this.queryRaw).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  /**
   * Dispara el refetch del listado tras cada mutación. `BehaviorSubject`
   * emite al suscribirse, así la carga inicial va sin `startWith`.
   */
  private refresh$ = new BehaviorSubject<void>(undefined);

  private visibleUsersPaginated = toSignal(
    combineLatest([
      toObservable(this.queryDebounced),
      toObservable(this.scope),
      toObservable(this.tableState),
      this.refresh$,
    ]).pipe(
      switchMap(([query, scope, state]) =>
        this.userService.searchUsers$({ scope, query, page: state.page, size: state.size }),
      ),
    ),
    { initialValue: emptyPaginatedView(INITIAL_PAGE_STATE.size) },
  );

  visibleUsers = computed(() => this.visibleUsersPaginated().items);
  totalRecords = computed(() => this.visibleUsersPaginated().totalElements);
  pageSize = computed(() => this.tableState().size);

  currentUser = toSignal(this.userService.currentUserView$, { initialValue: null });

  /**
   * Grupos asignables del portal. Fuente única para los diálogos de alta y
   * cambio de rol: una request al montar el contenedor, reutilizada en cada
   * apertura vía input.
   */
  assignableGroups = toSignal(this.userService.getAssignableGroups$(), {
    initialValue: [] as Group[],
  });

  constructor() {
    /**
     * Al cambiar el texto debounced o el scope, reiniciamos a página 0 para
     * que el usuario no se quede viendo una página vacía cuando la búsqueda
     * nueva tiene menos resultados.
     */
    effect(() => {
      this.queryDebounced();
      this.scope();
      this.tableState.update((state) => (state.page === 0 ? state : { ...state, page: 0 }));
    });
  }

  /** Bind desde el input de búsqueda (`ngModelChange`). */
  onSearchInput(value: string) {
    this.queryRaw.set(value);
  }

  /** Bind desde el p-select de scope. */
  onScopeChange(value: UserSearchScope) {
    this.scope.set(value);
  }

  /**
   * Bind a `(onLazyLoad)` del p-table. PrimeNG emite `first` (offset) y
   * `rows` (tamaño de página, potencialmente null en el primer evento).
   * Los traducimos a `{page, size}` y disparamos el refetch vía la
   * suscripción reactiva del container. El `set` solo se ejecuta si cambió
   * page o size: PrimeNG emite un `onLazyLoad` al montar la tabla con los
   * valores iniciales, y sin este guard el `combineLatest` del pipe
   * re-emitiría por referencia y cancelaría la request en curso.
   */
  onLazyLoad(event: TableLazyLoadEvent) {
    const rows = event.rows ?? INITIAL_PAGE_STATE.size;
    const first = event.first ?? 0;
    const page = rows > 0 ? Math.floor(first / rows) : 0;
    const current = this.tableState();
    if (current.page !== page || current.size !== rows) {
      this.tableState.set({ page, size: rows });
    }
  }

  onCreateUserRequested() {
    this.showCreateDialog.set(true);
  }

  onDialogClosed() {
    this.showCreateDialog.set(false);
  }

  onDeactivateRequested(user: UserView) {
    this.userService
      .deactivateUser$(user.uuid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refresh$.next();
          this.messageService.add({
            severity: 'success',
            summary: 'Usuario desactivado',
            detail: `${user.firstName} ${user.lastName} ha sido desactivado`,
            life: 3000,
          });
        },
        error: (err) => this.errorToToast(err),
      });
  }

  onReactivateRequested(user: UserView) {
    this.userService
      .reactivateUser$(user.uuid)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refresh$.next();
          this.messageService.add({
            severity: 'success',
            summary: 'Usuario reactivado',
            detail: `${user.firstName} ${user.lastName} ha sido reactivado`,
            life: 3000,
          });
        },
        error: (err) => this.errorToToast(err),
      });
  }

  onResetPasswordRequested(user: UserView) {
    this.userService
      .resetPassword$({ uuid: user.uuid, email: user.email })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Contraseña restablecida',
            detail: 'Se ha enviado un correo con las instrucciones para restablecer la contraseña',
            life: 3000,
          });
        },
        error: (err) => this.errorToToast(err),
      });
  }

  onModifyRoleRequested(user: UserView) {
    this.changeRoleTarget.set(user);
    this.showChangeRoleDialog.set(true);
  }

  onChangeRoleDialogClosed() {
    this.showChangeRoleDialog.set(false);
    this.changeRoleTarget.set(null);
  }

  onChangeRoleSubmitted(input: ChangeUserRoleInput) {
    this.userService
      .changeUserRole$(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refresh$.next();
          this.messageService.add({
            severity: 'success',
            summary: 'Rol actualizado',
            detail: 'El rol del usuario fue actualizado correctamente',
            life: 3000,
          });
          this.showChangeRoleDialog.set(false);
          this.changeRoleTarget.set(null);
        },
        error: (err) => this.errorToToast(err),
      });
  }

  onCreateSubmitted(input: CreateUserInput) {
    this.userService
      .createUser$(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refresh$.next();
          this.messageService.add({
            severity: 'success',
            summary: 'Usuario creado',
            detail: `${input.firstName} ${input.lastName} ha sido creado`,
            life: 3000,
          });
          this.showCreateDialog.set(false);
        },
        error: (err) => this.errorToToast(err),
      });
  }

  onEditRequested(user: UserView) {
    this.editTarget.set(user);
    this.showEditDialog.set(true);
  }

  onEditDialogClosed() {
    this.showEditDialog.set(false);
    this.editTarget.set(null);
  }

  onEditSubmitted(input: UpdateUserInput) {
    this.userService
      .updateUser$(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.refresh$.next();
          this.messageService.add({
            severity: 'success',
            summary: 'Usuario actualizado',
            detail: 'Los datos del usuario se guardaron correctamente.',
            life: 3000,
          });
          this.showEditDialog.set(false);
          this.editTarget.set(null);
        },
        error: (err) => this.errorToToast(err),
      });
  }

  /**
   * Traduce el error del facade a un toast. Las reglas que bloquean al caller
   * actuando sobre sí mismo o sobre el último superadmin (RN-11, RN-12, RN-31)
   * salen como warn porque el UI ya debería prevenirlas. El resto usa
   * extractErrorDetail para revelar el mensaje real antes del copy genérico.
   */
  private errorToToast(err: unknown) {
    if (err instanceof BusinessRuleError) {
      const isWarning =
        err.code === 'LAST_SUPERADMIN' ||
        err.code === 'SELF_DEACTIVATE' ||
        err.code === 'SELF_RESET';
      this.messageService.add({
        severity: isWarning ? 'warn' : 'error',
        summary: this.summaryForCode(err.code),
        detail: err.message,
        life: 5000,
      });
      return;
    }
    this.messageService.add({
      severity: 'error',
      summary: 'Error inesperado',
      detail: extractErrorDetail(err as { error?: unknown; message?: unknown }, UNEXPECTED_ERROR_FALLBACK),
      life: 5000,
    });
  }

  private summaryForCode(code: BusinessRuleErrorCode): string {
    const labels: Record<BusinessRuleErrorCode, string> = {
      LAST_SUPERADMIN: 'Operación no permitida',
      SELF_DEACTIVATE: 'Operación no permitida',
      SELF_RESET: 'Operación no permitida',
      DUPLICATE_EMAIL: 'Correo duplicado',
      EMAIL_INVALID: 'Correo inválido',
      SUBDIVISION_REQUIRED: 'Subdirección requerida',
      INSUFFICIENT_PRIVILEGES: 'Permisos insuficientes',
      OUT_OF_SCOPE: 'Fuera de tu subdirección',
      NOT_FOUND: 'No encontrado',
    };
    return labels[code];
  }
}
