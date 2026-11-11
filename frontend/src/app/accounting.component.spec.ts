import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { AccountingComponent } from './accounting.component';

describe('Exact general ledger UI', () => {
  const admin: AuthUser = { id: 'a', companyId: 'c', email: 'admin@example.test', fullName: 'Admin', roles: ['admin'] };
  const query = { accountCode: '1100', fromDate: '2025-01-01', toDate: '2025-12-31' };
  const report = { account: { code: '1100', name: 'Receivable', account_type: 'asset' },
    summary: { opening: '10000000000000.0001', debit: '0.0001', credit: '0', closing: '10000000000000.0002' },
    items: [], total: 26, page: 1, pageSize: 25, fromDate: query.fromDate, toDate: query.toDate };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  beforeEach(() => {
    user = signal<AuthUser | null>(admin);
    TestBed.configureTestingModule({ imports: [AccountingComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(), { provide: SessionService, useValue: { user } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function setup() {
    const fixture = TestBed.createComponent(AccountingComponent); fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/accounting/accounts`).flush([{ account_code: '1100', account_name: 'Receivable' }]);
    await fixture.whenStable(); fixture.componentInstance.filter = { ...query }; return fixture;
  }
  it('renders exact strings and paginates using the executed query, not unsaved filter edits', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.search();
    http.expectOne(r => r.url.endsWith('/general-ledger')).flush(report); await pending; fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('10000000000000.0001');
    component.filter.accountCode = '1110';
    const page = component.changePage(1);
    const req = http.expectOne(r => r.url.endsWith('/general-ledger'));
    expect(req.request.params.get('accountCode')).toBe('1100'); expect(req.request.params.get('page')).toBe('2');
    req.flush({ ...report, page: 2 }); await page;
    expect(component.ledger?.summary.closing).toBe('10000000000000.0002');
  });
  it('does not replace a failed report with zero values and validates the date order', async () => {
    const component = (await setup()).componentInstance;
    component.filter.fromDate = '2026-01-01'; await component.search();
    http.expectNone(r => r.url.endsWith('/general-ledger')); expect(component.error).toContain('fechas');
    component.filter = { ...query };
    const pending = component.search();
    http.expectOne(r => r.url.endsWith('/general-ledger')).flush({}, { status: 500, statusText: 'Error' }); await pending;
    expect(component.ledger).toBeNull(); expect(component.error).toContain('No se muestran saldos como cero');
  });
  it('discards financial responses after identity changes', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.search(); const req = http.expectOne(r => r.url.endsWith('/general-ledger'));
    user.set(null); fixture.detectChanges(); req.flush(report); await pending;
    expect(component.ledger).toBeNull(); expect(component.accounts).toEqual([]);
  });
});
