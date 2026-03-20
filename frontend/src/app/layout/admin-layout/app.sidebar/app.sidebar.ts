import { Component, ElementRef } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppMenu } from '../app.menu/app.menu';
import { LayoutService } from '../services/layout.service';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [AppMenu, RouterModule],
    templateUrl: './app.sidebar.html',
})
export class AppSidebar {
    constructor(
        public el: ElementRef,
        public layoutService: LayoutService
    ) {}
}
