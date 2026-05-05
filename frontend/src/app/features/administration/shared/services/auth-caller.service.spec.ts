import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { AuthCallerService } from './auth-caller.service';
import { UserManagementService } from '../../users/services/user-management.service';

/**
 * Tests de AuthCallerService.
 *
 * El servicio proyecta la vista de usuario a la forma minimal que las
 * reglas de scope necesitan (role + sufijo). Verifica que el mapeo conserve
 * el rol y traduzca subdivision → sufijo, y que un usuario sin sesión
 * resuelva en null sin lanzar.
 *
 * Ciclo 12 TDD — Sprint 6
 */
describe('AuthCallerService', () => {
  function setup(view: { uuid: string; role: string; subdivision: string | null } | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthCallerService,
        { provide: UserManagementService, useValue: { currentUserView$: of(view) } },
      ],
    });
    return TestBed.inject(AuthCallerService);
  }

  it('should map UserView to Caller preserving role and translating subdivision to sufijo', async () => {
    const service = setup({ uuid: 'u1', role: 'admin_subdireccion', subdivision: 'ED_BASICA' });
    const caller = await firstValueFrom(service.currentCaller$);
    expect(caller).toEqual({ role: 'admin_subdireccion', sufijo: 'ED_BASICA' });
  });

  it('should map a superadmin without subdivision to a Caller with sufijo null', async () => {
    const service = setup({ uuid: 'u2', role: 'superadmin', subdivision: null });
    const caller = await firstValueFrom(service.currentCaller$);
    expect(caller).toEqual({ role: 'superadmin', sufijo: null });
  });

  it('should emit null when there is no authenticated user view', async () => {
    const service = setup(null);
    const caller = await firstValueFrom(service.currentCaller$);
    expect(caller).toBeNull();
  });
});
