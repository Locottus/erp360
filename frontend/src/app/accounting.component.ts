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
type BankAccount = { id: string; code: string; bank_name: string; currency_code: string; is_active: boolean };
type BankLine = {
  id: string; reference: string; line_type: 'debit' | 'credit'; amount: string; booked_at: string;
  counterpart_reference: string | null; reconciliation_status: string; statement_reference: string;
  bank_account_code: string; bank_name: string;
};
type FinancialStatements = {
  basis: string;
  balanceSheet: { asOfDate: string; assets: number; liabilities: number; equity: number;
    accumulatedNetIncome: number; totalLiabilitiesAndEquity: number; balancesMatch: boolean };
  incomeStatement: {
    fromDate: string; toDate: string; revenue: number; expenses: number; netIncome: number;
    comparative: { fromDate: string; toDate: string; revenue: number; expenses: number; netIncome: number };
  };
};
type InventoryCostIntegrity = {
  capturedAt: string;
  dispatchMovements: number;
  dispatchWithSnapshot: number;
  dispatchWithoutSnapshot: number;
  dispatchWithNegativeCost: number;
  dispatchQuantityMismatch: number;
  lotQuantityNegative: number;
  complete: boolean;
};
type BankSuggestion = {
  line_id: string;
  reference: string;
  counterpart_reference: string | null;
  amount: string;
  statement_reference: string;
  bank_account_code: string;
  payment_id: string;
  payment_reference: string;
  match_type: 'exact_reference' | 'exact_counterpart' | 'exact_amount';
};

