import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { EmptyStateComponent } from './shared/empty-state.component';

type StoreTheme = {
  template?: string;
  brandColor?: string;
  accentColor?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroImageUrl?: string;
  announcement?: string;
  footerText?: string;
  sections?: string[];
  showNewsletter?: boolean;
};
type Product = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  long_description: string | null;
  unit_price: string;
  compare_at_price: string | null;
  featured_image_url: string | null;
  category_code: string | null;
  available_stock: string;
};
type StorefrontResponse = {
  store: {
    store_name: string;
    store_slug: string;
    company_code: string;
    currency_code: string;
    support_email: string | null;
    theme_json: StoreTheme;
  };
  categories: Array<{ code: string; name: string; description: string | null }>;
  products: Product[];
};
type SortMode = 'name-asc' | 'price-asc' | 'price-desc' | 'stock-desc';
type CartItem = { id: string; title: string; quantity: string; line_total: string };
type CartState = { cartId: string; cartToken: string };

const defaultSections = ['hero', 'categories', 'products', 'newsletter'];

@Component({
  selector: 'app-ecommerce-storefront',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    @if (store; as shop) {
      <section class="storefront-page" [style.--store-brand]="theme.brandColor || '#2563eb'"
        [style.--store-accent]="theme.accentColor || '#0f172a'"
        [class.editorial]="theme.template === 'editorial'" [class.bold]="theme.template === 'bold'">
        @if (theme.announcement) { <div class="store-announcement">{{ theme.announcement }}</div> }
        <header class="store-header">
          <a class="store-brand" href="#store-home" aria-label="Ir al inicio de la tienda">
            <span class="store-brand-mark"><i class="bi bi-bag-heart" aria-hidden="true"></i></span>
            <span><strong>{{ shop.store.store_name }}</strong><small>Compra online</small></span>
          </a>
          <div class="store-header-links"><a href="#store-products">Catálogo</a><a href="#store-footer">Contacto</a><button type="button" class="btn btn-secondary" (click)="scrollToCart()" [disabled]="!cartItems.length"><i class="bi bi-bag" aria-hidden="true"></i> Carrito <span class="cart-count">{{ cartItems.length }}</span></button></div>
        </header>

        @for (section of storeSections; track section) {
          @if (section === 'hero') {
            <section class="store-hero" id="store-home" [class.has-image]="theme.heroImageUrl"
              [style.background-image]="theme.heroImageUrl ? 'linear-gradient(90deg, rgba(15,23,42,.78), rgba(15,23,42,.12)), url(&quot;' + theme.heroImageUrl + '&quot;)' : null">
              <div class="store-hero-copy"><p class="eyebrow">COLECCIÓN DE {{ shop.store.store_name | uppercase }}</p>
                <h1>{{ theme.heroTitle || shop.store.store_name }}</h1><p>{{ theme.heroSubtitle || 'Descubre productos seleccionados para ti.' }}</p>
                <a class="btn btn-primary" href="#store-products">{{ theme.heroCtaText || 'Explorar catálogo' }} <i class="bi bi-arrow-down" aria-hidden="true"></i></a>
              </div>
              <div class="hero-aside"><span>Compra con confianza</span><strong>Productos · servicio · comunidad</strong></div>
            </section>
          } @else if (section === 'categories') {
            @if (shop.categories.length) {
              <section class="store-section category-section" aria-label="Categorías de productos">
                <div class="section-heading"><div><p class="eyebrow">EXPLORA</p><h2>Compra por categoría</h2></div><p>Encuentra lo que buscas con una selección curada.</p></div>
                <div class="store-categories"><button type="button" class="category-chip" [class.selected]="activeCategory === ''" (click)="chooseCategory('')">Todo</button>
                  @for (category of shop.categories; track category.code) { <button type="button" class="category-chip" [class.selected]="activeCategory === category.code" (click)="chooseCategory(category.code)">{{ category.name }}</button> }
                </div>
              </section>
            }
          } @else if (section === 'products') {
            <section class="store-section" id="store-products">
              <div class="section-heading"><div><p class="eyebrow">HECHO PARA DESCUBRIR</p><h2>Nuestro catálogo</h2></div><p>{{ filteredProducts.length }} productos disponibles</p></div>
              <div class="store-tools">
                <label class="store-search"><i class="bi bi-search" aria-hidden="true"></i><span class="sr-only">Buscar productos</span><input [(ngModel)]="searchTerm" (ngModelChange)="resetPage()" placeholder="Buscar por producto o descripción" /></label>
                <label class="sort-control"><span>Ordenar</span><select [(ngModel)]="sortMode" (ngModelChange)="resetPage()"><option value="name-asc">Recomendados</option><option value="price-asc">Precio: menor a mayor</option><option value="price-desc">Precio: mayor a menor</option><option value="stock-desc">Disponibilidad</option></select></label>
                <label class="sort-control"><span>Ver</span><select [(ngModel)]="pageSize" (ngModelChange)="resetPage()"><option [ngValue]="8">8 productos</option><option [ngValue]="12">12 productos</option><option [ngValue]="24">24 productos</option></select></label>
              </div>
              @if (loadingStore) { <div class="store-product-grid" aria-busy="true" aria-label="Cargando catálogo">@for (slot of skeletonSlots; track slot) { <article class="surface-card skeleton-box"></article> }</div> }
              @else if (pagedProducts.length) {
                <div class="store-product-grid">
                  @for (product of pagedProducts; track product.id) {
                    <article class="store-product-card">
                      <div class="product-image-wrap">
                        @if (product.featured_image_url) { <img class="product-image" [src]="product.featured_image_url" [alt]="product.title" loading="lazy" /> }
                        @else { <div class="product-image-placeholder" aria-hidden="true"><i class="bi bi-image"></i><span>{{ shop.store.store_name }}</span></div> }
                        @if (+product.available_stock <= 0) { <span class="product-badge sold-out">Agotado</span> }
                        @else if (product.compare_at_price && +product.compare_at_price > +product.unit_price) { <span class="product-badge">Oferta</span> }
                      </div>
                      <div class="product-info"><p class="product-category">{{ categoryName(product.category_code) }}</p><h3>{{ product.title }}</h3>
                        <p class="product-description">{{ product.short_description || product.long_description || 'Una selección de calidad para tu día a día.' }}</p>
                        <div class="product-buy"><div><strong>{{ product.unit_price | currency:shop.store.currency_code:'symbol':'1.2-2' }}</strong>
                          @if (product.compare_at_price && +product.compare_at_price > +product.unit_price) { <del>{{ product.compare_at_price | currency:shop.store.currency_code:'symbol':'1.2-2' }}</del> }
                        </div><button class="btn btn-primary" type="button" (click)="addToCart(product.id)" [disabled]="busy || +product.available_stock <= 0"><i class="bi bi-plus-lg" aria-hidden="true"></i><span class="sr-only">Agregar {{ product.title }} al carrito</span><span aria-hidden="true">Agregar</span></button></div>
                        @if (+product.available_stock > 0) { <label class="quantity-control">Cantidad<input type="number" min="1" [max]="+product.available_stock" step="1" [ngModel]="getQuantity(product.id)" (ngModelChange)="setQuantity(product.id, $event)" /></label> }
                      </div>
                    </article>
                  }
                </div>
                @if (totalPages > 1) { <nav class="pagination store-pagination" aria-label="Paginación del catálogo"><button type="button" class="btn btn-secondary" (click)="previousPage()" [disabled]="currentPage === 1">Anterior</button><span>Página {{ displayedPage }} de {{ totalPages }}</span><button type="button" class="btn btn-secondary" (click)="nextPage()" [disabled]="currentPage === totalPages">Siguiente</button></nav> }
              } @else { <app-empty-state title="No encontramos productos" description="Prueba con otra búsqueda o categoría, o vuelve a explorar todo el catálogo." icon="bi-search"></app-empty-state> }
            </section>
          } @else if (section === 'newsletter' && theme.showNewsletter !== false) {
            <section class="newsletter-section"><div><p class="eyebrow">NOTAS DE LA TIENDA</p><h2>Ideas y novedades, sin ruido.</h2><p>Déjanos tu correo si quieres recibir noticias. Puedes darte de baja cuando quieras.</p></div>
              <form class="newsletter-form" #subscribeForm="ngForm" (ngSubmit)="subscribe()"><label><span class="sr-only">Tu nombre</span><input name="subscriberName" [(ngModel)]="subscriberName" placeholder="Tu nombre (opcional)" autocomplete="name" /></label><label><span class="sr-only">Tu correo</span><input name="subscriberEmail" [(ngModel)]="subscriberEmail" type="email" email required placeholder="Tu correo electrónico" autocomplete="email" /></label>
                <label class="consent"><input name="consent" type="checkbox" [(ngModel)]="acceptsMarketing" required /> Acepto recibir novedades de esta empresa.</label><button type="submit" class="btn btn-primary" [disabled]="busy || subscribeForm.invalid">Suscribirme <i class="bi bi-arrow-right" aria-hidden="true"></i></button>
              </form>
            </section>
          }
        }

        @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
        @if (subscriptionMessage) { <p class="status status-success" role="status">{{ subscriptionMessage }}</p> }
        @if (checkoutMessage) { <p class="status status-success checkout-feedback" role="status"><i class="bi bi-check-circle" aria-hidden="true"></i> {{ checkoutMessage }}</p> }

        <section id="store-cart" class="store-cart">
          <div class="cart-heading"><div><p class="eyebrow">TU SELECCIÓN</p><h2>Carrito de compra</h2></div><span>{{ cartItems.length }} líneas</span></div>
          @if (cartItems.length) {
            <div class="store-cart-layout"><div class="table-scroll"><table class="table-list"><caption>Artículos de tu pedido</caption><thead><tr><th scope="col">Producto</th><th scope="col">Cantidad</th><th scope="col">Importe</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody>@for (item of cartItems; track item.id) { <tr><th scope="row">{{ item.title }}</th><td>{{ item.quantity }}</td><td>{{ item.line_total | currency:shop.store.currency_code:'symbol':'1.2-2' }}</td><td><button class="btn btn-secondary" type="button" (click)="removeItem(item.id)" [disabled]="busy" [attr.aria-label]="'Eliminar ' + item.title">Quitar</button></td></tr> }</tbody>
            </table></div>
            <aside class="cart-checkout"><p>Total del pedido <strong>{{ cartTotal | currency:shop.store.currency_code:'symbol':'1.2-2' }}</strong></p><form class="form-grid" #checkoutForm="ngForm" (ngSubmit)="checkout()">
              <label>Nombre<input name="customerName" [(ngModel)]="customerName" required autocomplete="name" /></label><label>Correo electrónico<input name="customerEmail" [(ngModel)]="customerEmail" type="email" email required autocomplete="email" /></label>
              <p>Al confirmar se crea un pedido en {{ shop.store.store_name }} y se reserva el inventario disponible. No se realiza un cobro en línea.</p>
              <button type="submit" class="btn btn-primary" [disabled]="busy || checkoutForm.invalid">Confirmar pedido <i class="bi bi-arrow-right" aria-hidden="true"></i></button>
            </form></aside></div>
          } @else { <p class="empty-cart">Tu carrito está esperando algo especial. <a href="#store-products">Explora el catálogo.</a></p> }
        </section>

        <footer id="store-footer" class="store-footer"><div><strong>{{ shop.store.store_name }}</strong><p>{{ theme.footerText || 'Gracias por apoyar nuestro negocio.' }}</p></div>
          <div><span>¿Necesitas ayuda?</span>@if (shop.store.support_email) { <a [href]="'mailto:' + shop.store.support_email">{{ shop.store.support_email }}</a> } @else { <span>Contacta a la empresa</span> }</div>
          <small>Los pedidos están sujetos a disponibilidad y confirmación de la empresa.</small>
        </footer>
      </section>
    } @else {
      <section class="page-shell">
        <header class="page-header"><p class="eyebrow">TIENDA ONLINE</p><h1>Encuentra tu próxima compra</h1><p>Carga una tienda por código o abre su enlace compartido.</p></header>
        <article class="surface-card"><div class="inline-form"><label>Código de empresa<input [(ngModel)]="companyCode" placeholder="Ej. MAIN" [disabled]="busy || loadingStore" /></label>
          <button type="button" class="btn btn-primary" (click)="loadStore()" [disabled]="loadingStore || busy">{{ loadingStore ? 'Cargando…' : 'Cargar tienda' }}</button></div></article>
        @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
        @if (loadingStore) { <app-empty-state title="Cargando tienda" description="Estamos preparando el catálogo…" icon="bi-hourglass-split"></app-empty-state> }
        @if (!loadingStore && !error) { <app-empty-state icon="bi-shop-window" title="Explora tiendas empresariales" description="Ingresa el código de empresa o usa el enlace /shop/identificador que te compartieron."></app-empty-state> }
      </section>
    }
  `,
})
export class EcommerceStorefrontComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = API_BASE_URL;
  companyCode = '';
  store: StorefrontResponse | null = null;
  loadingStore = false;
  busy = false;
  acceptsMarketing = false;
  private activeCompanyCode = '';
  private cartCompanyCode = '';
  private loadedSlug = '';
  private storeLoadSequence = 0;
  error = '';
  checkoutMessage = '';
  subscriptionMessage = '';
  customerName = '';
  customerEmail = '';
  subscriberName = '';
  subscriberEmail = '';
  searchTerm = '';
  activeCategory = '';
  sortMode: SortMode = 'name-asc';
  pageSize = 12;
  currentPage = 1;
  cartId = '';
  cartToken = '';
  cartItems: CartItem[] = [];
  cartTotal = '0';
  productQuantities: Record<string, number> = {};
  skeletonSlots = Array.from({ length: 8 }, (_, index) => index + 1);

  ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const storeSlug = params.get('storeSlug');
      if (storeSlug && storeSlug !== this.loadedSlug) {
        this.loadedSlug = storeSlug;
        void this.loadBySlug(storeSlug);
      } else if (!storeSlug && this.loadedSlug) {
        this.loadedSlug = '';
        this.store = null;
        this.activeCompanyCode = '';
        this.clearCartState();
      }
    });
  }

  get theme() { return this.store?.store.theme_json ?? {}; }
  get storeSections() { return this.theme.sections?.length ? this.theme.sections : defaultSections; }

  get filteredProducts() {
    const products = this.store?.products ?? [];
    const search = this.searchTerm.trim().toLowerCase();
    const filtered = products.filter(product =>
      (!this.activeCategory || product.category_code === this.activeCategory) &&
      (!search || `${product.title} ${product.short_description ?? ''} ${product.long_description ?? ''}`.toLowerCase().includes(search)),
    );
    return filtered.sort((a, b) => {
      if (this.sortMode === 'name-asc') return a.title.localeCompare(b.title);
      if (this.sortMode === 'price-asc') return Number(a.unit_price) - Number(b.unit_price);
      if (this.sortMode === 'price-desc') return Number(b.unit_price) - Number(a.unit_price);
      return Number(b.available_stock) - Number(a.available_stock);
    });
  }

  get totalPages() { return Math.max(1, Math.ceil(this.filteredProducts.length / this.pageSize)); }
  get pagedProducts() {
    const start = (Math.min(this.currentPage, this.totalPages) - 1) * this.pageSize;
    return this.filteredProducts.slice(start, start + this.pageSize);
  }
  get displayedPage() { return Math.min(this.currentPage, this.totalPages); }

  categoryName(code: string | null) {
    return this.store?.categories.find(category => category.code === code)?.name || 'Selección';
  }

  chooseCategory(code: string) { this.activeCategory = code; this.resetPage(); }
  setQuantity(productId: string, value: number | string) {
    const maximum = Number(this.store?.products.find(item => item.id === productId)?.available_stock ?? 1);
    const numeric = Number(value);
    this.productQuantities[productId] = Number.isFinite(numeric) ? Math.min(maximum, Math.max(1, Math.floor(numeric))) : 1;
  }
  getQuantity(productId: string) { return this.productQuantities[productId] || 1; }
  previousPage() { this.currentPage = Math.max(1, this.currentPage - 1); }
  nextPage() { this.currentPage = Math.min(this.totalPages, this.currentPage + 1); }
  resetPage() { this.currentPage = 1; }
  scrollToCart() { document.getElementById('store-cart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  async loadStore() {
    const code = this.companyCode.trim();
    if (!code) { this.error = 'Debes ingresar el código de empresa.'; return; }
    await this.loadStoreFrom(`${this.api}/ecommerce/storefront/${encodeURIComponent(code)}`, code);
  }

  private async loadBySlug(storeSlug: string) {
    await this.loadStoreFrom(`${this.api}/ecommerce/storefront/by-slug/${encodeURIComponent(storeSlug)}`);
  }

  private async loadStoreFrom(url: string, codeHint?: string) {
    const sequence = ++this.storeLoadSequence;
    this.loadingStore = true; this.error = ''; this.checkoutMessage = ''; this.subscriptionMessage = '';
    this.store = null; this.activeCompanyCode = ''; this.clearCartState();
    try {
      const response = await firstValueFrom(this.http.get<StorefrontResponse>(url));
      if (sequence !== this.storeLoadSequence) return;
      this.store = response;
      this.activeCompanyCode = response.store.company_code || codeHint || '';
      this.companyCode = this.activeCompanyCode;
      this.searchTerm = ''; this.activeCategory = ''; this.currentPage = 1;
      this.productQuantities = {};
      await this.restoreCart(this.activeCompanyCode, sequence);
    } catch (error) {
      if (sequence === this.storeLoadSequence) {
        this.store = null;
        this.error = error instanceof HttpErrorResponse && error.status === 404
          ? 'No se encontró una tienda activa con ese enlace.'
          : 'No se pudo cargar la tienda. Revisa la conexión e inténtalo de nuevo.';
      }
    } finally {
      if (sequence === this.storeLoadSequence) this.loadingStore = false;
    }
  }

  async addToCart(listingId: string) {
    if (!this.store || this.busy) return;
    const companyCode = this.activeCompanyCode;
    if (!companyCode) return;
    this.busy = true; this.error = '';
    try {
      const cart = await this.ensureCart(companyCode);
      const quantity = this.productQuantities[listingId] ?? 1;
      const response = await firstValueFrom(this.http.post<{ items: CartItem[]; cart: { grandTotal: string } }>(
        `${this.api}/ecommerce/storefront/${encodeURIComponent(companyCode)}/carts/${cart.cartId}/items`,
        { listingId, quantity }, { headers: { 'x-cart-token': cart.cartToken } },
      ));
      if (this.activeCompanyCode === companyCode) {
        this.cartItems = response.items; this.cartTotal = response.cart.grandTotal;
        await this.persistCart(companyCode, cart);
      }
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo agregar el producto. Comprueba el stock y vuelve a intentar.'); }
    finally { this.busy = false; }
  }

  async checkout() {
    if (this.busy) return;
    if (!this.cartId || !this.cartToken || this.cartCompanyCode !== this.activeCompanyCode) {
      this.error = 'No hay un carrito válido. Vuelve a agregar los productos.'; return;
    }
    if (!this.customerName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.customerEmail.trim())) {
      this.error = 'Ingresa nombre y correo válidos para confirmar el pedido.'; return;
    }
    this.error = ''; this.busy = true;
    const companyCode = this.activeCompanyCode;
    const cart = { cartId: this.cartId, cartToken: this.cartToken };
    try {
      const result = await firstValueFrom(this.http.post<{ orderNumber: string }>(
        `${this.api}/ecommerce/storefront/${encodeURIComponent(companyCode)}/carts/${cart.cartId}/checkout`,
        { customerName: this.customerName.trim(), customerEmail: this.customerEmail.trim() },
        { headers: { 'x-cart-token': cart.cartToken } },
      ));
      if (!result.orderNumber) throw new Error('Checkout response did not include the order number.');
      if (this.activeCompanyCode === companyCode) {
        this.checkoutMessage = `Pedido ${result.orderNumber} confirmado. La empresa dará seguimiento al despacho.`;
        this.clearCartState();
        this.customerName = ''; this.customerEmail = '';
        sessionStorage.removeItem(this.cartStorageKey(companyCode));
      }
    } catch (error) { this.error = this.errorMessage(error, 'No fue posible confirmar. Actualiza el carrito antes de volver a intentar.'); }
    finally { this.busy = false; }
  }

  async subscribe() {
    if (this.busy || !this.store || !this.activeCompanyCode) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.subscriberEmail.trim()) || !this.acceptsMarketing) {
      this.error = 'Ingresa un correo válido y acepta recibir novedades.'; return;
    }
    this.error = ''; this.subscriptionMessage = ''; this.busy = true;
    try {
      await firstValueFrom(this.http.post(`${this.api}/ecommerce/storefront/${encodeURIComponent(this.activeCompanyCode)}/subscribe`, {
        email: this.subscriberEmail.trim(), fullName: this.subscriberName.trim() || undefined, acceptsMarketing: true,
      }));
      this.subscriptionMessage = 'Suscripción registrada. Gracias por unirte a la comunidad.';
      this.subscriberEmail = ''; this.subscriberName = ''; this.acceptsMarketing = false;
    } catch (error) { this.error = this.errorMessage(error, 'No fue posible registrar la suscripción. Intenta de nuevo.'); }
    finally { this.busy = false; }
  }

  async removeItem(itemId: string) {
    if (this.busy) return;
    const companyCode = this.activeCompanyCode;
    const cartId = this.cartId;
    const cartToken = this.cartToken;
    if (!companyCode || !cartId || !cartToken) return;
    this.busy = true; this.error = '';
    try {
      const response = await firstValueFrom(this.http.delete<{ items: CartItem[]; cart: { grandTotal: string } }>(
        `${this.api}/ecommerce/storefront/${encodeURIComponent(companyCode)}/carts/${cartId}/items/${itemId}`,
        { headers: { 'x-cart-token': cartToken } },
      ));
      if (this.activeCompanyCode !== companyCode) return;
      this.cartItems = response.items; this.cartTotal = response.cart.grandTotal;
      if (!response.items.length) {
        this.clearCartState();
        sessionStorage.removeItem(this.cartStorageKey(companyCode));
      } else await this.persistCart(companyCode, { cartId, cartToken });
    } catch (error) { this.error = this.errorMessage(error, 'No se pudo actualizar el carrito. Recarga la tienda antes de reintentar.'); }
    finally { this.busy = false; }
  }

  private async ensureCart(companyCode: string): Promise<CartState> {
    if (this.cartCompanyCode === companyCode && this.cartId && this.cartToken) {
      return { cartId: this.cartId, cartToken: this.cartToken };
    }
    const cart = await firstValueFrom(this.http.post<CartState>(`${this.api}/ecommerce/storefront/${encodeURIComponent(companyCode)}/carts`, {}));
    if (!cart.cartId || !cart.cartToken) throw new Error('Cart service returned an invalid session.');
    if (this.activeCompanyCode === companyCode) {
      this.cartId = cart.cartId; this.cartToken = cart.cartToken; this.cartCompanyCode = companyCode;
      await this.persistCart(companyCode, cart);
    }
    return cart;
  }

  private async restoreCart(companyCode: string, sequence: number) {
    if (!companyCode) return;
    const raw = sessionStorage.getItem(this.cartStorageKey(companyCode));
    if (!raw) {
      if (sequence === this.storeLoadSequence) this.clearCartState();
      return;
    }
    try {
      const saved = JSON.parse(raw) as CartState;
      if (!saved.cartId || !saved.cartToken) throw new Error('Invalid stored cart.');
      const response = await firstValueFrom(this.http.get<{ items: CartItem[]; cart: { status: string; grandTotal: string } }>(
        `${this.api}/ecommerce/storefront/${encodeURIComponent(companyCode)}/carts/${saved.cartId}`,
        { headers: { 'x-cart-token': saved.cartToken } },
      ));
      if (sequence !== this.storeLoadSequence) return;
      if (response.cart.status !== 'open') {
        sessionStorage.removeItem(this.cartStorageKey(companyCode));
        this.clearCartState();
        return;
      }
      this.cartId = saved.cartId; this.cartToken = saved.cartToken;
      this.cartCompanyCode = companyCode;
      this.cartItems = response.items; this.cartTotal = response.cart.grandTotal;
    } catch {
      if (sequence !== this.storeLoadSequence) return;
      sessionStorage.removeItem(this.cartStorageKey(companyCode));
      this.clearCartState();
    }
  }

  private async persistCart(companyCode: string, cart: CartState) {
    if (cart.cartId && cart.cartToken) {
      sessionStorage.setItem(this.cartStorageKey(companyCode), JSON.stringify(cart));
    }
  }

  private clearCartState() {
    this.cartId = ''; this.cartToken = ''; this.cartCompanyCode = '';
    this.cartItems = []; this.cartTotal = '0';
  }

  private cartStorageKey(companyCode = this.activeCompanyCode) { return `erp360.cart:${companyCode}`; }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse && error.status === 400) return 'El carrito cambió o el producto no tiene stock suficiente. Revisa cantidades y catálogo.';
    if (error instanceof HttpErrorResponse && error.status === 401) return 'La sesión del carrito venció. Crea un carrito nuevo.';
    if (error instanceof HttpErrorResponse && error.status === 404) return 'El producto o carrito ya no está disponible. Actualiza la tienda.';
    return fallback;
  }
}
