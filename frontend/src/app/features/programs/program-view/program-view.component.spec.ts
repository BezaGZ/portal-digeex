import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ProgramViewComponent } from './program-view.component';

describe('ProgramViewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgramViewComponent, HttpClientTestingModule],
      providers: [{ provide: ActivatedRoute, useValue: { params: of({ id: 'test' }) } }],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ProgramViewComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

});
