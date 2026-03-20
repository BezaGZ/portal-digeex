import { Component } from '@angular/core';

@Component({
  selector: 'app-public-footer',
  standalone: true,
  templateUrl: './public-footer.html',
})
export class PublicFooter {
  currentYear = new Date().getFullYear();
}
