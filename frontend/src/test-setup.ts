import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { registerLocaleData } from '@angular/common';
import localeEsGT from '@angular/common/locales/es-GT';

registerLocaleData(localeEsGT);

setupTestBed({ zoneless: false });
