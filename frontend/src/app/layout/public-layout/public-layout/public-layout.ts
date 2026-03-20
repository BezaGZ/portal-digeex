import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PublicHeader } from '../public-header/public-header';
import { PublicFooter } from '../public-footer/public-footer';
import { PublicBreadcrumb } from '../public-breadcrumb/public-breadcrumb';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterModule, PublicHeader, PublicFooter, PublicBreadcrumb],
  templateUrl: './public-layout.html',
})
export class PublicLayout {}
