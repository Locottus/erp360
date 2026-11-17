import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { ReplenishmentComponent } from './replenishment.component';

describe('Replenishment rule editing', () => {
  const admin: AuthUser = { id: 'a', companyId: 'c', email: 'admin@example.test', fullName: 'Admin', roles: ['admin'] };
  const rule = { product_id: 'p', sku: 'P', product_name: 'Product', is_active: true, location_code: 'MAIN',
    minimum_quantity: '2.0001', target_quantity: '5.0002', revision: 3, on_hand: '2.0000', reserved: '1.0000',
    available: '1.0000', needs_replenishment: true, suggested_quantity: '4.0002',
    pending_purchase_quantity: '3.0001', pending_purchase_orders: 2, purchase_orders_requiring_review: 1, open_proposal_number: null };
  const planning = { product_id: 'p', sku: 'P', product_name: 'Product', as_of: '2026-11-17T12:00:00Z', as_of_date: '2026-11-17',
    pending_quantity: '3.0001', pending_orders: 1, review_orders: 1, open_requests: 1, open_request_quantity: '2.0001',
    groups: [{ destination_location_code: null, expected_receipt_date: null, is_receipt_overdue: false,
      pending_quantity: '3.0001', pending_orders: 1, review_orders: 1 }],
    requests: [{ request_id: 'r', request_number: 'PR-OTHER', supplier_name: 'Supplier', status: 'draft',
      quantity: '2.0001', origin: 'replenishment', source_location_code: 'SOURCE-A',
      destination_location_code: 'DEST-B', expected_receipt_date: null }] };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  beforeEach(() => {
    user = signal<AuthUser | null>(admin);
    TestBed.configureTestingModule({ imports: [ReplenishmentComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: SessionService, useValue: { user } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function setup() {
    const fixture = TestBed.createComponent(ReplenishmentComponent); fixture.detectChanges();
    http.expectOne(`${API_BASE_URL}/inventory/replenishment`).flush([rule]);
    http.expectOne(`${API_BASE_URL}/masters/products`).flush([{ id: 'p', sku: 'P', name: 'Product' }]);
    await fixture.whenStable(); return fixture;
  }
  it('loads per-location revision and keeps decimal strings intact in requests', async () => {
    const fixture = await setup(); fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('3.0001'); expect(text).toContain('2 órdenes');
    expect(text).toContain('1 orden con recepción histórica o inconsistente');
    expect(text).toContain('no deben sumarse entre ubicaciones');
    const component = fixture.componentInstance;
    component.productId = 'p'; component.prepare();
    expect(component.minimum).toBe('2.0001'); expect(component.revision).toBe(3);
    component.target = '5.0003'; component.reason = 'Reviewed planning policy';
    const pending = component.save();
    const req = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p`);
    expect(req.request.body).toEqual({ locationCode: 'MAIN', minimumQuantity: '2.0001', targetQuantity: '5.0003',
      expectedRevision: 3, reason: 'Reviewed planning policy' });
    req.flush({}, { status: 409, statusText: 'Conflict' }); await pending;
    expect(component.error).toContain('Actualiza'); expect(component.message).toBe('');
    component.location = 'SECOND'; component.prepare();
    expect(component.revision).toBe(0); expect(component.minimum).toBe('0');
  });
  it('does not expose rules or late write responses after logout', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    component.productId = 'p'; component.prepare(); component.reason = 'Reviewed planning policy';
    const pending = component.save(); const req = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p`);
    user.set(null); fixture.detectChanges(); req.flush({ revision: 4 }); await pending;
    expect(component.rules).toEqual([]); expect(component.products).toEqual([]);
    expect(component.reason).toBe(''); expect(component.message).toBe('');
  });
  it('displays the breakdown and explains excluded orders', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.showCommitments(rule);
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning`).flush({ ...planning, orders: [
      { order_id: 'o', order_number: 'PO-1', supplier_name: 'Supplier', status: 'ordered',
        ordered_quantity: '4.0001', documented_received_quantity: '1.0000', pending_quantity: '3.0001',
        destination_location_code: 'WH-B', expected_receipt_date: '2000-01-01', is_receipt_overdue: true,
        has_legacy: false, over_received: false },
      { order_id: 'o2', order_number: 'PO-2', supplier_name: 'Supplier', status: 'partially_received',
        ordered_quantity: '2.0000', documented_received_quantity: '3.0000', pending_quantity: null,
        has_legacy: true, over_received: true },
    ] });
    await pending; fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PO-1'); expect(text).toContain('Supplier');
    expect(text).toContain('recepción histórica sin detalle'); expect(text).toContain('sobre-recepción');
    expect(text).toContain('WH-B'); expect(text).toContain('2000-01-01'); expect(text).toContain('Fecha comprometida superada');
    expect(text).toContain('Pendiente verificable de empresa: 3.0001');
    expect(text).toContain('PR-OTHER'); expect(text).toContain('SOURCE-A'); expect(text).toContain('DEST-B');
    expect(text).toContain('No definido'); expect(text).toContain('No definida');
    expect(text).toContain('Cantidad solicitada: 2.0001'); expect(text).toContain('no se suman al pendiente');
  });
  it('clears and discards a late breakdown after identity changes', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.showCommitments(rule);
    const req = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning`);
    user.set(null); fixture.detectChanges(); req.flush([{ order_id: 'o' }]); await pending;
    expect(component.commitments).toEqual([]); expect(component.commitmentProduct).toBe(''); expect(component.planning).toBeNull();
  });
  it('reports breakdown loading errors without presenting an empty result as success', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.showCommitments(rule);
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning`)
      .flush({}, { status: 500, statusText: 'Error' });
    await pending;
    expect(component.error).toContain('No se pudieron cargar'); expect(component.commitmentProduct).toBe('');
  });
  it('exports a fresh authenticated CSV and reports download errors without success', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const loading = component.showCommitments(rule);
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning`).flush({ ...planning, orders: [] });
    await loading;
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    const createUrl = spyOn(URL, 'createObjectURL').and.callThrough();
    const pending = component.exportPlanning();
    const request = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning.csv`);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['"2.0001"'], { type: 'text/csv' })); await pending;
    expect(click).toHaveBeenCalledTimes(1); expect(createUrl).toHaveBeenCalledTimes(1);
    expect(component.message).toContain('nueva consulta');
    const failure = component.exportPlanning();
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning.csv`)
      .flush(new Blob(), { status: 500, statusText: 'Error' }); await failure;
    expect(component.error).toContain('No se pudo exportar'); expect(component.message).toBe('');
  });
  it('never downloads a late export after logout', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const loading = component.showCommitments(rule);
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning`).flush({ ...planning, orders: [] });
    await loading;
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    const pending = component.exportPlanning();
    const request = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-planning.csv`);
    user.set(null); fixture.detectChanges(); request.flush(new Blob()); await pending;
    expect(click).not.toHaveBeenCalled(); expect(component.planning).toBeNull(); expect(component.message).toBe('');
  });
  it('creates a reviewed proposal with explicit exact quantity and cost', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const preparing = component.prepareProposal(rule);
    http.expectOne(`${API_BASE_URL}/masters/suppliers`).flush([{ id: 's', code: 'S', name: 'Supplier', is_active: true }]);
    await preparing;
    expect(component.proposal.quantity).toBe('4.0002');
    expect(component.proposal.destinationLocationCode).toBe('');
    component.proposal = { requestNumber: 'PR', supplierId: 's', quantity: '3.0001', unitCost: '2.1234',
      reason: 'Reviewed commitments and replenishment', reviewedCommitments: true,
      destinationLocationCode: 'WH-B', expectedReceiptDate: '2099-01-01' };
    const pending = component.createProposal();
    const req = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/proposals`);
    expect(req.request.body).toEqual({ ...component.proposal, locationCode: 'MAIN', expectedRevision: 3 });
    req.flush({ requestNumber: 'PR', status: 'draft' }); await Promise.resolve();
    http.expectOne(`${API_BASE_URL}/inventory/replenishment`).flush([{ ...rule, open_proposal_number: 'PR' }]);
    http.expectOne(`${API_BASE_URL}/masters/products`).flush([]);
    await pending;
    expect(component.message).toContain('borrador'); expect(component.rules[0].open_proposal_number).toBe('PR');
  });
  it('does not report success for a conflicting proposal or reveal it after logout', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const preparing = component.prepareProposal(rule);
    http.expectOne(`${API_BASE_URL}/masters/suppliers`).flush([]); await preparing;
    component.proposal.reviewedCommitments = true;
    const conflict = component.createProposal();
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/proposals`).flush({}, { status: 409, statusText: 'Conflict' });
    await conflict; expect(component.error).toContain('propuesta abierta'); expect(component.message).toBe('');
    const pending = component.createProposal();
    const req = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/proposals`);
    user.set(null); fixture.detectChanges(); req.flush({ requestNumber: 'PR' }); await pending;
    expect(component.proposalRule).toBeNull(); expect(component.message).toBe('');
  });
});
