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
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-commitments`).flush([
      { order_id: 'o', order_number: 'PO-1', supplier_name: 'Supplier', status: 'ordered',
        ordered_quantity: '4.0001', documented_received_quantity: '1.0000', pending_quantity: '3.0001',
        has_legacy: false, over_received: false },
      { order_id: 'o2', order_number: 'PO-2', supplier_name: 'Supplier', status: 'partially_received',
        ordered_quantity: '2.0000', documented_received_quantity: '3.0000', pending_quantity: null,
        has_legacy: true, over_received: true },
    ]);
    await pending; fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PO-1'); expect(text).toContain('Supplier');
    expect(text).toContain('recepción histórica sin detalle'); expect(text).toContain('sobre-recepción');
  });
  it('clears and discards a late breakdown after identity changes', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.showCommitments(rule);
    const req = http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-commitments`);
    user.set(null); fixture.detectChanges(); req.flush([{ order_id: 'o' }]); await pending;
    expect(component.commitments).toEqual([]); expect(component.commitmentProduct).toBe('');
  });
  it('reports breakdown loading errors without presenting an empty result as success', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const pending = component.showCommitments(rule);
    http.expectOne(`${API_BASE_URL}/inventory/replenishment/p/purchase-commitments`)
      .flush({}, { status: 500, statusText: 'Error' });
    await pending;
    expect(component.error).toContain('No se pudieron cargar'); expect(component.commitmentProduct).toBe('');
  });
  it('creates a reviewed proposal with explicit exact quantity and cost', async () => {
    const fixture = await setup(); const component = fixture.componentInstance;
    const preparing = component.prepareProposal(rule);
    http.expectOne(`${API_BASE_URL}/masters/suppliers`).flush([{ id: 's', code: 'S', name: 'Supplier', is_active: true }]);
    await preparing;
    expect(component.proposal.quantity).toBe('4.0002');
    component.proposal = { requestNumber: 'PR', supplierId: 's', quantity: '3.0001', unitCost: '2.1234',
      reason: 'Reviewed commitments and replenishment', reviewedCommitments: true };
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
