import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { PurchaseReceivingComponent } from './purchase-receiving.component';

describe('Purchase receiving lifecycle and quantities', () => {
  const admin: AuthUser = { id: 'user-1', companyId: 'company-1', email: 'admin@example.test', fullName: 'Demo admin', roles: ['admin'] };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  const orders = `${API_BASE_URL}/commerce/purchases/requests`;
  const detailUrl = `${API_BASE_URL}/inventory/purchases/orders/order-1/receipts`;
  const detail = {
    order: { id: 'order-1', order_number: 'PO-1', status: 'ordered', currency_code: 'USD' },
    lines: [{ id: 'line-1', product_name: 'Product', quantity: '5', unit_cost: '10', received: '0', remaining: '5' }],
    receipts: [], legacyReceipts: [], returns: [],
  };
  beforeEach(() => {
    user = signal<AuthUser | null>(null);
    TestBed.configureTestingModule({
      imports: [PurchaseReceivingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SessionService, useValue: { user } }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('waits for session restoration and discards data from a previous identity', async () => {
    const fixture = TestBed.createComponent(PurchaseReceivingComponent);
    fixture.detectChanges(); http.expectNone(orders);
    user.set(admin); fixture.detectChanges();
    const pending = http.expectOne(orders);
    fixture.componentInstance.receipt.reference = 'previous-reference';
    user.set({ ...admin, id: 'user-2', companyId: 'company-2' }); fixture.detectChanges();
    const current = http.expectOne(orders);
    pending.flush([{ purchase_order_id: 'old-order', purchase_order_status: 'ordered' }]);
    current.flush([]);
    await fixture.whenStable();
    expect(fixture.componentInstance.purchases).toEqual([]);
    expect(fixture.componentInstance.receipt.reference).toBe('');
    expect(fixture.componentInstance.busy).toBe(false);
  });

  it('sends only positive selected quantities, requires confirmation, and refreshes the new balance', async () => {
    const fixture = TestBed.createComponent(PurchaseReceivingComponent);
    user.set(admin); fixture.detectChanges();
    http.expectOne(orders).flush([{ purchase_order_id: 'order-1', purchase_order_status: 'ordered' }]);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const selected = component.selectOrder('order-1');
    http.expectOne(detailUrl).flush(detail); await selected;
    component.receiveQuantities['line-1'] = 2;
    component.receiveQuantities['zero'] = 0;
    await component.receive();
    http.expectNone(detailUrl);
    expect(component.error).toContain('confirma');
    component.receipt = { reference: 'RCV-1', locationCode: 'DOCK', confirmed: true };
    const received = component.receive();
    const req = http.expectOne(detailUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reference: 'RCV-1', locationCode: 'DOCK', lines: [{ lineId: 'line-1', quantity: 2 }] });
    req.flush({ replayed: false });
    await Promise.resolve();
    http.expectOne(orders).flush([{ purchase_order_id: 'order-1', purchase_order_status: 'partially_received' }]);
    await Promise.resolve();
    http.expectOne(detailUrl).flush({ ...detail, order: { ...detail.order, status: 'partially_received' } });
    await received;
    expect(component.receiveQuantities['line-1']).toBe(0);
    expect(component.receipt.confirmed).toBe(false);
    expect(component.message).toContain('inventario actualizado');
  });
});
