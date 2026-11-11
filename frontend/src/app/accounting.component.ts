import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type Account = { account_code: string; account_name: string };
type Ledger = {
  account: { code: string; name: string; account_type: string };
  summary: { opening: string; debit: string; credit: string; closing: string };
  items: { id: string; entry_number: string; entry_date: string; description: string | null;
    source_type: string; source_id: string | null; debit: string; credit: string; running_balance: string }[];
  total: number; page: number; pageSize: number; fromDate: string; toDate: string;
};

@Component({
  selector: 'app-accounting', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">CONTABILIDAD</p><h1>Libro mayor</h1>
        <p>Rastrea asientos contabilizados por cuenta, con saldo anterior, movimientos y saldo de cierre.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere administrador de empresa.</p> }
      @else {
        <article class="surface-card">
          <form class="toolbar-grid" #ledgerForm="ngForm" (ngSubmit)="search()">
            <label>Cuenta contable<select name="accountCode" [(ngModel)]="filter.accountCode" required [disabled]="busy">
              <option value="">Selecciona una cuenta</option>@for (account of accounts; track account.account_code) {
                <option [value]="account.account_code">{{ account.account_code }} · {{ account.account_name }}</option>
              }</select></label>
            <label>Desde (incluido)<input name="ledgerFrom" type="date" [(ngModel)]="filter.fromDate" required [disabled]="busy" /></label>
            <label>Hasta (incluido)<input name="ledgerTo" type="date" [(ngModel)]="filter.toDate" required [disabled]="busy" /></label>
            <button type="submit" class="btn btn-primary" [disabled]="busy || ledgerForm.invalid">Consultar libro mayor</button>
            <button type="button" class="btn btn-secondary" (click)="loadAccounts()" [disabled]="busy">Actualizar cuentas</button>
          </form>
          <p class="muted">Solo asientos publicados; saldo con signo débito menos crédito, también en pasivo/ingreso. Los importes se muestran como decimales exactos, sin suponer moneda de históricos. No es un estado financiero certificado.</p>
          @if (!accounts.length && !busy) { <p>No hay cuentas. Configura el plan contable desde Operaciones antes de contabilizar documentos.</p> }
        </article>
        @if (ledger; as report) {
          <article class="surface-card">
            <h2>{{ report.account.code }} · {{ report.account.name }}</h2>
            <p>{{ report.fromDate }} a {{ report.toDate }} · {{ report.total }} líneas</p>
            <dl class="kpi-grid" aria-label="Saldos exactos">
              <div class="kpi-card"><dt>Saldo inicial</dt><dd>{{ report.summary.opening }}</dd></div>
              <div class="kpi-card"><dt>Débitos del período</dt><dd>{{ report.summary.debit }}</dd></div>
              <div class="kpi-card"><dt>Créditos del período</dt><dd>{{ report.summary.credit }}</dd></div>
              <div class="kpi-card"><dt>Saldo final</dt><dd>{{ report.summary.closing }}</dd></div>
            </dl>
            <div class="table-scroll"><table class="table-list">
              <caption>Acumulado calculado sobre todas las líneas antes de paginar; orden por fecha, creación y claves estables.</caption>
              <thead><tr><th>Fecha / asiento</th><th>Descripción / origen</th><th>Débito</th><th>Crédito</th><th>Saldo acumulado</th></tr></thead>
              <tbody>@for (line of report.items; track line.id) {
                <tr><th scope="row">{{ line.entry_date }}<br>{{ line.entry_number }}</th><td>{{ line.description }}<br><small>{{ line.source_type }}</small></td>
                  <td>{{ line.debit }}</td><td>{{ line.credit }}</td><td>{{ line.running_balance }}</td></tr>
              }</tbody>
            </table></div>
            @if (!report.items.length) { <p>Sin movimientos en esta página/período. El saldo anterior se conserva.</p> }
            <div class="quick-actions">
              <button type="button" class="btn btn-secondary" (click)="changePage(-1)" [disabled]="busy || report.page <= 1">Anterior</button>
              <span aria-live="polite">Página {{ report.page }} de {{ pages }}</span>
              <button type="button" class="btn btn-secondary" (click)="changePage(1)" [disabled]="busy || report.page >= pages">Siguiente</button>
            </div>
          </article>
        }
      }
    </section>
  `,
})
export class AccountingComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  accounts: Account[] = [];
  ledger: Ledger | null = null;
  filter = { accountCode: '', fromDate: '', toDate: '' };
  busy = false; error = '';
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get pages() { return this.ledger ? Math.max(1, Math.ceil(this.ledger.total / this.ledger.pageSize)) : 1; }
  constructor() {
    effect(() => {
      const identity = this.session.user();
      untracked(() => {
        const today = new Date().toISOString().slice(0, 10);
        this.accounts = []; this.ledger = null;
        this.filter = { accountCode: '', fromDate: `${today.slice(0, 7)}-01`, toDate: today };
        this.error = ''; this.busy = false;
        if (identity?.roles.includes('admin')) void this.loadAccounts();
      });
    });
  }
  async loadAccounts() {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = '';
    try {
      const result = await firstValueFrom(this.http.get<Account[]>(`${API_BASE_URL}/accounting/accounts`));
      if (identity === this.session.user()) this.accounts = result;
    } catch { if (identity === this.session.user()) this.error = 'No se pudo cargar el plan de cuentas. Reintenta o comprueba tus permisos.'; }
    finally { if (identity === this.session.user()) this.busy = false; }
  }
  async search() { await this.loadLedger({ ...this.filter, page: 1 }); }
  async changePage(delta: number) {
    if (!this.ledger) return;
    const page = this.ledger.page + delta;
    if (page < 1 || page > this.pages) return;
    await this.loadLedger({ accountCode: this.ledger.account.code, fromDate: this.ledger.fromDate, toDate: this.ledger.toDate, page });
  }
  private async loadLedger(query: { accountCode: string; fromDate: string; toDate: string; page: number }) {
    if (this.busy || !this.isAdmin) return;
    if (!query.accountCode || !query.fromDate || !query.toDate || query.fromDate > query.toDate) {
      this.error = 'Selecciona cuenta y fechas válidas, desde no posterior a hasta.'; return;
    }
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.ledger = null;
    try {
      const report = await firstValueFrom(this.http.get<Ledger>(`${API_BASE_URL}/accounting/reports/general-ledger`,
        { params: { ...query, pageSize: 25 } }));
      if (identity === this.session.user()) this.ledger = report;
    } catch (error) {
      if (identity !== this.session.user()) return;
      this.error = error instanceof HttpErrorResponse && error.status === 400
        ? 'Revisa la cuenta, el rango de fechas y la página.' : 'No se pudo consultar el libro mayor. No se muestran saldos como cero.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
}
