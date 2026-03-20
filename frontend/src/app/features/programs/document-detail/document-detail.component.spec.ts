import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DocumentDetailComponent } from './document-detail.component';

describe('DocumentDetailComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentDetailComponent, HttpClientTestingModule],
      providers: [{ provide: ActivatedRoute, useValue: { params: of({ id: 'test' }) } }],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DocumentDetailComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

});
