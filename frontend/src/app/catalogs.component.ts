import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type Kind = 'customers' | 'products' | 'suppliers' | 'tax-rates';
type CatalogRecord = {
  id: string; code?: string; sku?: string; name: string; email?: string | null;
  tax_id?: string | null; description?: string | null; unit_price?: string; rate?: string;
  tax_type?: string; is_active: boolean;
};
const emptyForm = () => ({ code: '', sku: '', name: '', email: '', taxId: '', description: '',
  unitPrice: 0, rate: 0, taxType: 'vat', isActive: true });

@Component({
  selector: 'app-catalogs', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">DATOS MAESTROS</p><h1>Gestión de catálogos</h1>
        <p>Edición, desactivación e importación atómica. Los códigos permanecen inmutables y los registros históricos no se borran.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere administrador de la empresa.</p> } @else {
        <article class="surface-card"><label>Catálogo<select [(ngModel)]="kind" (ngModelChange)="changeCatalog()" [disabled]="busy">
          <option value="customers">Clientes</option><option value="products">Productos</option>
          <option value="suppliers">Proveedores</option><option value="tax-rates">Impuestos</option></select></label>
          <label>Buscar<input [(ngModel)]="search" placeholder="Nombre o referencia" /></label>
          <button type="button" class="btn btn-secondary" (click)="exportRecords()" [disabled]="busy">Exportar JSON</button>
          <div class="table-scroll"><table class="table-list"><caption>Registros de la empresa actual</caption>
            <thead><tr><th scope="col">Referencia</th><th scope="col">Nombre</th><th scope="col">Estado</th><th scope="col">Acción</th></tr></thead>
            <tbody>@for (record of filtered; track record.id) { <tr><th scope="row">{{ record.code || record.sku }}</th>
              <td>{{ record.name }}</td><td>{{ record.is_active ? 'Activo' : 'Inactivo' }}</td>
              <td><button class="btn btn-secondary" type="button" (click)="edit(record)" [disabled]="busy">Editar</button></td></tr> }</tbody>
          </table></div>
        </article>
        <article class="surface-card"><h2>{{ editingId ? 'Editar registro' : 'Nuevo registro' }}</h2>
          <form class="form-grid" #editor="ngForm" (ngSubmit)="save()">
            @if (kind === 'products') {
              <label>SKU<input name="sku" [(ngModel)]="form.sku" [disabled]="!!editingId" maxlength="64" required /></label>
              <label>Descripción<textarea name="description" [(ngModel)]="form.description" maxlength="10000"></textarea></label>
              <label>Precio<input name="price" type="number" min="0" step="0.0001" [(ngModel)]="form.unitPrice" required /></label>
            } @else {
              <label>Código<input name="code" [(ngModel)]="form.code" [disabled]="!!editingId" maxlength="64" required /></label>
              @if (kind === 'tax-rates') {
                <label>Porcentaje<input name="rate" type="number" min="0" max="100" step="0.0001" [(ngModel)]="form.rate" required /></label>
                <label>Tipo<select name="taxType" [(ngModel)]="form.taxType"><option value="vat">IVA</option><option value="withholding">Retención</option><option value="other">Otro</option></select></label>
              } @else {
                <label>Correo<input name="email" type="email" email [(ngModel)]="form.email" maxlength="255" /></label>
                <label>Identificación fiscal<input name="taxId" [(ngModel)]="form.taxId" maxlength="64" /></label>
              }
            }
            <label>Nombre<input name="name" [(ngModel)]="form.name" maxlength="180" required /></label>
            @if (editingId) { <label class="consent"><input name="active" type="checkbox" [(ngModel)]="form.isActive" /> Activo para nuevas operaciones</label> }
            <div class="quick-actions"><button class="btn btn-primary" type="submit" [disabled]="busy || editor.invalid">Guardar</button>
              <button class="btn btn-secondary" type="button" (click)="resetForm()" [disabled]="busy">Nuevo / cancelar</button></div>
          </form>
        </article>
        <details class="surface-card"><summary>Importar registros JSON · máximo 200 por lote</summary>
          <p>La exportación proporciona el formato de entrada. La importación solo crea registros nuevos.
            Si existe un duplicado o dato inválido se rechaza todo el lote.</p>
          <label>Arreglo JSON<textarea [(ngModel)]="importText" rows="8" maxlength="180000"></textarea></label>
          <button type="button" class="btn btn-primary" (click)="importRecords()" [disabled]="busy || !importText.trim()">Validar e importar</button>
        </details>
      }
    </section>
  `,
})
export class CatalogsComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  kind: Kind = 'customers'; records: CatalogRecord[] = []; search = ''; form = emptyForm();
  editingId = ''; error = ''; message = ''; importText = ''; busy = false;
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get filtered() {
    const search = this.search.trim().toLowerCase();
    return this.records.filter(row => `${row.name} ${row.code || row.sku}`.toLowerCase().includes(search));
  }
  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.records = []; this.resetForm(); this.importText = '';
        if (user?.roles.includes('admin')) void this.changeCatalog();
      });
    });
  }
  resetForm() { this.editingId = ''; this.form = emptyForm(); }
  async changeCatalog() { this.resetForm(); this.search = ''; this.importText = ''; await this.perform(() => this.load()); }
  private async load() {
    const user = this.session.user(); const kind = this.kind;
    const records = await firstValueFrom(this.http.get<CatalogRecord[]>(`${API_BASE_URL}/masters/${kind}`));
    if (this.session.user() === user && this.kind === kind) this.records = records;
  }
  edit(record: CatalogRecord) {
    this.editingId = record.id;
    this.form = { code: record.code ?? '', sku: record.sku ?? '', name: record.name,
      email: record.email ?? '', taxId: record.tax_id ?? '', description: record.description ?? '',
      unitPrice: Number(record.unit_price ?? 0), rate: Number(record.rate ?? 0),
      taxType: record.tax_type ?? 'vat', isActive: record.is_active };
  }
  async save() {
    await this.perform(async () => {
      const url = `${API_BASE_URL}/masters/${this.kind}`;
      await firstValueFrom(this.editingId
        ? this.http.patch(`${url}/${this.editingId}`, this.form) : this.http.post(url, this.form));
      this.resetForm(); await this.load(); this.message = 'Registro guardado.';
    });
  }
  exportRecords() {
    const records = this.records.map(row => {
      const common = { name: row.name, isActive: row.is_active };
      if (this.kind === 'products') return { ...common, sku: row.sku, description: row.description, unitPrice: Number(row.unit_price) };
      if (this.kind === 'tax-rates') return { ...common, code: row.code, rate: Number(row.rate), taxType: row.tax_type };
      return { ...common, code: row.code, email: row.email, taxId: row.tax_id };
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `erp360-${this.kind}.json`;
    anchor.click(); URL.revokeObjectURL(url);
  }
  async importRecords() {
    await this.perform(async () => {
      let records: unknown;
      try { records = JSON.parse(this.importText); }
      catch { throw new Error('El JSON no es válido. No se importó ningún registro.'); }
      const result = await firstValueFrom(this.http.post<{ imported: number }>(
        `${API_BASE_URL}/masters/${this.kind}/import`, { records }));
      this.importText = ''; await this.load(); this.message = `${result.imported} registros importados.`;
    });
  }
  private async perform(action: () => Promise<void>) {
    if (this.busy || !this.isAdmin) return;
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); }
    catch (error) {
      this.error = error instanceof HttpErrorResponse
        ? error.status === 409 ? 'Referencia duplicada. El lote completo fue rechazado.'
          : error.status === 400 ? 'Datos inválidos. No cambies códigos existentes; retira el impuesto de la tienda antes de desactivarlo.'
            : 'No se pudo completar la operación.'
        : error instanceof Error ? error.message : 'Operación rechazada.';
    } finally { this.busy = false; }
  }
}
