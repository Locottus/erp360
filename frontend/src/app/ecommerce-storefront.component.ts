import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Product = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  unit_price: string;
  compare_at_price: string | null;
  available_stock: string;
};

type StorefrontResponse = {
  store: {
    store_name: string;
    currency_code: string;
  };
  products: Product[];
};

@Component({
  selector: 'app-ecommerce-storefront',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="store-page">
      <h2>Tienda eCommerce</h2>
      <div class="toolbar">
        <input [(ngModel)]="companyCode" placeholder="Código de empresa (ej. MAIN)" />
        <button type="button" (click)="loadStore()">Cargar tienda</button>
      </div>

      <p *ngIf="error" class="error">{{ error }}</p>

      <div *ngIf="store" class="store-header">
        <h3>{{ store.store.store_name }}</h3>
        <p>Moneda: {{ store.store.currency_code }}</p>
      </div>

      <div class="grid" *ngIf="store">
        <article class="card" *ngFor="let product of store.products">
          <h4>{{ product.title }}</h4>
          <p>{{ product.short_description || 'Producto disponible en catálogo' }}</p>
          <p class="price">{{ product.unit_price }} {{ store.store.currency_code }}</p>
          <p class="stock">Stock: {{ product.available_stock }}</p>
          <button type="button" (click)="addToCart(product.id)">Agregar al carrito</button>
        </article>
      </div>

      <section *ngIf="cartItems.length > 0" class="cart">
        <h3>Carrito</h3>
        <ul>
          <li *ngFor="let item of cartItems">
            {{ item.title }} x {{ item.quantity }} - {{ item.line_total }} {{ store?.store?.currency_code }}
          </li>
        </ul>
        <p><strong>Total:</strong> {{ cartTotal }} {{ store?.store?.currency_code }}</p>

        <div class="checkout">
          <input [(ngModel)]="customerName" placeholder="Nombre cliente" />
          <input [(ngModel)]="customerEmail" placeholder="Correo cliente" />
          <button type="button" (click)="checkout()">Finalizar compra</button>
        </div>
      </section>

      <section *ngIf="store" class="subscription">
        <h3>Suscríbete a novedades</h3>
        <div class="checkout">
          <input [(ngModel)]="subscriberName" placeholder="Tu nombre (opcional)" />
          <input [(ngModel)]="subscriberEmail" placeholder="Tu correo" />
          <button type="button" (click)="subscribe()">Suscribirme</button>
        </div>
        <p *ngIf="subscriptionMessage" class="success">{{ subscriptionMessage }}</p>
      </section>

      <p *ngIf="checkoutMessage" class="success">{{ checkoutMessage }}</p>
    </section>
  `,
  styles: `
    .store-page { max-width: 960px; margin: 1.5rem auto; padding: 0 1rem; }
    .toolbar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .toolbar input { flex: 1; padding: 0.5rem; }
    .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { border: 1px solid #dbe3f0; border-radius: 0.75rem; padding: 1rem; background: #fff; }
    .price { font-weight: 700; margin: 0.35rem 0; }
    .stock { color: #334155; font-size: 0.9rem; }
    .cart { margin-top: 1.5rem; padding: 1rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; }
    .subscription { margin-top: 1.5rem; padding: 1rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; }
    .checkout { display: grid; gap: 0.5rem; max-width: 420px; }
    .checkout input { padding: 0.5rem; }
    .error { color: #b00020; }
    .success { color: #0f766e; font-weight: 600; }
  `,
})
export class EcommerceStorefrontComponent {
  private readonly http = inject(HttpClient);
  private readonly api = 'http://localhost:3000';
  companyCode = '';
  store: StorefrontResponse | null = null;
  error = '';
  checkoutMessage = '';
  subscriptionMessage = '';
  customerName = '';
  customerEmail = '';
  subscriberName = '';
  subscriberEmail = '';
  cartId = '';
  cartToken = '';
  cartItems: Array<{ id: string; title: string; quantity: string; line_total: string }> = [];
  cartTotal = '0';

  async loadStore() {
    this.error = '';
    this.checkoutMessage = '';
    this.subscriptionMessage = '';
    this.store = null;
    this.cartItems = [];
    this.cartTotal = '0';
    this.cartId = '';
    this.cartToken = '';
    const code = this.companyCode.trim();
    if (!code) {
      this.error = 'Debes ingresar el código de empresa.';
      return;
    }
    try {
      const response = await this.http.get<StorefrontResponse>(`${this.api}/ecommerce/storefront/${encodeURIComponent(code)}`).toPromise();
      this.store = response ?? null;
      if (!this.store) {
        this.error = 'No se pudo cargar la tienda.';
      }
    } catch {
      this.error = 'No se encontró una tienda activa para ese código.';
    }
  }

  async addToCart(listingId: string) {
    if (!this.store) {
      return;
    }
    try {
      await this.ensureCart();
      await this.http
        .post<{ items: Array<{ id: string; title: string; quantity: string; line_total: string }>; cart: { grandTotal: string } }>(
          `${this.api}/ecommerce/storefront/${encodeURIComponent(this.companyCode.trim())}/carts/${this.cartId}/items`,
          { listingId, quantity: 1 },
          { headers: { 'x-cart-token': this.cartToken } },
        )
        .toPromise()
        .then((res) => {
          if (!res) {
            return;
          }
          this.cartItems = res.items;
          this.cartTotal = res.cart.grandTotal;
        });
    } catch {
      this.error = 'No fue posible agregar el producto al carrito.';
    }
  }

  async checkout() {
    if (!this.cartId || !this.cartToken) {
      this.error = 'No hay carrito para finalizar.';
      return;
    }
    if (!this.customerName.trim() || !this.customerEmail.trim()) {
      this.error = 'Ingresa nombre y correo para finalizar.';
      return;
    }
    try {
      const response = await this.http
        .post<{ orderNumber: string }>(
          `${this.api}/ecommerce/storefront/${encodeURIComponent(this.companyCode.trim())}/carts/${this.cartId}/checkout`,
          {
            customerName: this.customerName.trim(),
            customerEmail: this.customerEmail.trim(),
          },
          { headers: { 'x-cart-token': this.cartToken } },
        )
        .toPromise();
      this.checkoutMessage = `Orden creada: ${response?.orderNumber ?? 'N/A'}`;
      this.cartItems = [];
      this.cartTotal = '0';
      this.cartId = '';
      this.cartToken = '';
    } catch {
      this.error = 'No fue posible completar la compra.';
    }
  }

  async subscribe() {
    if (!this.companyCode.trim()) {
      this.error = 'Primero carga una tienda.';
      return;
    }
    if (!this.subscriberEmail.trim()) {
      this.error = 'Ingresa un correo para suscribirte.';
      return;
    }
    try {
      await this.http
        .post(
          `${this.api}/ecommerce/storefront/${encodeURIComponent(this.companyCode.trim())}/subscribe`,
          {
            email: this.subscriberEmail.trim(),
            fullName: this.subscriberName.trim() || undefined,
            acceptsMarketing: true,
          },
        )
        .toPromise();
      this.subscriptionMessage = 'Suscripción registrada correctamente.';
      this.subscriberEmail = '';
      this.subscriberName = '';
    } catch {
      this.error = 'No fue posible registrar la suscripción.';
    }
  }

  private async ensureCart() {
    if (this.cartId && this.cartToken) {
      return;
    }
    const cart = await this.http
      .post<{ cartId: string; cartToken: string }>(
        `${this.api}/ecommerce/storefront/${encodeURIComponent(this.companyCode.trim())}/carts`,
        {},
      )
      .toPromise();
    if (!cart?.cartId || !cart?.cartToken) {
      throw new Error('Cart was not created.');
    }
    this.cartId = cart.cartId;
    this.cartToken = cart.cartToken;
  }
}
