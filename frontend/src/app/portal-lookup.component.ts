import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { EmptyStateComponent } from './shared/empty-state.component';

type DocumentRow = { status: string; quotation_number?: string; order_number?: string; invoice_number?: string; grand_total: string };
type PortalSummary = {
  customer: { code: string; name: string; email: string | null };
  quotations: DocumentRow[]; orders: DocumentRow[]; invoices: DocumentRow[];
};

@Component({
  selector: 'app-portal-lookup', standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">AUTOSERVICIO SEGURO</p><h1>Portal de cliente</h1>
        <p>Consulta tus documentos con el acceso temporal facilitado por la empresa.</p></header>
      <article class="surface-card">
        <form class="form-grid" (ngSubmit)="loadSummary()">
          <label for="portal-token">Token de acceso privado</label>
          <input id="portal-token" name="token" [(ngModel)]="token" type="password" autocomplete="off" required aria-describedby="token-help" />
          <p id="token-help" class="muted">No se guarda en el navegador. No lo compartas con terceros ni con asistentes IA.</p>
          <div class="quick-actions">
            <button type="submit" class="btn btn-primary" [disabled]="loading || !token.trim()">{{ loading ? 'Consultando…' : 'Consultar documentos' }}</button>
            <button type="button" class="btn btn-secondary" (click)="clear()">Limpiar consulta</button>
          </div>
        </form>
      </article>
      @if (error) { <p role="alert" class="status status-error">{{ error }}</p> }
      @if (summary) {
        <article class="surface-card">
          <h2>{{ summary.customer.name }}</h2><p>{{ summary.customer.code }}</p>
          <p class="muted">Se muestran hasta 20 documentos recientes por categoría. Los contadores corresponden a esta consulta, no al histórico completo.</p>
          <div class="metric-grid"><div>Cotizaciones<strong>{{ summary.quotations.length }}</strong></div><div>Pedidos<strong>{{ summary.orders.length }}</strong></div><div>Facturas<strong>{{ summary.invoices.length }}</strong></div></div>
        </article>
        @for (group of documentGroups; track group.title) {
          <article class="surface-card">
            <h2>{{ group.title }}</h2>
            @if (group.rows.length) {
              <div class="table-scroll"><table class="table-list">
                <caption>{{ group.title }} · importes en la moneda del documento</caption>
                <thead><tr><th scope="col">Número</th><th scope="col">Estado</th><th scope="col">Total</th></tr></thead>
                <tbody>@for (row of group.rows; track $index) { <tr><th scope="row">{{ row.quotation_number || row.order_number || row.invoice_number }}</th><td>{{ row.status }}</td><td>{{ row.grand_total | number:'1.2-4' }}</td></tr> }</tbody>
              </table></div>
            } @else { <p class="muted">Sin documentos en esta categoría.</p> }
          </article>
        }
      } @else if (!loading && !error) {
        <app-empty-state title="Sin consulta activa" description="Solicita un token vigente al administrador para ver tus documentos." icon="bi-person-vcard"></app-empty-state>
      }
    </section>
  `,
})
export class PortalLookupComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private request = 0;
  token = ''; loading = false; error = ''; summary: PortalSummary | null = null;
  constructor() { localStorage.removeItem('erp360.portal.token.history'); }
  get documentGroups() { return this.summary ? [
    { title: 'Cotizaciones', rows: this.summary.quotations }, { title: 'Pedidos', rows: this.summary.orders }, { title: 'Facturas', rows: this.summary.invoices },
  ] : []; }
  async loadSummary() {
    if (this.loading || !this.token.trim()) return;
    const id = ++this.request;
    this.loading = true; this.error = ''; this.summary = null;
    try {
      const response = await firstValueFrom(this.http.get<PortalSummary>(`${API_BASE_URL}/portal/public/${encodeURIComponent(this.token.trim())}/summary`));
      if (id === this.request) this.summary = response;
    } catch {
      if (id === this.request) this.error = 'No se pudo consultar. El token puede estar vencido o revocado; solicita uno nuevo o revisa la conexión.';
    } finally { if (id === this.request) this.loading = false; }
  }
  clear() { this.request++; this.token = ''; this.summary = null; this.error = ''; this.loading = false; }
  ngOnDestroy() { this.clear(); }
}
