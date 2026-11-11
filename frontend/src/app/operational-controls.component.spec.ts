import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { AuthUser, SessionService } from './core/session.service';
import { OperationalControlsComponent } from './operational-controls.component';

describe('Supplier credit recovery UI', () => {
  const admin: AuthUser = { id: 'user', companyId: 'company', email: 'admin@example.test', fullName: 'Admin', roles: ['admin'] };
  const payable = { id: 'purchase', order_number: 'PO', supplier_name: 'Supplier', grand_total: '10', total_paid: '10', total_returned: '5', total_refunded: '0', balance_due: '-5', is_posted: true };
  let user: ReturnType<typeof signal<AuthUser | null>>;
  let http: HttpTestingController;
  beforeEach(() => {
    user = signal<AuthUser | null>(admin);
    TestBed.configureTestingModule({ imports: [OperationalControlsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SessionService, useValue: { user } }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function flushLists() {
    const pending = http.match(req => req.method === 'GET');
    expect(pending.length).toBe(8);
    for (const req of pending) req.flush(req.request.url.endsWith('payables') ? [payable] : []);
  }
  it('requires received-money confirmation, limits recovery and resets after successful write', async () => {
    const fixture = TestBed.createComponent(OperationalControlsComponent);
    fixture.detectChanges(); flushLists(); await fixture.whenStable();
    const component = fixture.componentInstance;
    component.supplierRecovery = { orderId: 'purchase', reference: 'BANK-1', amount: 3, reason: 'Confirmed credit refund received', confirmed: false };
    expect(component.supplierRecoveryLimit).toBe(5);
    expect(component.recoverablePayables).toHaveSize(1);
    await component.receiveSupplierRefund();
    http.expectNone(`${API_BASE_URL}/accounting/purchase-orders/purchase/refunds`);
    component.supplierRecovery.confirmed = true;
    const recovery = component.receiveSupplierRefund();
    const req = http.expectOne(`${API_BASE_URL}/accounting/purchase-orders/purchase/refunds`);
    expect(req.request.body).toEqual({ reference: 'BANK-1', amount: 3, reason: 'Confirmed credit refund received' });
    req.flush({ replayed: false }); await Promise.resolve();
    flushLists(); await recovery;
    expect(component.supplierRecovery.amount).toBeNull();
    expect(component.supplierRecovery.confirmed).toBe(false);
    expect(component.message).toContain('asiento registrados');
  });
  it('clears history and ignores a pending history response from a previous identity', async () => {
    const fixture = TestBed.createComponent(OperationalControlsComponent);
    fixture.detectChanges(); flushLists(); await fixture.whenStable();
    const component = fixture.componentInstance;
    const history = component.loadSupplierRefunds('purchase');
    const req = http.expectOne(`${API_BASE_URL}/accounting/purchase-orders/purchase/refunds`);
    user.set(null); fixture.detectChanges();
    req.flush([{ id: 'old', reference: 'private previous transaction', amount: '3', reason: 'Previous identity', created_at: '' }]); await history;
    expect(component.supplierHistory).toEqual([]);
    expect(component.supplierHistoryId).toBe('');
    expect(component.supplierRecovery.reason).toBe('');
  });
});
