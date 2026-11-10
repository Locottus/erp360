import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

type PortalSummary = {
  customer: { code: string; name: string; email: string | null };
  quotations: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
};

@Component({
  selector: 'app-portal-lookup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page">
      <h2>Portal de cliente</h2>
      <label for="token">Token de acceso</label>
      <input id="token" [(ngModel)]="token" placeholder="ptk_xxx" />
      <button type="button" (click)="loadSummary()" [disabled]="loading || !token.trim()">Consultar</button>

      <p *ngIf="error" class="error">{{ error }}</p>
      <p *ngIf="loading">Cargando...</p>

      <article *ngIf="summary">
        <h3>{{ summary.customer.name }} ({{ summary.customer.code }})</h3>
        <p *ngIf="summary.customer.email">Correo: {{ summary.customer.email }}</p>
        <p>Cotizaciones: {{ summary.quotations.length }}</p>
        <p>Pedidos: {{ summary.orders.length }}</p>
        <p>Facturas: {{ summary.invoices.length }}</p>
      </article>
    </section>
  `,
  styles: `
    .page { max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-bottom: 0.25rem; font-weight: 600; }
    input { width: 100%; margin-bottom: 0.75rem; padding: 0.5rem; }
    button { padding: 0.5rem 1rem; }
    .error { color: #b00020; }
  `,
})
export class PortalLookupComponent {
  private readonly http = inject(HttpClient);
  token = '';
  loading = false;
  error = '';
  summary: PortalSummary | null = null;

  async loadSummary() {
    this.loading = true;
    this.error = '';
    this.summary = null;
    try {
      const response = await this.http
        .get<PortalSummary>(`http://localhost:3000/portal/public/${encodeURIComponent(this.token.trim())}/summary`)
        .toPromise();
      this.summary = response ?? null;
      if (!this.summary) {
        this.error = 'No se recibió respuesta del portal.';
      }
    } catch {
      this.error = 'No se pudo consultar el portal con ese token.';
    } finally {
      this.loading = false;
    }
  }
}
