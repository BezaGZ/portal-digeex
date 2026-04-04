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
  program: string;
  subjects: string[];
  eventType: string;
  author: string;
  publisher: string;
  populationType: string;
  imageContext: string;
  photoCount: number;
}

export interface GalleryFilters {
  searchQuery?: string;
  programs?: string[];
  eventTypes?: string[];
  populationTypes?: string[];
  imageContexts?: string[];
}

export interface FilterOption {
  label: string;
  value: string;
  count: number;
}

export interface FilterOptions {
  programs: FilterOption[];
  eventTypes: FilterOption[];
  populationTypes: FilterOption[];
  imageContexts: FilterOption[];
}

export interface AlbumPage {
  albums: Album[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}
