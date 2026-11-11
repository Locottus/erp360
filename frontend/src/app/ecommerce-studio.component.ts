import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { EmptyStateComponent } from './shared/empty-state.component';

type ThemeTemplate = 'minimal' | 'editorial' | 'bold';
type StoreSection = 'hero' | 'categories' | 'products' | 'newsletter';
type StoreTheme = {
  template: ThemeTemplate;
  brandColor: string;
  accentColor: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroImageUrl: string;
  announcement: string;
  footerText: string;
  sections: StoreSection[];
  showNewsletter: boolean;
};
type StoreSettings = {
  store_name: string;
  store_slug: string;
  currency_code: string;
  default_tax_rate_code: string | null;
  support_email: string | null;
  is_active: boolean;
  theme_json: Partial<StoreTheme> | null;
};
type Product = {
  id: string;
  sku: string;
  name: string;
  unit_price: string;
  is_active: boolean;
  listing_id: string | null;
  slug: string | null;
  title: string | null;
  short_description: string | null;
  long_description: string | null;
  listing_price: string | null;
  compare_at_price: string | null;
  featured_image_url: string | null;
  is_published: boolean | null;
  sort_order: number | null;
  category_code: string | null;
  category_name: string | null;
};
type Category = { id: string; code: string; name: string; description: string | null; is_active: boolean };
type TaxRate = { id: string; code: string; name: string; rate: string; is_active: boolean };
type Subscriber = { id: string; email: string; full_name: string | null; status: string; consent_at: string };

const defaultTheme: StoreTheme = {
  template: 'minimal',
  brandColor: '#2563eb',
  accentColor: '#0f172a',
  heroTitle: 'Una experiencia de compra hecha para ti',
  heroSubtitle: 'Descubre productos seleccionados y compra en unos pocos pasos.',
  heroCtaText: 'Explorar catálogo',
  heroImageUrl: '',
  announcement: '',
  footerText: '',
  sections: ['hero', 'categories', 'products', 'newsletter'],
  showNewsletter: true,
};

