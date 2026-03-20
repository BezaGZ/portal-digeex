import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { GalleryFilters, FilterOption } from '../services/gallery.service';

@Component({
  selector: 'app-gallery-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, SelectModule, ButtonModule, InputTextModule],
  templateUrl: './gallery-filters.html',
})
export class GalleryFiltersComponent {
  @Input() programOptions: FilterOption[] = [];
  @Input() eventTypeOptions: FilterOption[] = [];

  @Output() filtersChange = new EventEmitter<GalleryFilters>();
  @Output() clear = new EventEmitter<void>();

  searchQuery: string = '';
  selectedProgram: string | null = null;
  selectedEventType: string | null = null;

  onFilterChange() {
    const filters: GalleryFilters = {};

    if (this.searchQuery.trim()) {
      filters.searchQuery = this.searchQuery.trim();
    }

    if (this.selectedProgram) {
      filters.programs = [this.selectedProgram];
    }

    if (this.selectedEventType) {
      filters.eventTypes = [this.selectedEventType];
    }

    this.filtersChange.emit(filters);
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedProgram = null;
    this.selectedEventType = null;
    this.clear.emit();
  }
}
