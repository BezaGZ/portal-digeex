export interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string;
}

/** Video del bundle ORIGINAL; `name` es el nombre del archivo, visible en la card. */
export interface AlbumVideo {
  id: string;
  url: string;
  name: string;
}

export interface Album {
  id: string;
  title: string;
  description: string;
  date: string;
  coverPhoto: string;
  photos: Photo[];
  videos: AlbumVideo[];
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
