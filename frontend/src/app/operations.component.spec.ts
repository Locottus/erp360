import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { OperationsComponent } from './operations.component';

describe('Quotation validity UI', () => {
  let http: HttpTestingController;
  let user: ReturnType<typeof signal<AuthUser | null>>;
  const admin: AuthUser = { id: 'admin', companyId: 'company', email: 'admin@example.test', fullName: 'Admin', roles: ['admin'] };
  const quote = { id: 'quote', quotation_number: 'Q', status: 'draft', subtotal: '20', grand_total: '20', customer_id: 'customer', valid_until: '2026-01-01', is_expired: true, revision: 3 };
  const purchase = { id: 'purchase', request_number: 'PR', status: 'draft', grand_total: '6', supplier_id: 's',
    supplier_name: 'Supplier', purchase_order_id: null, purchase_order_number: null, purchase_order_status: null,
    inventory_received: false, is_posted: false, rejection_reason: null, approval_block_reason: null };
  beforeEach(() => {
    user = signal<AuthUser | null>(admin);
    TestBed.configureTestingModule({
      imports: [OperationsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: SessionService, useValue: { user } }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function flushLists() {
    for (const req of http.match(r => r.method === 'GET')) req.flush([]);
  }
  it('updates the requested tab when assistant navigation reuses the operations screen', async () => {
    user.update(value => value ? { ...value, roles: [] } : null);
    TestBed.inject(Router).resetConfig([{ path: 'operations', component: OperationsComponent }]);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/operations?tab=purchases', OperationsComponent);
    expect(component.activeTab).toBe('purchases');
    const reused = await harness.navigateByUrl('/operations?tab=sales', OperationsComponent);
    expect(reused).toBe(component);
    expect(component.activeTab).toBe('sales');
    await harness.navigateByUrl('/operations?tab=unknown', OperationsComponent);
    expect(component.activeTab).toBe('sales');
    http.expectNone(request => request.method !== 'GET');
  });
  async function setup() {
    const fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges(); flushLists(); await fixture.whenStable();
    return fixture;
  }
  it('blocks expired confirmation and requires reviewed conditions before renewing', async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    await component.confirmQuotation(quote);
    http.expectNone(`${API_BASE_URL}/commerce/sales/quotations/quote/confirm`);
    component.validityQuotation = quote;
    component.validity = { date: '2099-01-01', unlimited: false, reason: 'Reviewed offer with customer', reviewed: false };
    await component.reviseValidity();
    http.expectNone(`${API_BASE_URL}/commerce/sales/quotations/quote/validity`);
    component.validity.reviewed = true;
    const pending = component.reviseValidity();
    const req = http.expectOne(`${API_BASE_URL}/commerce/sales/quotations/quote/validity`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ expectedRevision: 3, validUntil: '2099-01-01', reason: 'Reviewed offer with customer' });
    req.flush({ revision: 4 }); await Promise.resolve(); flushLists(); await pending;
    expect(component.validityQuotation).toBeNull();
    expect(component.message).toContain('Los precios no cambiaron');
  });
  it('reports a stale revision without claiming success', async () => {
    const component = (await setup()).componentInstance;
    component.validityQuotation = quote;
    component.validity = { date: '', unlimited: true, reason: 'Approved removal after review', reviewed: true };
    const pending = component.reviseValidity();
    const req = http.expectOne(`${API_BASE_URL}/commerce/sales/quotations/quote/validity`);
    expect(req.request.body.validUntil).toBeNull();
    req.flush({ message: 'stale' }, { status: 409, statusText: 'Conflict' }); await pending;
    expect(component.message).toBe('');
    expect(component.error).toContain('Actualiza');
  });
  it('clears renewal input on session loss and discards the old write response', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.validityQuotation = quote;
    component.validity = { date: '2099-01-01', unlimited: false, reason: 'Reviewed offer before session change', reviewed: true };
    const pending = component.reviseValidity();
    const req = http.expectOne(`${API_BASE_URL}/commerce/sales/quotations/quote/validity`);
    user.set(null); fixture.detectChanges();
    req.flush({ revision: 4 }); await pending;
    expect(component.validityQuotation).toBeNull();
    expect(component.validity.reason).toBe('');
    expect(component.message).toBe('');
    expect(component.validityBusy).toBe(false);
    http.expectNone(r => r.method === 'GET');
  });
  it('rejects a draft with a reason and displays its audited result', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.activeTab = 'purchases'; component.purchaseRequests = [purchase];
    component.rejectionReasons[purchase.id] = 'No longer needed after review'; fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rechazar solicitud');
    const pending = component.rejectPurchase(purchase);
    const req = http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/reject`);
    expect(req.request.body).toEqual({ reason: 'No longer needed after review' });
    req.flush({ status: 'rejected' }); await Promise.resolve();
    for (const call of http.match(r => r.method === 'GET')) {
      call.flush(call.request.url.endsWith('/commerce/purchases/requests')
        ? [{ ...purchase, status: 'rejected', rejection_reason: 'No longer needed after review' }] : []);
    }
    await pending; fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No longer needed after review'); expect(text).toContain('Solicitud rechazada; no genera orden.');
    expect(text).not.toContain('Rechazar solicitud'); expect(component.message).toContain('motivo auditado');
  });
  it('does not present a stale rejection as success and clears input after logout', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.rejectionReasons[purchase.id] = 'No longer needed after review';
    const rejected = component.rejectPurchase(purchase);
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/reject`)
      .flush({}, { status: 409, statusText: 'Conflict' });
    await rejected; expect(component.error).toContain('Actualiza'); expect(component.message).toBe('');
    const pending = component.rejectPurchase(purchase);
    const req = http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/reject`);
    user.set(null); fixture.detectChanges(); req.flush({ status: 'rejected' }); await pending;
    expect(component.rejectionReasons).toEqual({}); expect(component.purchaseRequests).toEqual([]);
    expect(component.message).toBe(''); expect(component.busy).toBe(false);
  });
  it('shows exact purchase request line details and clears them on logout', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.activeTab = 'purchases'; component.purchaseRequests = [purchase];
    const pending = component.showPurchaseDetails(purchase);
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase`).flush({
      id: purchase.id, request_number: 'PR', status: 'draft', supplier_name: 'Supplier', currency_code: 'USD',
      subtotal: '6.0000', tax_total: '0.0000', grand_total: '6.0000',
      lines: [{ id: 'line', sku: 'P', product_name: 'Product', quantity: '2.0000', unit_cost: '3.0000', line_total: '6.0000' }],
    });
    await pending; fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('P · Product'); expect(text).toContain('2.0000'); expect(text).toContain('3.0000');
    expect(text).toContain('Estado al consultar: draft');
    user.set(null); fixture.detectChanges(); expect(component.purchaseDetails).toBeNull();
  });
  it('does not expose late purchase details or hide a load failure', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const failed = component.showPurchaseDetails(purchase);
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase`)
      .flush({}, { status: 500, statusText: 'Error' });
    await failed; expect(component.error).toContain('No se pudo cargar'); expect(component.purchaseDetails).toBeNull();
    const pending = component.showPurchaseDetails(purchase);
    const req = http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase`);
    user.set(null); fixture.detectChanges(); req.flush({ id: 'purchase' }); await pending;
    expect(component.purchaseDetails).toBeNull();
  });
  it('explains independent approval blocks and does not submit a self or legacy approval', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.activeTab = 'purchases';
    component.orderNumbers[purchase.id] = 'PO';
    for (const approval_block_reason of ['self_approval', 'unknown_creator'] as const) {
      const blocked = { ...purchase, approval_block_reason };
      component.purchaseRequests = [blocked]; fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain(approval_block_reason === 'self_approval' ? 'otro administrador' : 'sin creador identificado');
      expect(text).toContain('Rechazar solicitud');
      const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
      expect(buttons.some(button => button.textContent?.trim() === 'Aprobar')).toBeFalse();
      await component.approvePurchase(blocked);
      http.expectNone(`${API_BASE_URL}/commerce/purchases/requests/purchase/approve`);
      expect(component.message).toBe('');
    }
  });
  it('explains a policy activated after loading instead of claiming a successful approval', async () => {
    const component = (await setup()).componentInstance;
    component.orderNumbers[purchase.id] = 'PO';
    const pending = component.approvePurchase(purchase);
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/approve`)
      .flush({}, { status: 403, statusText: 'Forbidden' });
    await pending;
    expect(component.error).toContain('persona distinta del creador');
    expect(component.message).toBe('');
    expect(component.busy).toBeFalse();
  });
});
