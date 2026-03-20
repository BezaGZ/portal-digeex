import { Injectable, signal } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  date: string;
  coverPhoto: string;
  photos: Photo[];
  // Metadata para filtros
  program: string; // 'PEAC', 'PRONEA', 'CEMUCAF', etc.
  eventType: string; // 'graduacion', 'taller', 'inauguracion', etc.
}

export interface GalleryFilters {
  searchQuery?: string;
  programs?: string[];
  eventTypes?: string[];
}

export interface FilterOption {
  label: string;
  value: string;
  count: number;
}

@Injectable({
  providedIn: 'root',
})
export class GalleryService {
  private albums = signal<Album[]>([]);

  private mockAlbums: Album[] = [
    {
      id: 'graduacion-peac-2025',
      title: 'Graduación PEAC 2025',
      description:
        'Ceremonia de graduación del Programa de Educación Acelerada con Calidad - Promoción 2025',
      date: '2025-06-15',
      coverPhoto: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800',
      program: 'PEAC',
      eventType: 'graduacion',
      photos: Array.from({ length: 50 }, (_, i) => {
        const imageIds = [
          'photo-1523050854058-8df90110c9f1',
          'photo-1541829070764-84a7d30dd3f3',
          'photo-1577896851231-70ef18881754',
          'photo-1627556704302-624e42a6c4e3',
          'photo-1524178232363-1fb2b075b655',
          'photo-1503676260728-1c00da094a0b',
          'photo-1562774053-701939374585',
          'photo-1497366754035-f200968a6e72',
          'photo-1497366216548-37526070297c',
          'photo-1497366811353-6870744d04b2',
          'photo-1552664730-d307ca884978',
          'photo-1542744173-8e7e53415bb0',
          'photo-1531482615713-2afd69097998',
          'photo-1517486808906-6ca8b3f04846',
          'photo-1529390079861-591de354faf5',
          'photo-1509062522246-3755977927d7',
          'photo-1517245386807-bb43f82c33c4',
          'photo-1540317580384-e5d43616b9aa',
          'photo-1559027615-cd4628902d4a',
          'photo-1505373877841-8d25f7d46678',
          'photo-1522202176988-66273c2fd55f',
          'photo-1546410531-bb4caa6b424d',
          'photo-1524995997946-a1c2e315a42f',
          'photo-1503676967307-dd9785d0c8dd',
          'photo-1571260899304-425eee4c7efc',
          'photo-1427504494785-3a9ca7044f45',
          'photo-1488521787991-ed7bbaae773c',
          'photo-1509062522246-3755977927d7',
          'photo-1519452575417-564c1401ecc0',
          'photo-1516397281156-ca07cf9746fc',
          'photo-1509228468518-180dd4864904',
          'photo-1517245386807-bb43f82c33c4',
          'photo-1523240795612-9a054b0db644',
          'photo-1546410531-bb4caa6b424d',
          'photo-1529070538774-1843cb3265df',
          'photo-1517486808906-6ca8b3f04846',
          'photo-1501504905252-473c47e087f8',
          'photo-1519389950473-47ba0277781c',
          'photo-1524178232363-1fb2b075b655',
          'photo-1503676260728-1c00da094a0b',
          'photo-1569144157591-c60f3f82f137',
          'photo-1543269865-cbf427effbad',
          'photo-1546519638-68e109498ffc',
          'photo-1513258496099-48168024aec0',
          'photo-1517245386807-bb43f82c33c4',
          'photo-1509062522246-3755977927d7',
          'photo-1523240795612-9a054b0db644',
          'photo-1541829070764-84a7d30dd3f3',
          'photo-1577896851231-70ef18881754',
          'photo-1606761568499-6d2451b23c66',
        ];
        const imageId = imageIds[i % imageIds.length];
        return {
          id: `${i + 1}`,
          url: `https://images.unsplash.com/${imageId}?w=1200&sig=${i}`,
          thumbnailUrl: `https://images.unsplash.com/${imageId}?w=400&sig=${i}`,
        };
      }),
    },
    {
      id: 'cemucaf-quetzaltenango-2024',
      title: 'Inauguración CEMUCAF Quetzaltenango',
      description:
        'Inauguración del nuevo Centro Municipal de Capacitación y Formación Humana en Quetzaltenango',
      date: '2024-11-20',
      coverPhoto: 'https://images.unsplash.com/photo-1562774053-701939374585?w=800',
      program: 'CEMUCAF',
      eventType: 'inauguracion',
      photos: [
        {
          id: '1',
          url: 'https://images.unsplash.com/photo-1562774053-701939374585?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?w=400',
        },
        {
          id: '2',
          url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=400',
        },
        {
          id: '3',
          url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400',
        },
        {
          id: '4',
          url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=400',
        },
      ],
    },
    {
      id: 'capacitacion-pronea-2024',
      title: 'Capacitación Docentes PRONEA',
      description:
        'Jornada de capacitación para docentes del Programa Nacional de Educación Alternativa',
      date: '2024-09-10',
      coverPhoto: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800',
      program: 'PRONEA',
      eventType: 'taller',
      photos: [
        {
          id: '1',
          url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400',
        },
        {
          id: '2',
          url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400',
        },
        {
          id: '3',
          url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=400',
        },
      ],
    },
    {
      id: 'entrega-becas-probefi-2025',
      title: 'Entrega de Becas PROBEFI 2025',
      description: 'Ceremonia de entrega de becas del Programa de Becas y Financiamiento Educativo',
      date: '2025-02-20',
      coverPhoto: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800',
      program: 'PROBEFI',
      eventType: 'ceremonia',
      photos: [
        {
          id: '1',
          url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=400',
        },
        {
          id: '2',
          url: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=400',
        },
        {
          id: '3',
          url: 'https://images.unsplash.com/photo-1529390079861-591de354faf5?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1529390079861-591de354faf5?w=400',
        },
      ],
    },
    {
      id: 'modalidades-flexibles-2024',
      title: 'Taller Modalidades Flexibles',
      description:
        'Taller de implementación de modalidades flexibles de aprendizaje en comunidades rurales',
      date: '2024-10-05',
      coverPhoto: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800',
      program: 'Modalidades Flexibles',
      eventType: 'taller',
      photos: [
        {
          id: '1',
          url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400',
        },
        {
          id: '2',
          url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400',
        },
      ],
    },
    {
      id: 'feria-educativa-2024',
      title: 'Feria Educativa DIGEEX 2024',
      description: 'Feria anual de proyectos educativos de todas las subdirecciones de DIGEEX',
      date: '2024-08-15',
      coverPhoto: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?w=800',
      program: 'DIGEEX',
      eventType: 'evento',
      photos: [
        {
          id: '1',
          url: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1540317580384-e5d43616b9aa?w=400',
        },
        {
          id: '2',
          url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=400',
        },
        {
          id: '3',
          url: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200',
          thumbnailUrl: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=400',
        },
      ],
    },
  ];

