import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { FixedAssetsComponent } from './fixed-assets.component';
import { PettyCashComponent } from './petty-cash.component';

describe('Petty cash and fixed assets consoles', () => {
  let http: HttpTestingController;
  const session = { hasAnyPermission: (...codes: string[]) => codes.every(code => code !== 'petty_cash.approve') };
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), { provide: SessionService, useValue: session },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('opens a draft fund with an idempotency key and the loaded revision', async () => {
    const fixture = TestBed.createComponent(PettyCashComponent);
    http.expectOne(`${API_BASE_URL}/petty-cash/funds`).flush([]);
    await fixture.whenStable();
    http.expectOne(`${API_BASE_URL}/accounting/accounts`).flush([]);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.selected = { id: 'f1', code: 'PC', name: 'Fondo', status: 'draft', revision: 2, imprest_amount: '1', self_approval_limit: '0', balance: '0', pending_amount: '0', projected_balance: '0' };
    component.counterAccountId = 'acc';
    const pending = component.open();
    const req = http.expectOne(`${API_BASE_URL}/petty-cash/funds/f1/open`);
    expect(req.request.body).toEqual({ idempotencyKey: jasmine.stringMatching(/^open-/), expectedRevision: 2, sourceAccountId: 'acc' });
    req.flush({}, { status: 409, statusText: 'Conflict' });
    await pending;
    expect(component.error).toContain('Recarga');
    expect(component.message).toBe('');
  });

  it('queries the selected depreciation period and posts only on request', async () => {
    const fixture = TestBed.createComponent(FixedAssetsComponent);
    const component = fixture.componentInstance;
    http.expectOne(`${API_BASE_URL}/fixed-assets/assets`).flush([]);
    await fixture.whenStable();
    http.expectOne(`${API_BASE_URL}/fixed-assets/categories`).flush([]);
    await fixture.whenStable();
    http.expectOne(`${API_BASE_URL}/accounting/accounts`).flush([]);
    await fixture.whenStable();
    http.expectOne(`${API_BASE_URL}/fixed-assets/depreciation?year=${component.year}&month=${component.month}`).flush([]);
    await fixture.whenStable();
    http.expectNone(`${API_BASE_URL}/fixed-assets/depreciation/post-period`);

    component.disposalDate = '2026-03-01'; component.disposalReason = 'Venta del equipo';
    component.proceeds = '150'; component.proceedsAccountId = 'bank'; component.resultAccountId = 'gain';
    const pending = component.dispose({ id: 'a1', revision: 4 } as never);
    const req = http.expectOne(`${API_BASE_URL}/fixed-assets/assets/a1/dispose`);
    expect(req.request.body).toEqual({ expectedRevision: 4, reason: 'Venta del equipo', disposalDate: '2026-03-01',
      gainLossAccountId: 'gain', proceeds: '150', proceedsAccountId: 'bank' });
    req.flush({}, { status: 400, statusText: 'Bad Request' });
    await pending;
    expect(component.message).toBe('');
  });
});
