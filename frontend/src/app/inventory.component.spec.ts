import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { InventoryComponent } from './inventory.component';

describe('Inventory movement filters', () => {
  let http: HttpTestingController;
  let user: ReturnType<typeof signal<{ roles: string[] }>>;
  beforeEach(() => {
    user = signal({ roles: ['admin'] });
    TestBed.configureTestingModule({ imports: [InventoryComponent], providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: SessionService, useValue: { user } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('starts on the first page when filters change', async () => {
    const component = TestBed.createComponent(InventoryComponent).componentInstance;
    component.movements = { items: [], total: 150, page: 5, pageSize: 25 };
    component.productFilter = 'product'; component.locationCode = 'WH-A';
    const loading = component.applyFilters();
    const movements = http.expectOne(req => req.url === `${API_BASE_URL}/inventory/movements`);
    expect(movements.request.params.get('page')).toBe('1');
    expect(movements.request.params.get('productId')).toBe('product');
    expect(movements.request.params.get('locationCode')).toBe('WH-A');
    movements.flush({ items: [], total: 0, page: 1, pageSize: 25 });
    http.expectOne(req => req.url === `${API_BASE_URL}/inventory/stock`).flush([]);
    http.expectOne(`${API_BASE_URL}/masters/products`).flush([]);
    http.expectOne(`${API_BASE_URL}/inventory/sales-orders`).flush([]);
    await loading;
    expect(component.movements.page).toBe(1);
  });
  it('loads inventory without requesting sales orders for an employee', async () => {
    user.set({ roles: ['employee'] });
    const component = TestBed.createComponent(InventoryComponent).componentInstance;
    const loading = component.refresh();
    http.expectOne(req => req.url === `${API_BASE_URL}/inventory/movements`)
      .flush({ items: [], total: 0, page: 1, pageSize: 25 });
    http.expectOne(req => req.url === `${API_BASE_URL}/inventory/stock`).flush([]);
    http.expectOne(`${API_BASE_URL}/masters/products`).flush([]);
    http.expectNone(`${API_BASE_URL}/inventory/sales-orders`);
    await loading;
    expect(component.error).toBe('');
  });
});