@Component({
  selector: 'app-accounting', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">CONTABILIDAD</p><h1>Libro mayor</h1>
        <p>Rastrea asientos contabilizados por cuenta, con saldo anterior, movimientos y saldo de cierre.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
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
        <article class="surface-card"><h2>Importar extracto bancario</h2>
          <p>Formato CSV genérico: <code>reference,line_type,amount,booked_at,counterpart_reference</code>. Las filas se importan como pendientes; no crean pagos ni los concilian automáticamente.</p>
          <form class="toolbar-grid" #statementForm="ngForm" (ngSubmit)="importStatement()">
            <label>Cuenta bancaria<select name="bankAccountId" [(ngModel)]="statement.bankAccountId" required [disabled]="busy">
              <option value="">Selecciona</option>@for (account of bankAccounts; track account.id) {
                <option [value]="account.id">{{ account.code }} · {{ account.bank_name }} · {{ account.currency_code }}</option>
              }</select></label>
            <label>Referencia del extracto<input name="statementReference" [(ngModel)]="statement.statementReference" maxlength="64" required [disabled]="busy" /></label>
            <label>Fecha del extracto<input name="statementDate" type="date" [(ngModel)]="statement.statementDate" required [disabled]="busy" /></label>
            <label>Saldo inicial<input name="openingBalance" type="number" min="0" step="0.0001" [(ngModel)]="statement.openingBalance" required [disabled]="busy" /></label>
            <label>Saldo final<input name="closingBalance" type="number" min="0" step="0.0001" [(ngModel)]="statement.closingBalance" required [disabled]="busy" /></label>
            <label>Archivo CSV<input type="file" accept=".csv,text/csv" (change)="readStatementFile($event)" [disabled]="busy" required /></label>
            <p aria-live="polite">{{ statementFileName || 'Sin archivo seleccionado' }}</p>
            <button type="submit" class="btn btn-primary" [disabled]="busy || statementForm.invalid || !statement.csv">Importar extracto</button>
          </form>
        </article>
        <article class="surface-card"><h2>Conciliación manual de extractos</h2>
          <p>Empareja una línea con un pago existente o registra una diferencia con motivo. La importación nunca altera los pagos.</p>
          <button type="button" class="btn btn-secondary" (click)="loadBankLines()" [disabled]="busy">Actualizar líneas bancarias</button>
          <button type="button" class="btn btn-secondary" (click)="loadBankSuggestions()" [disabled]="busy">Buscar emparejamientos</button>
          @if (bankSuggestions.length) {
            <p>Sugerencias exactas sin conciliación automática:</p>
            <ul>
              @for (suggestion of bankSuggestions; track suggestion.line_id) {
                <li>{{ suggestion.statement_reference }} · {{ suggestion.reference }} · {{ suggestion.amount }}
                  → pago {{ suggestion.payment_reference }} · {{ suggestion.match_type }}</li>
              }
            </ul>
          }
          <div class="table-scroll"><table class="table-list"><caption>Hasta 1000 líneas importadas, por fecha y referencia</caption>
            <thead><tr><th>Extracto / referencia</th><th>Fecha / contraparte</th><th>Importe</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>@for (line of bankLines; track line.id) { <tr><th scope="row">{{ line.statement_reference }}<br>{{ line.reference }}</th>
              <td>{{ line.booked_at | date:'short' }}<br>{{ line.counterpart_reference }}</td>
              <td>{{ line.line_type }} · {{ line.amount }}</td><td>{{ line.reconciliation_status }}</td>
              <td>@if (line.reconciliation_status === 'pending') {
                <form class="form-grid" #reconcileForm="ngForm" (ngSubmit)="reconcile(line)">
                  <label>Resultado<select [name]="'reconcile-status-' + line.id" [(ngModel)]="reconciliation[line.id].status" required>
                    <option value="matched">Emparejado</option><option value="reconciled">Reconciliado</option><option value="difference">Diferencia</option>
                  </select></label>
                  @if (reconciliation[line.id].status !== 'difference') {
                    <label>UUID de pago existente<input [name]="'payment-' + line.id" [(ngModel)]="reconciliation[line.id].matchedPaymentId" required /></label>
                  } @else {
                    <label>Importe de diferencia<input [name]="'difference-' + line.id" type="number" min="0" step="0.0001"
                      [(ngModel)]="reconciliation[line.id].differenceAmount" required /></label>
                  }
                  <label>Motivo<input [name]="'reason-' + line.id" [(ngModel)]="reconciliation[line.id].reason" minlength="10" maxlength="1000" required /></label>
                  <button type="submit" class="btn btn-secondary" [disabled]="busy || reconcileForm.invalid">Guardar con auditoría</button>
                </form>
              } @else {
                <label>Motivo de reversión<input [name]="'reverse-reason-' + line.id"
                  [(ngModel)]="reconciliation[line.id].reason" minlength="10" maxlength="1000" required /></label>
                <button type="button" class="btn btn-secondary"
                  [disabled]="busy || reconciliation[line.id].reason.trim().length < 10"
                  (click)="reverse(line)">Revertir conciliación</button>
              }</td></tr>
            } @empty { <tr><td colspan="5">No hay líneas bancarias importadas.</td></tr> }</tbody>
          </table></div>
        </article>
        <article class="surface-card"><h2>Estados financieros operativos</h2>
          <p>Vista interna no certificada, basada en asientos publicados; el resultado acumulado se incluye en el patrimonio para mostrar la ecuación contable.</p>
          <form class="toolbar-grid" #statementReportForm="ngForm" (ngSubmit)="loadFinancialStatements()">
            <label>Desde<input name="financialFrom" type="date" [(ngModel)]="statementReport.fromDate" required [disabled]="busy" /></label>
            <label>Hasta<input name="financialTo" type="date" [(ngModel)]="statementReport.toDate" required [disabled]="busy" /></label>
            <button type="submit" class="btn btn-primary" [disabled]="busy || statementReportForm.invalid">Consultar estados</button>
          </form>
          @if (financialStatements; as report) {
            <h3>Situación financiera al {{ report.balanceSheet.asOfDate }}</h3>
            <p>Activos {{ report.balanceSheet.assets }} · Pasivos {{ report.balanceSheet.liabilities }} · Patrimonio {{ report.balanceSheet.equity }}
              · Resultado acumulado {{ report.balanceSheet.accumulatedNetIncome }} · Ecuación {{ report.balanceSheet.balancesMatch ? 'cuadrada' : 'no cuadrada' }}</p>
            <h3>Resultados del {{ report.incomeStatement.fromDate }} al {{ report.incomeStatement.toDate }}</h3>
            <p>Ingresos {{ report.incomeStatement.revenue }} · Gastos {{ report.incomeStatement.expenses }} · Resultado {{ report.incomeStatement.netIncome }}</p>
            <h3>Comparativo inmediato</h3>
            <p>{{ report.incomeStatement.comparative.fromDate }} a {{ report.incomeStatement.comparative.toDate }}
              · Ingresos {{ report.incomeStatement.comparative.revenue }}
              · Gastos {{ report.incomeStatement.comparative.expenses }}
              · Resultado {{ report.incomeStatement.comparative.netIncome }}</p>
          }
        </article>
        <article class="surface-card"><h2>Integridad de costo de inventario</h2>
          <p>Verifica snapshots de despacho y lotes valorizados sin corregir ni ocultar diferencias.</p>
          <button type="button" class="btn btn-secondary" (click)="loadInventoryCostIntegrity()" [disabled]="busy">
            Revisar integridad de costo
          </button>
          @if (inventoryCostIntegrity; as report) {
            <p role="status">{{ report.complete ? 'Integridad completa.' : 'Se encontraron diferencias que requieren revisión.' }}</p>
            <p>Despachos {{ report.dispatchMovements }} · con snapshot {{ report.dispatchWithSnapshot }}
              · sin snapshot {{ report.dispatchWithoutSnapshot }} · cantidades incompatibles {{ report.dispatchQuantityMismatch }}
              · costos negativos {{ report.dispatchWithNegativeCost }} · lotes negativos {{ report.lotQuantityNegative }}</p>
          }
        </article>
      }
    </section>
  `,
})
export class AccountingComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  accounts: Account[] = [];
  ledger: Ledger | null = null;
  bankAccounts: BankAccount[] = [];
  bankLines: BankLine[] = [];
  bankSuggestions: BankSuggestion[] = [];
  reconciliation: Record<string, { status: 'matched' | 'reconciled' | 'difference'; reason: string;
    matchedPaymentId: string; differenceAmount: number | null }> = {};
  financialStatements: FinancialStatements | null = null;
  inventoryCostIntegrity: InventoryCostIntegrity | null = null;
  statementFileName = '';
  statement = { bankAccountId: '', statementReference: '', statementDate: new Date().toISOString().slice(0, 10),
    openingBalance: '0', closingBalance: '0', csv: '' };
  statementReport = { fromDate: `${new Date().getFullYear()}-01-01`, toDate: new Date().toISOString().slice(0, 10) };
  filter = { accountCode: '', fromDate: '', toDate: '' };
  busy = false; error = ''; message = '';
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get pages() { return this.ledger ? Math.max(1, Math.ceil(this.ledger.total / this.ledger.pageSize)) : 1; }
  constructor() {
    effect(() => {
      const identity = this.session.user();
      untracked(() => {
        const today = new Date().toISOString().slice(0, 10);
        this.accounts = []; this.ledger = null; this.bankAccounts = []; this.bankLines = [];
        this.bankSuggestions = [];
        this.reconciliation = {}; this.financialStatements = null;
        this.inventoryCostIntegrity = null;
        this.statement = { bankAccountId: '', statementReference: '', statementDate: new Date().toISOString().slice(0, 10),
          openingBalance: '0', closingBalance: '0', csv: '' };
        this.statementFileName = '';
        this.statementReport = { fromDate: `${new Date().getFullYear()}-01-01`, toDate: new Date().toISOString().slice(0, 10) };
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
      const [accounts, bankAccounts, bankLines] = await Promise.all([
        firstValueFrom(this.http.get<Account[]>(`${API_BASE_URL}/accounting/accounts`)),
        firstValueFrom(this.http.get<BankAccount[]>(`${API_BASE_URL}/accounting/bank-accounts`)),
        firstValueFrom(this.http.get<BankLine[]>(`${API_BASE_URL}/accounting/bank-reconciliation-lines`)),
      ]);
      if (identity === this.session.user()) {
        this.accounts = accounts; this.bankAccounts = bankAccounts; this.bankLines = bankLines;
        for (const line of bankLines) this.reconciliation[line.id] ??= {
          status: 'matched', reason: '', matchedPaymentId: '', differenceAmount: null,
        };
      }
    } catch { if (identity === this.session.user()) this.error = 'No se pudieron cargar cuentas contables y bancarias. Reintenta o comprueba tus permisos.'; }
    finally { if (identity === this.session.user()) this.busy = false; }
  }
  async search() { await this.loadLedger({ ...this.filter, page: 1 }); }
  async readStatementFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.statement.csv = ''; this.statementFileName = '';
    if (!file) return;
    if (file.size > 1_000_000) {
      this.error = 'El CSV supera el límite de 1 MB.'; input.value = ''; return;
    }
    const identity = this.session.user();
    try {
      const csv = await file.text();
      if (identity !== this.session.user()) return;
      this.statement.csv = csv; this.statementFileName = file.name; this.error = '';
    } catch {
      if (identity === this.session.user()) this.error = 'No se pudo leer el CSV; selecciona el archivo nuevamente.';
    } finally { input.value = ''; }
  }
  async importStatement() {
    const input = { ...this.statement };
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ replayed: boolean; importedLines: number }>(
        `${API_BASE_URL}/accounting/bank-accounts/${input.bankAccountId}/statements/import`, input));
      this.statement.statementReference = ''; this.statement.csv = ''; this.statementFileName = '';
      this.message = result.replayed ? 'El extracto ya estaba importado; no se duplicaron líneas.' :
        `Extracto importado: ${result.importedLines} líneas quedan pendientes de conciliación.`;
      await this.loadBankData();
    });
  }
  async loadBankLines() {
    if (this.busy || !this.isAdmin) return;
    await this.perform(() => this.loadBankData());
  }
  private async loadBankData() {
    const identity = this.session.user();
    const [accounts, lines] = await Promise.all([
      firstValueFrom(this.http.get<BankAccount[]>(`${API_BASE_URL}/accounting/bank-accounts`)),
      firstValueFrom(this.http.get<BankLine[]>(`${API_BASE_URL}/accounting/bank-reconciliation-lines`)),
    ]);
    if (identity !== this.session.user()) return;
    this.bankAccounts = accounts; this.bankLines = lines;
    for (const line of lines) this.reconciliation[line.id] ??= {
      status: 'matched', reason: '', matchedPaymentId: '', differenceAmount: null,
    };
  }
  async loadBankSuggestions() {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = '';
    try {
      const suggestions = await firstValueFrom(this.http.get<BankSuggestion[]>(
        `${API_BASE_URL}/accounting/bank-reconciliation-suggestions`));
      if (identity === this.session.user()) this.bankSuggestions = suggestions;
    } catch {
      if (identity === this.session.user()) this.error = 'No se pudieron calcular sugerencias bancarias.';
    } finally {
      if (identity === this.session.user()) this.busy = false;
    }
  }
  async reverse(line: BankLine) {
    const input = this.reconciliation[line.id];
    await this.perform(async () => {
      await firstValueFrom(this.http.post(
        `${API_BASE_URL}/accounting/bank-reconciliation-lines/${line.id}/reverse`,
        { reason: input.reason },
      ));
      this.message = 'Conciliación revertida con auditoría.';
      await this.loadBankData();
    });
  }
  async reconcile(line: BankLine) {
    const input = this.reconciliation[line.id];
    if (input.status !== 'difference' && !input.matchedPaymentId.trim()) {
      this.error = 'Indica el UUID del pago existente para marcar la línea como emparejada o reconciliada.'; return;
    }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/accounting/bank-reconciliation-lines/${line.id}/reconcile`, {
        status: input.status, reason: input.reason,
        ...(input.status === 'difference' ? { differenceAmount: input.differenceAmount } : { matchedPaymentId: input.matchedPaymentId.trim() }),
      }));
      this.message = 'Estado bancario actualizado con motivo y auditoría.';
      await this.loadBankData();
    });
  }
  async loadInventoryCostIntegrity() {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = '';
    try {
      const report = await firstValueFrom(this.http.get<InventoryCostIntegrity>(
        `${API_BASE_URL}/accounting/reports/inventory-cost-integrity`));
      if (identity === this.session.user()) this.inventoryCostIntegrity = report;
    } catch {
      if (identity === this.session.user()) this.error = 'No se pudo revisar la integridad de costo.';
    } finally {
      if (identity === this.session.user()) this.busy = false;
    }
  }
  async loadFinancialStatements() {
    if (this.statementReport.fromDate > this.statementReport.toDate) {
      this.error = 'La fecha inicial no puede ser posterior a la fecha final.'; return;
    }
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.financialStatements = null;
    try {
      const report = await firstValueFrom(this.http.get<FinancialStatements>(
        `${API_BASE_URL}/accounting/reports/financial-statements`, { params: this.statementReport }));
      if (identity === this.session.user()) this.financialStatements = report;
    } catch {
      if (identity === this.session.user()) this.error = 'No se pudieron consultar los estados operativos; no se muestran valores sustitutos.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
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
  private async perform(action: () => Promise<void>) {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); }
    catch (error) {
        if (this.session.user() !== identity) return;
        this.error = error instanceof HttpErrorResponse && error.status === 409
          ? 'El extracto, la referencia o el saldo cambió. Actualiza los datos antes de reintentar.'
          : error instanceof HttpErrorResponse && error.status === 400
            ? 'Revisa las columnas CSV, los importes, las fechas y el motivo de conciliación.'
            : 'No se pudo completar la operación contable. Verifica el estado antes de reintentar.';
    } finally { if (this.session.user() === identity) this.busy = false; }
  }
}
