import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EcommerceStorefrontComponent } from './ecommerce-storefront.component';

describe('Storefront process integrity', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EcommerceStorefrontComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('pins cart operations to loaded company and prevents duplicate mutations', async () => {
    const component = TestBed.createComponent(EcommerceStorefrontComponent).componentInstance;
    component.companyCode = 'FIRST';
    const load = component.loadStore();
    http.expectOne('/api/ecommerce/storefront/FIRST').flush({ store: { store_name: 'First', currency_code: 'USD' }, products: [] });
    await load;
    component.companyCode = 'OTHER';
    const adding = component.addToCart('listing');
    await component.addToCart('listing');
    http.expectOne('/api/ecommerce/storefront/FIRST/carts').flush({ cartId: 'cart', cartToken: 'test-cart' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/ecommerce/storefront/FIRST/carts/cart/items').flush({ items: [], cart: { grandTotal: '0' } });
    await adding;
    expect(component.busy).toBeFalse();
  });
  it('requires explicit marketing consent and finite whole quantities', async () => {
    const component = TestBed.createComponent(EcommerceStorefrontComponent).componentInstance;
    component.companyCode = 'STORE';
    const loading = component.loadStore();
    http.expectOne('/api/ecommerce/storefront/STORE').flush({
      store: { store_name: 'Store', company_code: 'STORE', currency_code: 'USD' },
      categories: [],
      products: [{ id: 'p', available_stock: '5' }],
    });
    await loading;
    component.setQuantity('p', Infinity);
    expect(component.getQuantity('p')).toBe(1);
    component.setQuantity('p', 2.8);
    expect(component.getQuantity('p')).toBe(2);
    await component.subscribe();
    expect(component.error).toBeTruthy();
    http.expectNone('/api/ecommerce/storefront/STORE/subscribe');
  });
});
