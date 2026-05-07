import { findCallerSub } from './scope-resolver';
import { Community } from '../../../../core/api/models/community.model';

/**
 * Tests del resolver de scope. Función pura compartida por las pantallas
 * del admin que derivan la sub del caller (Programas, Cargar contenido,
 * edición de items, etc.). Los casos cubren los tres roles del portal y
 * los edge cases de caller null y sufijo sin match.
 */
describe('findCallerSub', () => {
  function buildSub(uuid: string, sufijo: string): Community {
    return {
      uuid,
      name: `Sub ${sufijo}`,
      handle: `123/${uuid}`,
      archivedItemsCount: 0,
      type: 'community',
      metadata: {
        'digeex.sufijo': [
          { value: sufijo, language: null, authority: null, confidence: -1, place: 0 },
        ],
      },
    };
  }

  const subs: Community[] = [
    buildSub('uuid-basica', 'ED_BASICA'),
    buildSub('uuid-trabajo', 'ED_TRABAJO'),
    buildSub('uuid-investigacion', 'ED_INVESTIGACION'),
  ];

  it('should return null for a superadmin caller (not scoped)', () => {
    const result = findCallerSub(subs, { role: 'superadmin', sufijo: null });
    expect(result).toBeNull();
  });

  it('should return the matching sub for an admin_subdireccion with valid sufijo', () => {
    const result = findCallerSub(subs, {
      role: 'admin_subdireccion',
      sufijo: 'ED_BASICA',
    });
    expect(result?.uuid).toBe('uuid-basica');
  });

  it('should return the matching sub for a personal_delegado with valid sufijo', () => {
    const result = findCallerSub(subs, {
      role: 'personal_delegado',
      sufijo: 'ED_TRABAJO',
    });
    expect(result?.uuid).toBe('uuid-trabajo');
  });

  it('should return null when the caller sufijo does not match any sub', () => {
    const result = findCallerSub(subs, {
      role: 'admin_subdireccion',
      sufijo: 'ED_INEXISTENTE',
    });
    expect(result).toBeNull();
  });

  it('should return null when caller is null', () => {
    const result = findCallerSub(subs, null);
    expect(result).toBeNull();
  });
});
