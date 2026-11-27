import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

export type PettyFund = {
  id: string; code: string; name: string; status: string; revision: number;
  imprest_amount: string; self_approval_limit: string; balance: string; pending_amount: string; projected_balance: string;
};
export type PettyVoucher = {
  id: string; fund_id: string; fund_code: string; voucher_number: string; amount: string; payee: string;
  description: string; status: string; requested_by: string;
};
export type LedgerAccount = { id: string; account_code: string; account_name: string; account_type: string; is_active: boolean };

@Component({
  selector: 'app-petty-cash', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">OPERACIÓN</p><h1>Caja chica</h1>
        <p>Fondos fijos con vales aprobados, reposición, arqueo y cierre. Cada movimiento genera un asiento contable.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      <article class="surface-card">
        <div class="header-with-action"><h2>Fondos</h2>
          <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="busy">Recargar</button></div>
        <table class="data-table"><thead><tr><th>Código</th><th>Nombre</th><th>Estado</th><th>Fijo</th><th>Saldo</th><th>Pendiente</th><th>Proyectado</th><th></th></tr></thead>
          <tbody>@for (fund of funds; track fund.id) {
            <tr><td>{{ fund.code }}</td><td>{{ fund.name }}</td><td>{{ fund.status }}</td><td>{{ fund.imprest_amount }}</td>
              <td>{{ fund.balance }}</td><td>{{ fund.pending_amount }}</td><td>{{ fund.projected_balance }}</td>
              <td><button type="button" class="btn btn-secondary" (click)="select(fund)">Gestionar</button></td></tr>
          } @empty { <tr><td colspan="8">Sin fondos registrados.</td></tr> }</tbody></table>
      </article>
      @if (canManage) {
        <article class="surface-card"><h2>Nuevo fondo</h2>
          <form class="form-grid" #fundForm="ngForm" (ngSubmit)="createFund()">
            <label>Código<input name="code" [(ngModel)]="fundDraft.code" maxlength="32" required [disabled]="busy" /></label>
            <label>Nombre<input name="name" [(ngModel)]="fundDraft.name" maxlength="128" required [disabled]="busy" /></label>
            <label>Monto fijo<input name="imprest" [(ngModel)]="fundDraft.imprestAmount" required [disabled]="busy" /></label>
            <label>Límite de autoaprobación<input name="limit" [(ngModel)]="fundDraft.selfApprovalLimit" [disabled]="busy" /></label>
            <label>Cuenta de caja<select name="cash" [(ngModel)]="fundDraft.cashAccountId" required [disabled]="busy">
              @for (account of assetAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
            <button type="submit" class="btn btn-primary" [disabled]="busy || fundForm.invalid">Crear fondo</button>
          </form>
          <p class="muted">Con límite 0 el solicitante nunca aprueba sus propios vales; se requiere otra persona con permiso de aprobación.</p>
        </article>
      }
      @if (selected) {
        <article class="surface-card"><h2>{{ selected.code }} · {{ selected.name }} ({{ selected.status }})</h2>
          <div class="form-grid">
            <label>Cuenta contrapartida (origen/destino)<select name="counter" [(ngModel)]="counterAccountId" [disabled]="busy">
              @for (account of assetAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
            @if (canManage && selected.status === 'draft') {
              <button type="button" class="btn btn-primary" (click)="open()" [disabled]="busy || !counterAccountId">Abrir fondo</button> }
            @if (canManage && selected.status === 'active') {
              <button type="button" class="btn btn-secondary" (click)="replenish()" [disabled]="busy || !counterAccountId">Reponer</button>
              <label>Efectivo contado<input name="counted" [(ngModel)]="counted" [disabled]="busy" /></label>
              <button type="button" class="btn btn-secondary" (click)="count()" [disabled]="busy || !counted">Registrar arqueo</button>
              <label>Motivo de cierre<input name="closeReason" [(ngModel)]="closeReason" minlength="10" maxlength="1000" [disabled]="busy" /></label>
              <button type="button" class="btn btn-danger" (click)="close()" [disabled]="busy || !counterAccountId || closeReason.length < 10">Cerrar fondo</button> }
          </div>
          @if (canDisburse && selected.status === 'active') {
            <h3>Nuevo vale</h3>
            <form class="form-grid" #voucherForm="ngForm" (ngSubmit)="createVoucher()">
              <label>Monto<input name="amount" [(ngModel)]="voucherDraft.amount" required [disabled]="busy" /></label>
              <label>Beneficiario<input name="payee" [(ngModel)]="voucherDraft.payee" required [disabled]="busy" /></label>
              <label>Descripción<input name="description" [(ngModel)]="voucherDraft.description" minlength="5" required [disabled]="busy" /></label>
              <label>Comprobante<input name="receipt" [(ngModel)]="voucherDraft.receiptReference" required [disabled]="busy" /></label>
              <label>Cuenta de gasto<select name="expense" [(ngModel)]="voucherDraft.expenseAccountId" required [disabled]="busy">
                @for (account of expenseAccounts; track account.id) { <option [value]="account.id">{{ account.account_code }} · {{ account.account_name }}</option> }</select></label>
              <button type="submit" class="btn btn-primary" [disabled]="busy || voucherForm.invalid">Solicitar vale</button>
            </form>
          }
          <h3>Vales</h3>
          <table class="data-table"><thead><tr><th>Número</th><th>Beneficiario</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
            <tbody>@for (voucher of vouchers; track voucher.id) {
              <tr><td>{{ voucher.voucher_number }}</td><td>{{ voucher.payee }}</td><td>{{ voucher.amount }}</td><td>{{ voucher.status }}</td>
                <td>@if (voucher.status === 'pending' && canApprove) {
                  <button type="button" class="btn btn-primary" (click)="decide(voucher, 'approve')" [disabled]="busy">Aprobar</button>
                  <button type="button" class="btn btn-secondary" (click)="decide(voucher, 'reject')" [disabled]="busy">Rechazar</button> }</td></tr>
            } @empty { <tr><td colspan="5">Sin vales.</td></tr> }</tbody></table>
        </article>
      }
      <p class="muted">Informe operativo, no certificado. Las diferencias de arqueo se registran para revisión y no generan asientos automáticos.</p>
    </section>
  `,
})
export class PettyCashComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  funds: PettyFund[] = []; vouchers: PettyVoucher[] = []; accounts: LedgerAccount[] = [];
  selected: PettyFund | null = null;
  fundDraft = { code: '', name: '', imprestAmount: '', selfApprovalLimit: '0', cashAccountId: '' };
  voucherDraft = { amount: '', payee: '', description: '', receiptReference: '', expenseAccountId: '' };
  counterAccountId = ''; counted = ''; closeReason = '';
  error = ''; message = ''; busy = false;

  get assetAccounts() { return this.accounts.filter(a => a.is_active && a.account_type === 'asset'); }
  get expenseAccounts() { return this.accounts.filter(a => a.is_active && a.account_type === 'expense'); }
  get canManage() { return this.session.hasAnyPermission('petty_cash.manage'); }
  get canDisburse() { return this.session.hasAnyPermission('petty_cash.disburse'); }
  get canApprove() { return this.session.hasAnyPermission('petty_cash.approve'); }

  constructor() { void this.load(); }

  private key(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }

  private fail(error: unknown) {
    this.message = '';
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const detail = error instanceof HttpErrorResponse && typeof error.error?.message === 'string' ? error.error.message : '';
    this.error = status === 409 ? 'El fondo cambió. Recarga y revisa antes de repetir.'
      : status === 403 ? (detail || 'No tienes permiso para esta acción.') : (detail || 'No se pudo completar la operación.');
  }

  private async run(action: () => Promise<unknown>, success: string) {
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); this.message = success; await this.refresh(); } catch (error) { this.fail(error); } finally { this.busy = false; }
  }

  async load() {
    this.busy = true; this.error = '';
    try {
      this.funds = await firstValueFrom(this.http.get<PettyFund[]>(`${API_BASE_URL}/petty-cash/funds`));
      this.accounts = await firstValueFrom(this.http.get<LedgerAccount[]>(`${API_BASE_URL}/accounting/accounts`)).catch(() => []);
      if (this.selected) await this.select(this.funds.find(f => f.id === this.selected?.id) ?? null);
    } catch (error) { this.fail(error); } finally { this.busy = false; }
  }

  private async refresh() { await this.load(); }

  async select(fund: PettyFund | null) {
    this.selected = fund; this.vouchers = [];
    if (!fund) return;
    try {
      const all = await firstValueFrom(this.http.get<PettyVoucher[]>(`${API_BASE_URL}/petty-cash/vouchers`));
      this.vouchers = all.filter(v => v.fund_id === fund.id);
    } catch (error) { this.fail(error); }
  }

  createFund() {
    const { selfApprovalLimit, ...rest } = this.fundDraft;
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/funds`, { ...rest, selfApprovalLimit })), 'Fondo creado en borrador.');
  }
  open() {
    const fund = this.selected!;
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/funds/${fund.id}/open`, {
      idempotencyKey: this.key('open'), expectedRevision: fund.revision, sourceAccountId: this.counterAccountId })), 'Fondo abierto y asiento registrado.');
  }
  replenish() {
    const fund = this.selected!;
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/funds/${fund.id}/replenish`, {
      idempotencyKey: this.key('replenish'), sourceAccountId: this.counterAccountId })), 'Reposición registrada.');
  }
  count() {
    const fund = this.selected!;
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/funds/${fund.id}/counts`, {
      countedAmount: this.counted, notes: 'Arqueo registrado desde la consola' })), 'Arqueo registrado para revisión.');
  }
  close() {
    const fund = this.selected!;
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/funds/${fund.id}/close`, {
      idempotencyKey: this.key('close'), expectedRevision: fund.revision, destinationAccountId: this.counterAccountId,
      reason: this.closeReason })), 'Fondo cerrado.');
  }
  createVoucher() {
    const fund = this.selected!;
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/funds/${fund.id}/vouchers`, {
      idempotencyKey: this.key('voucher'), ...this.voucherDraft })), 'Vale solicitado.');
  }
  decide(voucher: PettyVoucher, action: 'approve' | 'reject') {
    const body = action === 'reject' ? { reason: 'Rechazado desde la consola de caja chica' } : {};
    return this.run(() => firstValueFrom(this.http.post(`${API_BASE_URL}/petty-cash/vouchers/${voucher.id}/${action}`, body)),
      action === 'approve' ? 'Vale aprobado y contabilizado.' : 'Vale rechazado.');
  }
}
