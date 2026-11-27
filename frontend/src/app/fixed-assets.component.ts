import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import type { LedgerAccount } from './petty-cash.component';

export type AssetCategory = { id: string; code: string; name: string; useful_life_months: number };
export type FixedAsset = {
  id: string; asset_code: string; name: string; category_code: string; status: string; cost: string;
  accumulated_depreciation: string; book_value: string; useful_life_months: number; revision: number;
};
export type DepreciationLine = {
  id: string; asset_code: string; period_year: number; period_month: number; amount: string; status: string;
};

@Component({
  selector: 'app-fixed-assets', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">OPERACIÓN</p><h1>Activos fijos</h1>
        <p>Alta, depreciación lineal mensual en borrador revisable, contabilización por período y baja con resultado.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      <article class="surface-card">
        <div class="header-with-action"><h2>Activos</h2>
          <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="busy">Recargar</button></div>
        <label>Cuenta de contrapartida para activar o dar de baja<select name="counter" [(ngModel)]="counterAccountId" [disabled]="busy">
          @for (account of accounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
        <table class="data-table"><thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Estado</th><th>Costo</th><th>Depreciación acumulada</th><th>Valor en libros</th><th></th></tr></thead>
          <tbody>@for (asset of assets; track asset.id) {
            <tr><td>{{ asset.asset_code }}</td><td>{{ asset.name }}</td><td>{{ asset.category_code }}</td><td>{{ asset.status }}</td>
              <td>{{ asset.cost }}</td><td>{{ asset.accumulated_depreciation }}</td><td>{{ asset.book_value }}</td>
              <td>@if (canManage && asset.status === 'draft') {
                <button type="button" class="btn btn-primary" (click)="activate(asset)" [disabled]="busy || !counterAccountId">Activar</button> }
                @if (canDispose && asset.status === 'active') {
                <button type="button" class="btn btn-danger" (click)="dispose(asset)" [disabled]="busy || !resultAccountId || !disposalDate || disposalReason.length < 10 || (hasProceeds && !proceedsAccountId)">Dar de baja</button> }</td></tr>
          } @empty { <tr><td colspan="8">Sin activos registrados.</td></tr> }</tbody></table>
        @if (canDispose) {
          <label>Cuenta de resultado para la baja<select name="result" [(ngModel)]="resultAccountId" [disabled]="busy">
            @for (account of resultAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
          <label>Fecha de baja<input type="date" name="disposalDate" [(ngModel)]="disposalDate" [max]="today" /></label>
          <label>Producto de la venta (0 si no hubo)<input name="proceeds" [(ngModel)]="proceeds" /></label>
          <label>Cuenta donde se cobra la venta<select name="proceedsAcc" [(ngModel)]="proceedsAccountId" [disabled]="busy">
            @for (account of assetAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
          <label>Motivo de baja<input name="disposalReason" [(ngModel)]="disposalReason" minlength="10" maxlength="1000" /></label>
          <p class="muted">La diferencia entre producto y valor en libros se lleva a la cuenta de resultado. La fecha no puede ser futura ni caer en un período cerrado.</p>
        }
      </article>
      @if (canManage) {
        <article class="surface-card"><h2>Nueva categoría</h2>
          <form class="form-grid" #categoryForm="ngForm" (ngSubmit)="createCategory()">
            <label>Código<input name="catCode" [(ngModel)]="categoryDraft.code" required [disabled]="busy" /></label>
            <label>Nombre<input name="catName" [(ngModel)]="categoryDraft.name" required [disabled]="busy" /></label>
            <label>Vida útil (meses)<input type="number" name="catLife" [(ngModel)]="categoryDraft.usefulLifeMonths" min="1" max="1200" required [disabled]="busy" /></label>
            <label>Cuenta del activo<select name="assetAcc" [(ngModel)]="categoryDraft.assetAccountId" required>
              @for (account of assetAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
            <label>Depreciación acumulada<select name="accumAcc" [(ngModel)]="categoryDraft.accumulatedAccountId" required>
              @for (account of assetAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
            <label>Gasto de depreciación<select name="expAcc" [(ngModel)]="categoryDraft.expenseAccountId" required>
              @for (account of expenseAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
            <button type="submit" class="btn btn-primary" [disabled]="busy || categoryForm.invalid">Crear categoría</button>
          </form>
        </article>
        <article class="surface-card"><h2>Nuevo activo</h2>
          <form class="form-grid" #assetForm="ngForm" (ngSubmit)="createAsset()">
            <label>Código<input name="assetCode" [(ngModel)]="assetDraft.assetCode" required [disabled]="busy" /></label>
            <label>Nombre<input name="assetName" [(ngModel)]="assetDraft.name" required [disabled]="busy" /></label>
            <label>Categoría<select name="assetCategory" [(ngModel)]="assetDraft.categoryId" required>
              @for (category of categories; track category.id) { <option [value]="category.id">{{ category.code }} · {{ category.name }}</option> }</select></label>
            <label>Fecha de adquisición<input type="date" name="acq" [(ngModel)]="assetDraft.acquisitionDate" required [disabled]="busy" /></label>
            <label>Costo<input name="cost" [(ngModel)]="assetDraft.cost" required [disabled]="busy" /></label>
            <label>Valor residual<input name="salvage" [(ngModel)]="assetDraft.salvageValue" [disabled]="busy" /></label>
            <button type="submit" class="btn btn-primary" [disabled]="busy || assetForm.invalid">Crear activo</button>
          </form>
        </article>
      }
      <article class="surface-card"><h2>Depreciación</h2>
        <div class="form-grid">
          <label>Año<input type="number" name="year" [(ngModel)]="year" min="2000" max="2100" /></label>
          <label>Mes<input type="number" name="month" [(ngModel)]="month" min="1" max="12" /></label>
          <button type="button" class="btn btn-secondary" (click)="loadLines()" [disabled]="busy">Consultar</button>
          @if (canDepreciate) {
            <button type="button" class="btn btn-secondary" (click)="runDepreciation()" [disabled]="busy">Generar borrador</button>
            <button type="button" class="btn btn-primary" (click)="postPeriod()" [disabled]="busy">Contabilizar período</button> }
        </div>
        <table class="data-table"><thead><tr><th>Activo</th><th>Período</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
          <tbody>@for (line of lines; track line.id) {
            <tr><td>{{ line.asset_code }}</td><td>{{ line.period_year }}-{{ line.period_month }}</td><td>{{ line.amount }}</td><td>{{ line.status }}</td>
              <td>@if (canReverse && line.status === 'posted') {
                <button type="button" class="btn btn-secondary" (click)="reverse(line)" [disabled]="busy || reverseReason.length < 10">Revertir</button> }</td></tr>
          } @empty { <tr><td colspan="5">Sin líneas de depreciación.</td></tr> }</tbody></table>
        @if (canReverse) {
          <label>Motivo de reversión<input name="reverseReason" [(ngModel)]="reverseReason" minlength="10" maxlength="1000" /></label> }
        <p class="muted">Las líneas se generan en borrador y solo se contabilizan cuando el período terminó. Revertir genera un contraasiento fechado hoy (no borra el original), solo en orden inverso, y permite regenerar el período.</p>
      </article>
      <p class="muted">Informe operativo, no certificado.</p>
    </section>
  `,
})
export class FixedAssetsComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  assets: FixedAsset[] = []; categories: AssetCategory[] = []; lines: DepreciationLine[] = []; allAccounts: LedgerAccount[] = [];
  categoryDraft = { code: '', name: '', usefulLifeMonths: 60, assetAccountId: '', accumulatedAccountId: '', expenseAccountId: '' };
  assetDraft = { assetCode: '', name: '', categoryId: '', acquisitionDate: '', cost: '', salvageValue: '0.0000' };
  counterAccountId = ''; resultAccountId = ''; proceedsAccountId = ''; disposalReason = ''; reverseReason = '';
  today = new Date().toISOString().slice(0, 10); disposalDate = this.today; proceeds = '0';
  get hasProceeds() { return Number(this.proceeds) > 0; }
  year = new Date().getFullYear(); month = new Date().getMonth() + 1;
  error = ''; message = ''; busy = false;

  get accounts() { return this.allAccounts.filter(a => a.is_active); }
  get assetAccounts() { return this.accounts.filter(a => a.account_type === 'asset'); }
  get expenseAccounts() { return this.accounts.filter(a => a.account_type === 'expense'); }
  get resultAccounts() { return this.accounts.filter(a => a.account_type === 'revenue' || a.account_type === 'expense'); }
  get canManage() { return this.session.hasAnyPermission('fixed_assets.manage'); }
  get canDepreciate() { return this.session.hasAnyPermission('fixed_assets.depreciate'); }
  get canDispose() { return this.session.hasAnyPermission('fixed_assets.dispose'); }
  get canReverse() { return this.session.hasAnyPermission('fixed_assets.reverse'); }

  constructor() { void this.load(); }

  private fail(error: unknown) {
    this.message = '';
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const detail = error instanceof HttpErrorResponse && typeof error.error?.message === 'string' ? error.error.message : '';
    this.error = status === 409 ? 'El activo cambió. Recarga y revisa antes de repetir.'
      : (detail || 'No se pudo completar la operación.');
  }

  private async run(action: () => Promise<unknown>, success: string) {
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); this.message = success; await this.load(); } catch (error) { this.fail(error); } finally { this.busy = false; }
  }

  async load() {
    this.busy = true; this.error = '';
    try {
      this.assets = await firstValueFrom(this.http.get<FixedAsset[]>(`${API_BASE_URL}/fixed-assets/assets`));
      this.categories = await firstValueFrom(this.http.get<AssetCategory[]>(`${API_BASE_URL}/fixed-assets/categories`));
      this.allAccounts = await firstValueFrom(this.http.get<LedgerAccount[]>(`${API_BASE_URL}/accounting/accounts`)).catch(() => []);
      await this.loadLines();
    } catch (error) { this.fail(error); } finally { this.busy = false; }
  }

  async loadLines() {
    try {
      this.lines = await firstValueFrom(this.http.get<DepreciationLine[]>(
        `${API_BASE_URL}/fixed-assets/depreciation?year=${this.year}&month=${this.month}`));
    } catch (error) { this.fail(error); }
  }

  createCategory() {
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/categories`, this.categoryDraft)), 'Categoría creada.');
  }
  createAsset() {
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/assets`, {
      idempotencyKey: `asset-${crypto.randomUUID()}`, ...this.assetDraft })), 'Activo creado en borrador.');
  }
  activate(asset: FixedAsset) {
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/assets/${asset.id}/activate`, {
      expectedRevision: asset.revision, offsetAccountId: this.counterAccountId })), 'Activo activado y asiento registrado.');
  }
  dispose(asset: FixedAsset) {
    const body: Record<string, unknown> = {
      expectedRevision: asset.revision, reason: this.disposalReason, disposalDate: this.disposalDate,
      gainLossAccountId: this.resultAccountId,
    };
    if (this.hasProceeds) { body['proceeds'] = this.proceeds; body['proceedsAccountId'] = this.proceedsAccountId; }
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/assets/${asset.id}/dispose`, body)), 'Activo dado de baja.');
  }
  reverse(line: DepreciationLine) {
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/depreciation/lines/${line.id}/reverse`, {
      reason: this.reverseReason })), 'Línea revertida con contraasiento.');
  }
  runDepreciation() {
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/depreciation/runs`,
      { year: this.year, month: this.month })), 'Depreciación generada en borrador.');
  }
  postPeriod() {
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/fixed-assets/depreciation/post-period`,
      { year: this.year, month: this.month })), 'Período contabilizado.');
  }
}
