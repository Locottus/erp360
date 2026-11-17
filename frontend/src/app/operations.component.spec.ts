import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
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
    inventory_received: false, is_posted: false, rejection_reason: null, approval_block_reason: null,
    destination_location_code: null, expected_receipt_date: null,
    order_destination_location_code: null, order_expected_receipt_date: null, is_receipt_overdue: false };
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
  it('loads lists once when the administrator session is restored after the screen initializes', fakeAsync(() => {
    user.set(null);
    const fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges();
    http.expectNone(r => r.method === 'GET');
    user.set(admin); fixture.detectChanges(); fixture.detectChanges();
    const reads = http.match(r => r.method === 'GET');
    expect(reads.filter(r => r.request.url.endsWith('/masters/products'))).toHaveSize(1);
    for (const read of reads) read.flush(read.request.url.endsWith('/commerce/purchases/requests') ? [purchase] : []);
    flushMicrotasks();
    expect(fixture.componentInstance.purchaseRequests).toEqual([purchase]);
    expect(fixture.componentInstance.loading).toBeFalse();
    fixture.detectChanges(); http.expectNone(r => r.method === 'GET');
  }));
  it('clears loaded context and ignores an earlier load failure while the new identity is loading', fakeAsync(() => {
    const fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges(); flushLists(); flushMicrotasks();
    const component = fixture.componentInstance;
    component.products = [{ id: 'old', sku: 'OLD', name: 'Old company product', unit_price: '1', is_active: true }];
    component.purchaseRequests = [purchase]; component.issuedPortalToken = 'old-context-secret';
    component.message = 'Old success';
    void component.refresh();
    const oldReads = http.match(r => r.method === 'GET');
    user.set({ ...admin, id: 'new-admin', companyId: 'new-company' }); fixture.detectChanges();
    const newReads = http.match(r => r.method === 'GET');
    expect(newReads.some(r => r.request.url.endsWith('/masters/products'))).toBeTrue();
    expect(component.products).toEqual([]); expect(component.purchaseRequests).toEqual([]);
    expect(component.issuedPortalToken).toBe(''); expect(component.message).toBe('');
    oldReads.forEach((read, index) => index === 0
      ? read.flush({}, { status: 500, statusText: 'Error' }) : read.flush([]));
    flushMicrotasks();
    expect(component.error).toBe(''); expect(component.loading).toBeTrue();
    const currentProduct = { id: 'new', sku: 'NEW', name: 'Current company product', unit_price: '2', is_active: true };
    for (const read of newReads) read.flush(read.request.url.endsWith('/masters/products') ? [currentProduct] : []);
    flushMicrotasks();
    expect(component.products).toEqual([currentProduct]); expect(component.loading).toBeFalse();
  }));
  it('invalidates an old load even when the same user object becomes current again', fakeAsync(() => {
    const fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges(); flushLists(); flushMicrotasks();
    const component = fixture.componentInstance;
    void component.refresh();
    const oldReads = http.match(r => r.method === 'GET');
    user.set(null); fixture.detectChanges();
    expect(component.loading).toBeFalse();
    user.set(admin); fixture.detectChanges();
    const newReads = http.match(r => r.method === 'GET');
    expect(newReads.some(r => r.request.url.endsWith('/commerce/purchases/requests'))).toBeTrue();
    for (const read of oldReads) read.flush(read.request.url.endsWith('/commerce/purchases/requests') ? [purchase] : []);
    flushMicrotasks();
    expect(component.purchaseRequests).toEqual([]); expect(component.loading).toBeTrue();
    for (const read of newReads) read.flush([]);
    flushMicrotasks(); expect(component.loading).toBeFalse();
  }));
  it('does not let a previous balance query replace data or end the restored session load', fakeAsync(() => {
    const fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges(); flushLists(); flushMicrotasks();
    const component = fixture.componentInstance;
    void component.loadTrialBalance();
    const previous = http.expectOne(`${API_BASE_URL}/accounting/reports/trial-balance`);
    const balance = { rows: [], totals: { totalDebit: 1, totalCredit: 1, isBalanced: true } };
    user.set({ ...admin, id: 'other-admin', companyId: 'other-company' }); fixture.detectChanges();
    previous.flush(balance); flushMicrotasks();
    expect(component.trialBalance).toBeNull(); expect(component.loading).toBeTrue();
    flushLists(); flushMicrotasks();
    void component.loadTrialBalance();
    http.expectOne(`${API_BASE_URL}/accounting/reports/trial-balance`).flush(balance); flushMicrotasks();
    expect(component.trialBalance).toEqual(balance); expect(component.loading).toBeFalse();
  }));
  it('does not load for restored non-admin users and exposes a failed admin load until manually retried', fakeAsync(() => {
    user.set(null);
    const fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges();
    user.set({ ...admin, roles: ['purchases'] }); fixture.detectChanges();
    http.expectNone(r => r.method === 'GET');
    user.set(admin); fixture.detectChanges();
    const reads = http.match(r => r.method === 'GET');
    expect(reads.length).toBeGreaterThan(0);
    reads.forEach((read, index) => index === 0
      ? read.flush({}, { status: 503, statusText: 'Unavailable' }) : read.flush([]));
    flushMicrotasks();
    expect(fixture.componentInstance.error).toContain('No se pudieron cargar');
    expect(fixture.componentInstance.loading).toBeFalse();
    void fixture.componentInstance.refresh();
    flushLists(); flushMicrotasks();
    expect(fixture.componentInstance.error).toBe('');
  }));
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
  it('distinguishes company default, explicit date and explicit unlimited when creating offers', async () => {
    const component = (await setup()).componentInstance;
    for (const mode of ['default', 'date', 'unlimited']) {
      component.quotation = { quotationNumber: 'NEW', customerId: 'customer', taxRateCode: '', validUntil: mode === 'default' ? '' : '2099-01-01' };
      component.quotationUnlimited = mode === 'unlimited';
      component.salesLines = [{ productId: 'product', quantity: 1, unitPrice: null }];
      const pending = component.createQuotation();
      const req = http.expectOne(`${API_BASE_URL}/commerce/sales/quotations`);
      expect(req.request.body.validUntil).toBe(mode === 'default' ? undefined : mode === 'date' ? '2099-01-01' : null);
      req.flush({ id: `new-${mode}` }); await Promise.resolve(); flushLists(); await pending;
      expect(component.quotationUnlimited).toBeFalse();
    }
  });
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
      destination_location_code: 'WH-B', expected_receipt_date: '2099-01-01',
      lines: [{ id: 'line', sku: 'P', product_name: 'Product', quantity: '2.0000', unit_cost: '3.0000', line_total: '6.0000' }],
    });
    await pending; fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('P · Product'); expect(text).toContain('2.0000'); expect(text).toContain('3.0000');
    expect(text).toContain('Estado al consultar: draft');
    expect(text).toContain('Destino previsto: WH-B'); expect(text).toContain('2099-01-01');
    user.set(null); fixture.detectChanges(); expect(component.purchaseDetails).toBeNull();
  });
  it('sends explicit purchase planning and keeps blank planning unknown', async () => {
    const component = (await setup()).componentInstance;
    for (const planned of [true, false]) {
      component.purchase = { requestNumber: 'PLANNED', supplierId: 's', taxRateCode: '',
        destinationLocationCode: planned ? ' WH-B ' : '', expectedReceiptDate: planned ? '2099-01-01' : '' };
      component.purchaseLines = [{ productId: 'p', quantity: 1, unitCost: 2 }];
      const pending = component.createPurchase();
      const req = http.expectOne(`${API_BASE_URL}/commerce/purchases/requests`);
      expect(req.request.body.destinationLocationCode).toBe(planned ? 'WH-B' : null);
      expect(req.request.body.expectedReceiptDate).toBe(planned ? '2099-01-01' : null);
      req.flush({ id: 'planned' }); await Promise.resolve(); flushLists(); await pending;
      expect(component.purchase.destinationLocationCode).toBe('');
      expect(component.purchase.expectedReceiptDate).toBe('');
    }
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
  it('loads the correct plan and history, explicitly clears fields and sends its revision after confirmation', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.activeTab = 'purchases';
    const opened = component.showDeliveryPlan('order', 'order');
    http.expectOne(`${API_BASE_URL}/commerce/purchases/orders/order/delivery-plan`).flush({
      id: 'order', document_number: 'PO', status: 'partially_received', delivery_plan_revision: 2,
      destination_location_code: 'WH-B', expected_receipt_date: '2099-01-01', history_has_more: true,
      history: [{ created_at: '2026-01-01T10:00:00Z', actor_user_id: 'actor', reason: 'Reviewed supplier delay',
        before: { destination_location_code: 'WH-A', expected_receipt_date: null, revision: 1 },
        after: { destination_location_code: 'WH-B', expected_receipt_date: '2099-01-01', revision: 2 } }],
    });
    await opened; fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Plan de orden PO'); expect(text).toContain('Revisión del plan: 2');
    expect(text).toContain('Reviewed supplier delay'); expect(text).toContain('Hay revisiones anteriores');
    component.deliveryPlanInput = { destination: '', date: '', reason: 'Cleared after supplier review', reviewed: false };
    await component.reviseDeliveryPlan();
    http.expectNone(r => r.method === 'PATCH');
    component.deliveryPlanInput.reviewed = true;
    const saved = component.reviseDeliveryPlan();
    const patch = http.expectOne(`${API_BASE_URL}/commerce/purchases/orders/order/delivery-plan`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ destinationLocationCode: null, expectedReceiptDate: null,
      expectedRevision: 2, reason: 'Cleared after supplier review' });
    patch.flush({ revision: 3 }); await Promise.resolve(); flushLists(); await saved;
    expect(component.message).toContain('guardada con auditoría'); expect(component.deliveryPlan).toBeNull();
    const closed = component.showDeliveryPlan('purchase', 'request');
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/delivery-plan`).flush({
      id: 'purchase', document_number: 'PR', status: 'approved', delivery_plan_revision: 0,
      destination_location_code: null, expected_receipt_date: null, history: [], history_has_more: false,
    });
    await closed; fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Este documento es de consulta');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Guardar reprogramación');
    await component.reviseDeliveryPlan(); http.expectNone(r => r.method === 'PATCH');
  });
  it('does not claim success or overwrite plan inputs on conflict and surfaces failed reloads', async () => {
    const component = (await setup()).componentInstance;
    const opened = component.showDeliveryPlan('purchase', 'request');
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/delivery-plan`).flush({
      id: 'purchase', document_number: 'PR', status: 'draft', delivery_plan_revision: 0,
      destination_location_code: null, expected_receipt_date: null, history: [], history_has_more: false,
    });
    await opened;
    component.deliveryPlanInput = { destination: 'WH-C', date: '', reason: 'Reviewed with the supplier', reviewed: true };
    const saved = component.reviseDeliveryPlan();
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/delivery-plan`)
      .flush({}, { status: 409, statusText: 'Conflict' });
    await saved;
    expect(component.error).toContain('Recarga el plan e historial');
    expect(component.message).toBe(''); expect(component.deliveryPlanInput.destination).toBe('WH-C');
    const failed = component.showDeliveryPlan('purchase', 'request');
    http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/delivery-plan`)
      .flush({}, { status: 500, statusText: 'Error' });
    await failed; expect(component.error).toContain('No se pudo cargar el plan');
    expect(component.deliveryPlan).toBeNull();
  });
  it('discards late plan reads and writes and clears plan data after a session change', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const plan = { id: 'purchase', document_number: 'PR', status: 'draft', delivery_plan_revision: 0,
      destination_location_code: null, expected_receipt_date: null, history: [], history_has_more: false };
    const lateRead = component.showDeliveryPlan('purchase', 'request');
    const read = http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/delivery-plan`);
    user.set(null); fixture.detectChanges(); read.flush(plan); await lateRead;
    expect(component.deliveryPlan).toBeNull(); expect(component.busy).toBeFalse();
    user.set(admin); fixture.detectChanges(); flushLists(); await fixture.whenStable();
    component.deliveryPlan = plan;
    component.deliveryPlanInput = { destination: 'WH-C', date: '', reason: 'Reviewed with the supplier', reviewed: true };
    const lateWrite = component.reviseDeliveryPlan();
    const write = http.expectOne(`${API_BASE_URL}/commerce/purchases/requests/purchase/delivery-plan`);
    user.set(null); fixture.detectChanges(); write.flush({ revision: 1 }); await lateWrite;
    expect(component.deliveryPlan).toBeNull(); expect(component.deliveryPlanInput.reason).toBe('');
    expect(component.message).toBe(''); expect(component.busy).toBeFalse();
    http.expectNone(r => r.method === 'GET');
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