@Component({
  selector: 'app-ecommerce-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EmptyStateComponent],
  template: `
    <section class="page-shell">
      <header class="page-header">
        <p class="eyebrow">COMMERCE STUDIO</p>
        <h1>Diseña tu tienda online</h1>
        <p>Configura marca, contenido, catálogo y suscriptores. Los cambios se publican en la tienda de tu empresa.</p>
      </header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) {
        <p class="status status-error" role="alert">Esta área requiere permisos de administrador.</p>
      } @else {
        <nav class="studio-tabs" aria-label="Herramientas de tienda">
          @for (tab of tabs; track tab.id) {
            <button type="button" class="btn" [class.btn-primary]="activeTab === tab.id"
              [class.btn-secondary]="activeTab !== tab.id" (click)="activeTab = tab.id">{{ tab.label }}</button>
          }
        </nav>

        @if (activeTab === 'design') {
          <div class="studio-layout">
            <article class="surface-card editor-panel">
              <h2>Identidad y publicación</h2>
              <form class="form-grid" #settingsForm="ngForm" (ngSubmit)="saveSettings()">
                <label>Nombre de la tienda<input name="storeName" [(ngModel)]="settings.storeName" maxlength="180" required /></label>
                <label>URL pública / identificador
                  <span class="slug-field"><span>/shop/</span><input name="storeSlug" [(ngModel)]="settings.storeSlug" maxlength="64" pattern="[a-z0-9]+([\-][a-z0-9]+)*" required /></span>
                </label>
                <p class="muted">Comparte esta dirección: {{ shareUrl }}</p>
                <label>Moneda
                  <input name="currencyCode" [(ngModel)]="settings.currencyCode" maxlength="8" minlength="3" required />
                </label>
                <label>Impuesto predeterminado
                  <select name="taxRate" [(ngModel)]="settings.defaultTaxRateCode">
                    <option [ngValue]="null">Sin impuesto</option>
                    @for (tax of taxes; track tax.id) { <option [ngValue]="tax.code">{{ tax.code }} · {{ tax.name }} ({{ tax.rate }}%)</option> }
                  </select>
                </label>
                <label>Correo de soporte<input name="supportEmail" [(ngModel)]="settings.supportEmail" type="email" email maxlength="255" /></label>
                <label class="consent"><input name="storeActive" type="checkbox" [(ngModel)]="settings.isActive" /> Publicar tienda</label>

                <h3>Diseño visual</h3>
                <label>Estilo
                  <select name="template" [(ngModel)]="theme.template">
                    <option value="minimal">Minimalista</option><option value="editorial">Editorial</option><option value="bold">Impacto</option>
                  </select>
                </label>
                <div class="color-pair">
                  <label>Color de marca<input name="brandColor" type="color" [(ngModel)]="theme.brandColor" /></label>
                  <label>Color de acento<input name="accentColor" type="color" [(ngModel)]="theme.accentColor" /></label>
                </div>
                <label>Barra de anuncio<input name="announcement" [(ngModel)]="theme.announcement" maxlength="140" placeholder="Envío gratis desde $50" /></label>
                <label>Título principal<input name="heroTitle" [(ngModel)]="theme.heroTitle" maxlength="120" /></label>
                <label>Descripción principal<textarea name="heroSubtitle" [(ngModel)]="theme.heroSubtitle" maxlength="320" rows="3"></textarea></label>
                <label>Texto del botón<input name="heroCtaText" [(ngModel)]="theme.heroCtaText" maxlength="48" /></label>
                <label>Imagen principal (URL HTTPS)
                  <input name="heroImageUrl" [(ngModel)]="theme.heroImageUrl" type="url" maxlength="2048" placeholder="https://..." />
                </label>
                <label>Pie de página<input name="footerText" [(ngModel)]="theme.footerText" maxlength="240" /></label>
                <label class="consent"><input name="newsletter" type="checkbox" [(ngModel)]="theme.showNewsletter" /> Permitir suscripción a novedades con consentimiento</label>
                <h3>Secciones de inicio</h3>
                <p class="muted">Ajusta el orden con las flechas. La vista previa se actualiza al instante.</p>
                <ol class="section-order">
                  @for (section of theme.sections; track section; let i = $index) {
                    <li><span>{{ sectionLabel(section) }}</span>
                      <button type="button" class="btn btn-secondary" (click)="moveSection(i, -1)" [disabled]="i === 0" [attr.aria-label]="'Subir ' + sectionLabel(section)">↑</button>
                      <button type="button" class="btn btn-secondary" (click)="moveSection(i, 1)" [disabled]="i === theme.sections.length - 1" [attr.aria-label]="'Bajar ' + sectionLabel(section)">↓</button>
                    </li>
                  }
                </ol>
                <button class="btn btn-primary" type="submit" [disabled]="busy || settingsForm.invalid">Guardar y publicar</button>
              </form>
            </article>

            <article class="surface-card preview-shell">
              <div class="header-with-action"><div><h2>Vista previa</h2><p class="muted">Vista adaptable · contenido de demostración</p></div>
                <button type="button" class="btn btn-secondary" (click)="mobilePreview = !mobilePreview">{{ mobilePreview ? 'Vista escritorio' : 'Vista móvil' }}</button>
              </div>
              <div class="store-preview" [class.mobile-preview]="mobilePreview"
                [style.--store-brand]="theme.brandColor" [style.--store-accent]="theme.accentColor"
                [class.editorial]="theme.template === 'editorial'" [class.bold]="theme.template === 'bold'">
                @if (theme.announcement) { <div class="preview-announcement">{{ theme.announcement }}</div> }
                @for (section of theme.sections; track section) {
                  @if (section === 'hero') {
                    <section class="preview-hero" [style.background-image]="theme.heroImageUrl ? 'linear-gradient(90deg, rgba(15,23,42,.72), rgba(15,23,42,.16)), url(&quot;' + theme.heroImageUrl + '&quot;)' : null">
                      <div><p class="eyebrow">NUEVA COLECCIÓN</p><h2>{{ theme.heroTitle }}</h2><p>{{ theme.heroSubtitle }}</p><button class="btn btn-primary" type="button">{{ theme.heroCtaText }}</button></div>
                    </section>
                  } @else if (section === 'categories') {
                    <section class="preview-section"><h3>Compra por categoría</h3><div class="preview-chips"><span>Destacados</span><span>Novedades</span><span>Accesorios</span></div></section>
                  } @else if (section === 'products') {
                    <section class="preview-section"><h3>Productos destacados</h3><div class="preview-products">
                      @for (product of previewProducts; track product.id) {
                        <article><div class="preview-product-image" [style.background-image]="product.featured_image_url ? 'url(&quot;' + product.featured_image_url + '&quot;)' : null"><i class="bi bi-image" aria-hidden="true"></i></div><strong>{{ product.title || product.name }}</strong><span>{{ product.listing_price || product.unit_price | number:'1.2-2' }} {{ settings.currencyCode || 'USD' }}</span></article>
                      }
                    </div></section>
                  } @else if (section === 'newsletter' && theme.showNewsletter) {
                    <section class="preview-newsletter"><h3>Ideas y novedades en tu correo</h3><p>Recibe novedades cuando quieras. Siempre puedes solicitar la baja.</p><div class="preview-subscribe"><span>Tu correo electrónico</span><b>Suscribirme</b></div></section>
                  }
                }
                <footer class="preview-footer">{{ theme.footerText || settings.storeName || 'Tu marca · Atención cercana' }} · {{ settings.supportEmail || 'soporte@tuempresa.com' }}</footer>
              </div>
            </article>
          </div>
        }

        @if (activeTab === 'catalog') {
          <div class="panel-grid">
            <article class="surface-card">
              <h2>Publicar o editar un producto</h2>
              <p>El precio publicado es independiente del precio base del ERP. El stock, en cambio, viene del inventario de la empresa.</p>
              <form class="form-grid" #listingForm="ngForm" (ngSubmit)="saveListing()">
                <label>Producto del catálogo ERP
                  <select name="productId" [(ngModel)]="listing.productId" (ngModelChange)="selectProduct($event)" required>
                    <option value="">Selecciona un producto</option>
                    @for (product of products; track product.id) { <option [value]="product.id">{{ product.sku }} · {{ product.name }}{{ product.listing_id ? ' (publicado)' : '' }}</option> }
                  </select>
                </label>
                <label>Título de tienda<input name="title" [(ngModel)]="listing.title" maxlength="180" required /></label>
                <label>Dirección del producto<input name="slug" [(ngModel)]="listing.slug" maxlength="120" pattern="[a-z0-9]+([\-][a-z0-9]+)*" required /></label>
                <label>Categoría
                  <select name="categoryCode" [(ngModel)]="listing.categoryCode">
                    <option value="">Sin categoría</option>@for (category of categories; track category.id) { <option [value]="category.code">{{ category.name }}</option> }
                  </select>
                </label>
                <div class="color-pair">
                  <label>Precio de venta<input name="price" type="number" min="0" step="0.0001" [(ngModel)]="listing.unitPrice" required /></label>
                  <label>Precio anterior opcional<input name="comparePrice" type="number" min="0" step="0.0001" [(ngModel)]="listing.compareAtPrice" /></label>
                </div>
                <label>Resumen<input name="shortDescription" [(ngModel)]="listing.shortDescription" maxlength="500" /></label>
                <label>Descripción completa<textarea name="longDescription" [(ngModel)]="listing.longDescription" maxlength="5000" rows="4"></textarea></label>
                <label>Imagen de producto (URL HTTPS)<input name="imageUrl" type="url" [(ngModel)]="listing.featuredImageUrl" maxlength="2048" /></label>
                <label>Orden en catálogo<input name="sortOrder" type="number" [(ngModel)]="listing.sortOrder" /></label>
                <label class="consent"><input name="isPublished" type="checkbox" [(ngModel)]="listing.isPublished" /> Visible para clientes</label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || listingForm.invalid">Guardar publicación</button>
              </form>
            </article>
            <article class="surface-card">
              <h2>Crear categoría</h2>
              <form class="form-grid" #categoryForm="ngForm" (ngSubmit)="createCategory()">
                <label>Código<input name="categoryCode" [(ngModel)]="category.code" maxlength="32" required /></label>
                <label>Nombre<input name="categoryName" [(ngModel)]="category.name" maxlength="120" required /></label>
                <label>Descripción<input name="categoryDescription" [(ngModel)]="category.description" /></label>
                <button class="btn btn-secondary" type="submit" [disabled]="busy || categoryForm.invalid">Agregar categoría</button>
              </form>
              <h3>Categorías publicadas</h3>
              @if (categories.length) {
                <ul class="simple-list">@for (item of categories; track item.id) { <li><strong>{{ item.name }}</strong><span>{{ item.code }} · {{ item.is_active ? 'Activa' : 'Inactiva' }}</span></li> }</ul>
              } @else { <p class="muted">Aún no hay categorías.</p> }
              <a routerLink="/operations" class="btn btn-secondary">Administrar productos maestros</a>
            </article>
          </div>
          <article class="surface-card">
            <h2>Catálogo sincronizado</h2>
            @if (products.length) {
              <div class="table-scroll"><table class="table-list"><caption>Productos del ERP y publicación de tienda</caption>
                <thead><tr><th scope="col">SKU / producto</th><th scope="col">Precio ERP</th><th scope="col">Precio tienda</th><th scope="col">Categoría</th><th scope="col">Visibilidad</th><th scope="col">Editar</th></tr></thead>
                <tbody>@for (product of products; track product.id) { <tr><th scope="row">{{ product.sku }} · {{ product.name }}</th><td>{{ product.unit_price | number:'1.2-2' }} {{ settings.currencyCode }}</td><td>{{ product.listing_price ? (product.listing_price | number:'1.2-2') : '—' }}</td><td>{{ product.category_name || '—' }}</td><td>{{ product.listing_id ? (product.is_published ? 'Publicado' : 'Oculto') : 'Sin publicar' }}</td><td><button class="btn btn-secondary" type="button" (click)="selectProduct(product.id)">Editar</button></td></tr> }</tbody>
              </table></div>
            } @else { <app-empty-state title="Sin productos maestros" description="Crea primero productos en el módulo de catálogos y luego publícalos aquí." icon="bi-box-seam"></app-empty-state> }
          </article>
        }

        @if (activeTab === 'audience') {
          <article class="surface-card">
            <div class="header-with-action"><div><h2>Audiencia y consentimiento</h2><p>Registro por empresa, fecha/versión de consentimiento y baja revocable.</p></div><button class="btn btn-secondary" type="button" (click)="loadSubscribers()" [disabled]="loading">Actualizar</button></div>
            @if (subscribers.length) {
              <div class="table-scroll"><table class="table-list"><caption>Suscriptores de la empresa actual</caption>
                <thead><tr><th scope="col">Contacto</th><th scope="col">Estado</th><th scope="col">Consentimiento</th><th scope="col">Acción</th></tr></thead>
                <tbody>@for (subscriber of subscribers; track subscriber.id) { <tr><th scope="row">{{ subscriber.full_name || 'Sin nombre' }}<br><small>{{ subscriber.email }}</small></th><td>{{ subscriber.status }}</td><td>{{ subscriber.consent_at | date:'medium' }}</td><td>@if (subscriber.status === 'subscribed') { <button class="btn btn-secondary" type="button" (click)="unsubscribe(subscriber)" [disabled]="busy">Dar de baja</button> }</td></tr> }</tbody>
              </table></div>
            } @else { <app-empty-state title="Todavía no hay suscriptores" description="Las suscripciones con consentimiento aparecerán aquí." icon="bi-envelope"></app-empty-state> }
          </article>
        }
      }
    </section>
  `,
})
export class EcommerceStudioComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly api = API_BASE_URL;
  readonly tabs = [
    { id: 'design', label: 'Diseño del sitio' },
    { id: 'catalog', label: 'Catálogo y productos' },
    { id: 'audience', label: 'Clientes y suscriptores' },
  ];
  activeTab = 'design';
  settings = { storeName: '', storeSlug: '', currencyCode: 'USD', defaultTaxRateCode: null as string | null, supportEmail: '', isActive: true };
  theme: StoreTheme = structuredClone(defaultTheme);
  products: Product[] = [];
  categories: Category[] = [];
  taxes: TaxRate[] = [];
  subscribers: Subscriber[] = [];
  category = { code: '', name: '', description: '' };
  listing = {
    productId: '', slug: '', title: '', categoryCode: '', unitPrice: 0, compareAtPrice: null as number | null,
    shortDescription: '', longDescription: '', featuredImageUrl: '', sortOrder: 100, isPublished: true,
  };
  loading = false;
  busy = false;
  mobilePreview = false;
  error = '';
  message = '';

  ngOnInit() { void this.load(); }

  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get shareUrl() {
    return this.settings.storeSlug
      ? `${typeof location === 'undefined' ? '' : location.origin}/shop/${this.settings.storeSlug}`
      : 'Guarda el identificador de URL para compartir la tienda';
  }
  get previewProducts() { return this.products.filter(product => product.listing_id && product.is_published).slice(0, 3); }

  async load() {
    if (this.loading || !this.isAdmin) return;
    this.loading = true; this.error = '';
    try {
      const [settings, categories, products, taxes, subscribers] = await Promise.all([
        firstValueFrom(this.http.get<StoreSettings | null>(`${this.api}/ecommerce/admin/settings`)),
        firstValueFrom(this.http.get<Category[]>(`${this.api}/ecommerce/admin/categories`)),
        firstValueFrom(this.http.get<Product[]>(`${this.api}/ecommerce/admin/products`)),
        firstValueFrom(this.http.get<TaxRate[]>(`${this.api}/masters/tax-rates`)),
        firstValueFrom(this.http.get<Subscriber[]>(`${this.api}/ecommerce/admin/subscribers`)),
      ]);
      if (settings) {
        this.settings = {
          storeName: settings.store_name,
          storeSlug: settings.store_slug,
          currencyCode: settings.currency_code,
          defaultTaxRateCode: settings.default_tax_rate_code,
          supportEmail: settings.support_email || '',
          isActive: settings.is_active,
        };
        this.theme = { ...defaultTheme, ...(settings.theme_json || {}) };
      }
      this.categories = categories;
      this.products = products;
      this.taxes = taxes.filter(tax => tax.is_active);
      this.subscribers = subscribers;
    } catch (error) {
      this.error = this.errorMessage(error, 'No se pudo cargar el editor de tienda.');
    } finally { this.loading = false; }
  }

  async saveSettings() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/ecommerce/admin/settings`, {
        ...this.settings,
        defaultTaxRateCode: this.settings.defaultTaxRateCode || undefined,
        supportEmail: this.settings.supportEmail.trim() || undefined,
        theme: this.theme,
      }));
      this.message = this.settings.isActive ? 'Diseño guardado y tienda publicada.' : 'Diseño guardado; tienda despublicada.';
    });
  }

  async createCategory() {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/ecommerce/admin/categories`, {
        ...this.category, code: this.category.code.trim().toUpperCase(), name: this.category.name.trim(),
      }));
      this.category = { code: '', name: '', description: '' };
      this.categories = await firstValueFrom(this.http.get<Category[]>(`${this.api}/ecommerce/admin/categories`));
      this.message = 'Categoría agregada.';
    });
  }

  selectProduct(productId: string) {
    const product = this.products.find(item => item.id === productId);
    if (!product) return;
    this.listing = {
      productId: product.id,
      slug: product.slug || this.toSlug(product.name),
      title: product.title || product.name,
      categoryCode: product.category_code || '',
      unitPrice: Number(product.listing_price ?? product.unit_price),
      compareAtPrice: product.compare_at_price ? Number(product.compare_at_price) : null,
      shortDescription: product.short_description || '',
      longDescription: product.long_description || '',
      featuredImageUrl: product.featured_image_url || '',
      sortOrder: product.sort_order ?? 100,
      isPublished: product.is_published ?? true,
    };
    this.activeTab = 'catalog';
  }

  async saveListing() {
    const candidate = this.products.find(product => product.id === this.listing.productId);
    if (this.listing.compareAtPrice !== null && this.listing.compareAtPrice < this.listing.unitPrice) {
      this.error = 'El precio anterior debe ser igual o mayor al precio publicado.'; return;
    }
    if (this.listing.featuredImageUrl && !this.isHttpsUrl(this.listing.featuredImageUrl)) {
      this.error = 'La imagen debe ser una URL HTTPS válida.'; return;
    }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/ecommerce/admin/listings`, {
        ...this.listing,
        categoryCode: this.listing.categoryCode || undefined,
        compareAtPrice: this.listing.compareAtPrice || undefined,
        shortDescription: this.listing.shortDescription.trim() || undefined,
        longDescription: this.listing.longDescription.trim() || undefined,
        featuredImageUrl: this.listing.featuredImageUrl.trim() || undefined,
        isPublished: this.listing.isPublished,
      }));
      this.products = await firstValueFrom(this.http.get<Product[]>(`${this.api}/ecommerce/admin/products`));
      this.message = `${candidate?.name || 'Producto'} publicado actualizado.`;
    });
  }

  async loadSubscribers() {
    try { this.subscribers = await firstValueFrom(this.http.get<Subscriber[]>(`${this.api}/ecommerce/admin/subscribers`)); }
    catch (error) { this.error = this.errorMessage(error, 'No se pudo cargar la audiencia.'); }
  }

  async unsubscribe(subscriber: Subscriber) {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${this.api}/ecommerce/admin/subscribers/${subscriber.id}/unsubscribe`, {}));
      this.subscribers = await firstValueFrom(this.http.get<Subscriber[]>(`${this.api}/ecommerce/admin/subscribers`));
      this.message = `${subscriber.email} se dio de baja.`;
    });
  }

  moveSection(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= this.theme.sections.length) return;
    const next = [...this.theme.sections];
    [next[index], next[target]] = [next[target], next[index]];
    this.theme = { ...this.theme, sections: next };
  }

  sectionLabel(section: StoreSection) {
    return { hero: 'Portada', categories: 'Categorías', products: 'Catálogo', newsletter: 'Novedades' }[section];
  }

  private toSlug(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
  }

  private isHttpsUrl(value: string) {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  }

  private async perform(action: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); }
    catch (error) { this.error = this.errorMessage(error, 'No fue posible guardar los cambios. Revisa los datos e inténtalo de nuevo.'); }
    finally { this.busy = false; }
  }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse && error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo.';
    if (error instanceof HttpErrorResponse && error.status === 403) return 'Tu rol no permite administrar la tienda.';
    if (error instanceof HttpErrorResponse && error.status === 400) return 'La configuración contiene datos no válidos. Revisa campos requeridos, formato y límites.';
    if (error instanceof HttpErrorResponse && error.status === 409) return 'Ese identificador ya existe. Usa otro valor.';
    return fallback;
  }
}
