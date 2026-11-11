import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthUser, SessionService } from './core/session.service';
import { AccountDetail, Portfolio, SaasService, Subscription } from './core/saas.service';
import { SaasBillingComponent } from './saas-billing.component';
import { SubscriptionComponent } from './subscription.component';

describe('SaaS administration UI', () => {
  const admin: AuthUser = { id: 'tenant-admin', companyId: 'company', email: 'admin@example.test', fullName: 'Tenant Admin', roles: ['admin'] };
  const contract: Subscription = { id: 'contract', company_id: 'company', currency: 'USD', revision: 7, status: 'active', starts_on: '2026-01-01', renews_on: '2026-12-01', modules: [{ code: 'base', price: '12.3456' }] };
  const portfolio: Portfolio = { clients: [{ id: 'account', name: 'Private Company', billing_email: 'private@example.test', currency: 'USD', open_balance: '20.0000', overdue_balance: '0.0000', days_overdue: 0, status: 'al_dia', modules: ['base'], next_followup: null, followup_overdue: false }], totals: [] };
  const detail: AccountDetail = {
    account: { id: 'account', name: 'Private Company', billing_email: 'private@example.test' },
    subscriptions: [contract],
    invoices: [{ id: 'invoice', subscription_id: 'contract', reference: 'SAAS-1', period_start: '2026-11-01', period_end: '2026-11-30', due_on: '2026-12-01', currency: 'USD', total: '20.0000', paid_amount: '0.0000', credited_amount: '0.0000', balance: '20.0000', payment_status: 'unpaid', lines: [{ description: 'Base', module_code: 'base', amount: '20.0000' }] }],
    payments: [], followups: [{ id: 'follow', kind: 'note', note: 'Initial note', due_on: '2026-11-20', status: 'open', revision: 4 }], audit: [], users: [],
  };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  beforeEach(() => {
    user = signal<AuthUser | null>(admin);
    TestBed.configureTestingModule({
      imports: [SaasBillingComponent, SubscriptionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), {
        provide: SessionService, useValue: { user, company: signal(null), getAccessToken: () => user() ? `token-${user()!.id}` : null },
      }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function flushLists() {
    http.expectOne(req => req.url.startsWith('/api/saas/portfolio?')).flush(portfolio);
    http.expectOne('/api/saas/companies').flush([{ id: 'company', code: 'CO', name: 'Private Company' }]);
    http.expectOne('/api/saas/operators').flush([]);
  }
  async function create(role: string | null = 'owner') {
    const fixture = TestBed.createComponent(SaasBillingComponent);
    fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role });
    await fixture.whenStable(); fixture.detectChanges();
    if (role) { flushLists(); await fixture.whenStable(); fixture.detectChanges(); }
    return fixture;
  }
  async function select(fixture: ComponentFixture<SaasBillingComponent>) {
    const pending = fixture.componentInstance.selectAccount('account');
    http.expectOne('/api/saas/accounts/account').flush(detail);
    await pending; fixture.detectChanges(); await fixture.whenStable();
  }
  it('does not equate tenant admin with platform permission or fetch global records after denial', async () => {
    const fixture = await create(null);
    expect(fixture.nativeElement.textContent).toContain('Ser administrador de empresa no concede este permiso');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.expectNone(req => req.url.includes('/portfolio') || req.url.includes('/accounts'));
    await fixture.componentInstance.write('/accounts', { name: 'Denied' });
    http.expectNone('/api/saas/accounts');
  });
  it('renders viewer details without write forms and denies programmatic writes', async () => {
    const fixture = await create('viewer'); await select(fixture);
    expect(fixture.nativeElement.textContent).toContain('Modo consulta');
    expect(fixture.nativeElement.textContent).toContain('12.3456 USD');
    expect(fixture.nativeElement.textContent).toContain('unpaid');
    expect(fixture.nativeElement.textContent).not.toContain('Confirmar registro financiero');
    expect(fixture.nativeElement.textContent).not.toContain('Crear cuenta de facturación');
    await fixture.componentInstance.write('/accounts', { name: 'Denied' });
    http.expectNone('/api/saas/accounts');
  });
  it('requires received-money confirmation and posts the exact decimal string payload without pretending a gateway', async () => {
    const fixture = await create(); await select(fixture);
    const component = fixture.componentInstance;
    component.money = { kind: 'payment', invoiceId: 'invoice', paymentId: '', amount: '12.3456', date: '2026-11-10', method: 'transfer', reference: 'BANK-1', reason: 'Confirmed bank receipt', confirmed: false };
    expect(component.moneyValid).toBeFalse();
    await component.recordMoney(); http.expectNone('/api/saas/invoices/invoice/payments');
    component.money.confirmed = true;
    const pending = component.recordMoney();
    const request = http.expectOne('/api/saas/invoices/invoice/payments');
    expect(request.request.body).toEqual({ reference: 'BANK-1', amount: '12.3456', paidOn: '2026-11-10', method: 'transfer', reason: 'Confirmed bank receipt' });
    request.flush({ id: 'payment' }); await Promise.resolve(); await Promise.resolve();
    flushLists(); http.expectOne('/api/saas/accounts/account').flush(detail);
    await pending; fixture.detectChanges();
    expect(component.money.confirmed).toBeFalse();
    expect(component.message).toContain('no se envió dinero ni correo');
  });
  it('uses the exact selected contract revision and preserves module price precision', async () => {
    const fixture = await create(); await select(fixture);
    const component = fixture.componentInstance;
    component.editContract(contract); component.contract.reason = 'Revised future prices';
    const pending = component.saveContract();
    const request = http.expectOne('/api/saas/subscriptions/contract');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ expectedRevision: 7, modules: [{ code: 'base', price: '12.3456' }], renewsOn: '2026-12-01', reason: 'Revised future prices' });
    request.flush({ message: 'Revision conflict' }, { status: 409, statusText: 'Conflict' });
    await pending; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Error 409: Revision conflict');
    expect(component.contract.expectedRevision).toBe(7);
    expect(component.contract.reason).toBe('Revised future prices');
  });
  it('clears private rows and discards old detail while permitting a new identity reload', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    const old = component.selectAccount('account');
    const oldRequest = http.expectOne('/api/saas/accounts/account');
    user.set({ ...admin, id: 'next-user' }); fixture.detectChanges();
    expect(component.detail).toBeNull(); expect(component.portfolio.clients).toEqual([]);
    expect(component.busy).toBeFalse(); expect(component.detailBusy).toBeFalse();
    expect(TestBed.inject(SaasService).role()).toBeNull();
    http.expectOne('/api/saas/operator').flush({ role: 'viewer' });
    await fixture.whenStable(); fixture.detectChanges();
    flushLists(); await fixture.whenStable(); fixture.detectChanges();
    oldRequest.flush(detail); await old;
    expect(component.detail).toBeNull(); expect(component.selectedId).toBe('');
    user.set(null); fixture.detectChanges();
    expect(component.portfolio.clients).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Private Company');
  });
  it('discards an operator permission response from a previous identity', async () => {
    const fixture = TestBed.createComponent(SaasBillingComponent); fixture.detectChanges();
    const old = http.expectOne('/api/saas/operator');
    user.set({ ...admin, id: 'new-tenant-admin' }); fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role: null });
    old.flush({ role: 'owner' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(TestBed.inject(SaasService).role()).toBeNull();
    http.expectNone(req => req.url.includes('/portfolio') || req.url.includes('/companies'));
  });
  it('discards old global report responses without releasing the new identity busy state', async () => {
    const fixture = TestBed.createComponent(SaasBillingComponent); fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role: 'owner' });
    await fixture.whenStable(); fixture.detectChanges();
    const oldPortfolio = http.expectOne(req => req.url.startsWith('/api/saas/portfolio?'));
    const oldCompanies = http.expectOne('/api/saas/companies');
    const oldOperators = http.expectOne('/api/saas/operators');
    user.set({ ...admin, id: 'new-operator' }); fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role: 'viewer' });
    await fixture.whenStable(); fixture.detectChanges();
    oldPortfolio.flush(portfolio); oldCompanies.flush([{ id: 'old', name: 'Old confidential company' }]); oldOperators.flush([]);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.portfolio.clients).toEqual([]);
    expect(fixture.componentInstance.companies).toEqual([]);
    expect(fixture.componentInstance.busy).toBeTrue();
    http.expectOne(req => req.url.startsWith('/api/saas/portfolio?')).flush({ clients: [], totals: [] });
    http.expectOne('/api/saas/companies').flush([]); http.expectOne('/api/saas/operators').flush([]);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.busy).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Private Company');
    expect(fixture.nativeElement.textContent).not.toContain('Old confidential company');
  });
  it('displays API validation errors explicitly and does not invent an empty successful report', async () => {
    const fixture = await create();
    const pending = fixture.componentInstance.refresh();
    http.expectOne(req => req.url.startsWith('/api/saas/portfolio?')).flush({ message: ['Invalid cutoff date', 'Use ISO date'] }, { status: 400, statusText: 'Bad Request' });
    http.expectOne('/api/saas/companies').flush([]);
    http.expectOne('/api/saas/operators').flush([]);
    await pending; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Error 400: Invalid cutoff date · Use ISO date');
    expect(fixture.componentInstance.portfolio.clients).toHaveSize(1);
    expect(fixture.componentInstance.busy).toBeFalse();
  });
  it('updates followup status with its own exact revision', async () => {
    const fixture = await create(); await select(fixture);
    const component = fixture.componentInstance;
    component.editFollowup(detail.followups[0]); component.followupEdit.status = 'done'; component.followupEdit.note = 'Called and reconciled';
    const pending = component.saveFollowup();
    const request = http.expectOne('/api/saas/followups/follow');
    expect(request.request.body).toEqual({ expectedRevision: 4, status: 'done', note: 'Called and reconciled' });
    request.flush({ message: 'Updated elsewhere' }, { status: 409, statusText: 'Conflict' }); await pending;
  });
  it('rejects invalid decimal precision and amounts exceeding the current invoice balance', async () => {
    const fixture = await create(); await select(fixture);
    const component = fixture.componentInstance;
    component.money = { ...component.money, invoiceId: 'invoice', reference: 'BANK-1', reason: 'Verified receipt reason', confirmed: true, amount: '1.00001' };
    expect(component.moneyValid).toBeFalse(); component.money.amount = '20.0001'; expect(component.moneyValid).toBeFalse();
    component.money.amount = '0.0000'; expect(component.moneyValid).toBeFalse();
    component.money.amount = '20.0000'; expect(component.moneyValid).toBeTrue();
  });
  it('loads the tenant subscription without any global collection and discards a previous session response', async () => {
    const fixture = TestBed.createComponent(SubscriptionComponent); fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role: null });
    const old = http.expectOne('/api/saas/subscription');
    user.set({ ...admin, id: 'other', companyId: 'other-company' }); fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role: null });
    http.expectOne('/api/saas/subscription').flush({ subscription: null, access: 'informational' });
    old.flush({ subscription: contract, access: 'informational' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.data?.subscription).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No hay una suscripción activa');
    http.expectNone(req => /\/accounts|\/companies|\/portfolio|\/operators/.test(req.url));
  });
  it('renders own company prices, scoped balances and aggregate user counts read-only', async () => {
    const fixture = TestBed.createComponent(SubscriptionComponent); fixture.detectChanges();
    http.expectOne('/api/saas/operator').flush({ role: null });
    http.expectOne('/api/saas/subscription').flush({ subscription: contract, access: 'informational',
      company: { id: 'company', code: 'CO', name: 'Own company' },
      balance: { currency: 'USD', open_balance: '30.1234', overdue_balance: '10.0000', as_of: '2026-11-10' },
      users: { total_count: 7, active_count: 5 } });
    await fixture.whenStable(); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Own company'); expect(text).toContain('30.1234 USD');
    expect(text).toContain('5 activos · 7 registrados'); expect(text).toContain('12.3456 USD');
    expect(text).toContain('sin bloqueo automático');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('prepares only confirmed internal collection tasks for the exact inspected cutoff', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    const queue = component.loadQueue();
    http.expectOne(`/api/saas/collection-queue?asOf=${component.asOf}`).flush({ as_of: component.asOf, items: [] });
    await queue;
    await component.prepareQueue(); http.expectNone('/api/saas/collection-runs');
    component.queueConfirmed = true;
    const prepare = component.prepareQueue();
    const request = http.expectOne('/api/saas/collection-runs');
    expect(request.request.body).toEqual({ asOf: component.asOf });
    request.flush({ created: 1, skipped_paid: 2, skipped_paused: 3, already_run: 4 });
    await Promise.resolve(); await Promise.resolve();
    http.expectOne(`/api/saas/collection-queue?asOf=${component.asOf}`).flush({ as_of: component.asOf, items: [] });
    await prepare;
    expect(component.queueConfirmed).toBeFalse();
    expect(component.message).toContain('No se envió ningún correo ni se cobró dinero');
  });
});