  getAlbums(): Observable<Album[]> {
    return of(this.mockAlbums).pipe(delay(500));
  }

  getAlbumById(id: string): Observable<Album | undefined> {
    const album = this.mockAlbums.find((a) => a.id === id);
    return of(album).pipe(delay(300));
  }

  /**
   * Busca albums con filtros aplicados.
   * Simula comportamiento del API de DSpace.
   *
   * @param filters - Filtros de búsqueda
   * @returns Observable con albums filtrados
   */
  searchAlbums(filters: GalleryFilters): Observable<Album[]> {
    return of(this.mockAlbums).pipe(
      delay(500),
      map((albums) => {
        let filtered = [...albums];

        // Filtro por búsqueda de texto
        if (filters.searchQuery && filters.searchQuery.trim()) {
          const query = filters.searchQuery.toLowerCase();
          filtered = filtered.filter(
            (album) =>
              album.title.toLowerCase().includes(query) ||
              album.description.toLowerCase().includes(query),
          );
        }

        // Filtro por programas
        if (filters.programs && filters.programs.length > 0) {
          filtered = filtered.filter((album) => filters.programs!.includes(album.program));
        }

        // Filtro por tipos de evento
        if (filters.eventTypes && filters.eventTypes.length > 0) {
          filtered = filtered.filter((album) => filters.eventTypes!.includes(album.eventType));
        }

        return filtered;
      }),
    );
  }

  /**
   * Obtiene las opciones disponibles para los filtros con conteo.
   * Similar a las facetas de DSpace Discovery.
   *
   * @returns Opciones de filtros con conteos
   */
  getFilterOptions(): Observable<{
    programs: FilterOption[];
    eventTypes: FilterOption[];
  }> {
    return of(this.mockAlbums).pipe(
      delay(300),
      map((albums) => {
        // Contar programas
        const programCounts = new Map<string, number>();
        albums.forEach((album) => {
          const count = programCounts.get(album.program) || 0;
          programCounts.set(album.program, count + 1);
        });

        const programs: FilterOption[] = Array.from(programCounts.entries())
          .map(([value, count]) => ({
            label: value,
            value: value,
            count,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        // Contar tipos de evento
        const eventTypeCounts = new Map<string, number>();
        albums.forEach((album) => {
          const count = eventTypeCounts.get(album.eventType) || 0;
          eventTypeCounts.set(album.eventType, count + 1);
        });

        // Mapear valores a labels amigables
        const eventTypeLabels: Record<string, string> = {
          graduacion: 'Graduaciones',
          taller: 'Talleres',
          inauguracion: 'Inauguraciones',
          ceremonia: 'Ceremonias',
          evento: 'Eventos generales',
        };

        const eventTypes: FilterOption[] = Array.from(eventTypeCounts.entries())
          .map(([value, count]) => ({
            label: eventTypeLabels[value] || value,
            value: value,
            count,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        return { programs, eventTypes };
      }),
    );
  }
}
