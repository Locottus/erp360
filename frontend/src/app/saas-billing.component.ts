import { CommonModule } from '@angular/common';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccountDetail, Followup, ModulePrice, Portfolio, SaasService, SaasUser, Subscription, saasError } from './core/saas.service';
import { AssistantAdminComponent } from './assistant-admin.component';

export const SAAS_MODULES = ['base', 'sales', 'purchases', 'inventory', 'accounting', 'store', 'people'];
export const today = () => new Date().toISOString().slice(0, 10);
export const decimal = (value: string, positive = false) => /^\d{1,12}(\.\d{1,4})?$/.test(value) && (!positive || /[1-9]/.test(value));
const units = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
};
type CollectionQueue = { as_of: string; items: { invoice_id: string; account_id: string; account_name: string; company_name: string; reference: string; currency: string; balance: string; due_on: string; days_overdue: number; stage: string; already_prepared: boolean; paused: boolean }[] };

@Component({
  selector: 'app-saas-billing', standalone: true, imports: [CommonModule, FormsModule, AssistantAdminComponent],
  templateUrl: './saas-billing.component.html', styleUrl: './saas-billing.component.scss',
})
export class SaasBillingComponent {
  readonly saas = inject(SaasService);
  readonly moduleCodes = SAAS_MODULES;
  asOf = today(); reportDate = ''; search = ''; status = ''; moduleFilter = ''; followupFilter = '';
  portfolio: Portfolio = { clients: [], totals: [] };
  companies: { id: string; code: string; name: string }[] = [];
  operators: SaasUser[] = [];
  detail: AccountDetail | null = null;
  selectedId = ''; error = ''; message = ''; busy = false; detailBusy = false;
  queue: CollectionQueue | null = null; queueConfirmed = false;
  private generation = 0; private detailGeneration = 0;
  accountForm = { name: '', billingEmail: '' };
  contract = this.emptyContract();
  invoiceForm = { subscriptionId: '', reference: '', periodStart: today(), periodEnd: today(), dueOn: today() };
  money = this.emptyMoney();
  followup = { kind: 'note', note: '', dueOn: today(), promisedOn: '', ownerId: '' };
  followupEdit = { id: '', expectedRevision: 0, status: 'open', note: '' };
  constructor() {
    effect(() => {
      const identity = this.saas.identity(); const role = this.saas.role();
      untracked(() => {
        this.generation++; this.detailGeneration++;
        this.portfolio = { clients: [], totals: [] }; this.companies = []; this.operators = [];
        this.detail = null; this.selectedId = ''; this.error = ''; this.message = ''; this.busy = false; this.detailBusy = false;
        this.reportDate = ''; this.search = ''; this.status = ''; this.moduleFilter = ''; this.followupFilter = '';
        this.queue = null; this.queueConfirmed = false;
        this.resetForms();
        if (identity && role) void this.refresh();
      });
    });
  }
  emptyContract() { return { id: '', companyId: '', currency: 'USD', startsOn: today(), renewsOn: today(), expectedRevision: 0, reason: '', modules: SAAS_MODULES.map(code => ({ code, enabled: code === 'base', price: '0.0000' })) }; }
  emptyMoney() { return { kind: 'payment', invoiceId: '', paymentId: '', reference: '', amount: '', date: today(), method: 'transfer', reason: '', confirmed: false }; }
  resetForms() {
    this.accountForm = { name: '', billingEmail: '' }; this.contract = this.emptyContract(); this.money = this.emptyMoney();
    this.invoiceForm = { subscriptionId: '', reference: '', periodStart: today(), periodEnd: today(), dueOn: today() };
    this.followup = { kind: 'note', note: '', dueOn: today(), promisedOn: '', ownerId: '' };
    this.followupEdit = { id: '', expectedRevision: 0, status: 'open', note: '' };
  }
  get filteredClients() {
    const query = this.search.toLocaleLowerCase();
    return this.portfolio.clients.filter(row => `${row.name} ${row.billing_email}`.toLocaleLowerCase().includes(query)
      && (!this.status || row.status === this.status) && (!this.moduleFilter || row.modules.includes(this.moduleFilter))
      && (!this.followupFilter || (this.followupFilter === 'overdue' ? row.followup_overdue : this.followupFilter === 'none' ? !row.next_followup : !!row.next_followup)));
  }
  async refresh() {
    if (!this.saas.role() || this.busy || !this.asOf) return;
    const generation = this.generation; const cutoff = this.asOf; const identity = this.saas.identity();
    this.busy = true; this.error = '';
    try {
      const [portfolio, companies, operators] = await Promise.all([
        this.saas.get<Portfolio>(`/portfolio?asOf=${encodeURIComponent(cutoff)}`),
        this.saas.get<typeof this.companies>('/companies'), this.saas.get<SaasUser[]>('/operators'),
      ]);
      if (!this.isCurrent(generation, identity)) return;
      this.portfolio = portfolio; this.reportDate = cutoff; this.companies = companies; this.operators = operators;
    } catch (error) { if (this.isCurrent(generation, identity)) this.error = saasError(error); }
    finally { if (this.isCurrent(generation, identity)) this.busy = false; }
  }
  async selectAccount(id: string) {
    if (!this.saas.role()) return;
    const generation = this.generation; const request = ++this.detailGeneration; const identity = this.saas.identity();
    this.selectedId = id; this.detail = null; this.detailBusy = true; this.resetForms(); this.error = '';
    try {
      const detail = await this.saas.get<AccountDetail>(`/accounts/${encodeURIComponent(id)}`);
      if (this.isCurrent(generation, identity) && request === this.detailGeneration) this.detail = detail;
    } catch (error) { if (this.isCurrent(generation, identity) && request === this.detailGeneration) this.error = saasError(error); }
    finally { if (this.isCurrent(generation, identity) && request === this.detailGeneration) this.detailBusy = false; }
  }
  editContract(row: Subscription) {
    this.contract = { id: row.id, companyId: row.company_id, currency: row.currency, startsOn: row.starts_on.slice(0, 10), renewsOn: row.renews_on.slice(0, 10), expectedRevision: row.revision, reason: '',
      modules: SAAS_MODULES.map(code => ({ code, enabled: row.modules.some(item => item.code === code), price: row.modules.find(item => item.code === code)?.price ?? '0.0000' })) };
  }
  get contractValid() {
    const rows = this.contract.modules.filter(row => row.enabled);
    return !!this.selectedId && !!this.contract.companyId && !!this.contract.startsOn && !!this.contract.renewsOn && this.contract.renewsOn >= this.contract.startsOn
      && rows.some(row => row.code === 'base') && rows.every(row => decimal(row.price)) && (!this.contract.id || this.contract.reason.trim().length >= 10);
  }
  async saveContract() {
    if (!this.contractValid) return;
    const modules: ModulePrice[] = this.contract.modules.filter(row => row.enabled).map(({ code, price }) => ({ code, price }));
    if (this.contract.id) await this.write(`/subscriptions/${this.contract.id}`, { expectedRevision: this.contract.expectedRevision, modules, renewsOn: this.contract.renewsOn, reason: this.contract.reason.trim() }, true);
    else await this.write('/subscriptions', { accountId: this.selectedId, companyId: this.contract.companyId, currency: this.contract.currency, modules, startsOn: this.contract.startsOn, renewsOn: this.contract.renewsOn });
  }
  async createAccount() {
    if (!this.accountForm.name.trim() || this.accountForm.name.trim().length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.accountForm.billingEmail)) return;
    await this.write('/accounts', { name: this.accountForm.name.trim(), billingEmail: this.accountForm.billingEmail.trim() });
  }
  get invoiceValid() { const f = this.invoiceForm; return !!f.subscriptionId && !!f.reference.trim() && !!f.periodStart && !!f.periodEnd && !!f.dueOn && f.periodStart <= f.periodEnd && f.dueOn >= f.periodStart; }
  async createInvoice() {
    if (!this.invoiceValid) return;
    const { subscriptionId, ...body } = this.invoiceForm;
    await this.write(`/subscriptions/${subscriptionId}/invoices`, body);
  }
  get moneyValid() {
    const f = this.money;
    if (!f.confirmed || !f.reference.trim() || f.reason.trim().length < 10) return false;
    if (f.kind === 'reverse') {
      const payment = this.detail?.payments.find(row => row.id === f.paymentId);
      return !!payment && units(payment.amount) > units(payment.reversed_amount);
    }
    const invoice = this.detail?.invoices.find(row => row.id === f.invoiceId);
    return !!invoice && !!f.date && decimal(f.amount, true) && units(f.amount) <= units(invoice.balance);
  }
  async recordMoney() {
    if (!this.moneyValid) return;
    const f = this.money;
    if (f.kind === 'reverse') await this.write(`/payments/${f.paymentId}/reverse`, { reference: f.reference.trim(), reason: f.reason.trim() });
    else if (f.kind === 'credit') await this.write(`/invoices/${f.invoiceId}/credits`, { reference: f.reference.trim(), amount: f.amount, reason: f.reason.trim(), issuedOn: f.date });
    else await this.write(`/invoices/${f.invoiceId}/payments`, { reference: f.reference.trim(), amount: f.amount, paidOn: f.date, method: f.method, reason: f.reason.trim() });
  }
  async createFollowup() {
    if (!this.followup.note.trim() || !this.followup.dueOn || (this.followup.kind === 'promise' && !this.followup.promisedOn)) return;
    await this.write(`/accounts/${this.selectedId}/followups`, { kind: this.followup.kind, note: this.followup.note.trim(), dueOn: this.followup.dueOn, ...(this.followup.promisedOn ? { promisedOn: this.followup.promisedOn } : {}), ...(this.followup.ownerId ? { ownerId: this.followup.ownerId } : {}) });
  }
  editFollowup(row: Followup) { this.followupEdit = { id: row.id, expectedRevision: row.revision, status: row.status, note: '' }; }
  async saveFollowup() {
    if (!this.followupEdit.id || !this.followupEdit.note.trim()) return;
    const { id, ...body } = this.followupEdit;
    await this.write(`/followups/${id}`, body, true);
  }
  async write(path: string, body: unknown, patch = false) {
    if (!this.saas.writable() || this.busy || this.detailBusy) return;
    const generation = this.generation; const selected = this.selectedId; const identity = this.saas.identity();
    this.busy = true; this.error = ''; this.message = '';
    try {
      await (patch ? this.saas.patch(path, body) : this.saas.post(path, body));
      if (!this.isCurrent(generation, identity)) return;
      this.message = 'Operación registrada. Historial conservado; no se envió dinero ni correo.';
      this.busy = false; this.resetForms();
      await Promise.all([this.refresh(), selected ? this.selectAccount(selected) : Promise.resolve()]);
    } catch (error) { if (this.isCurrent(generation, identity)) this.error = saasError(error); }
    finally { if (this.isCurrent(generation, identity)) this.busy = false; }
  }
  async exportCsv() {
    if (!this.saas.role() || this.busy || !this.reportDate) return;
    const generation = this.generation; const identity = this.saas.identity(); this.busy = true; this.error = '';
    try {
      const blob = await this.saas.csv(this.reportDate);
      if (!this.isCurrent(generation, identity)) return;
      // Only download the authenticated, server-sanitized CSV; never assemble cells from names in the DOM.
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `saas-cartera-${this.reportDate}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (this.isCurrent(generation, identity)) this.error = saasError(error); }
    finally { if (this.isCurrent(generation, identity)) this.busy = false; }
  }
  private isCurrent(generation: number, identity: string) { return generation === this.generation && identity === this.saas.identity() && !!this.saas.role(); }
  async loadQueue() {
    if (!this.saas.role() || this.busy || !this.asOf) return;
    const generation = this.generation; const identity = this.saas.identity();
    this.busy = true; this.error = ''; this.queueConfirmed = false;
    try {
      const queue = await this.saas.get<CollectionQueue>(`/collection-queue?asOf=${encodeURIComponent(this.asOf)}`);
      if (this.isCurrent(generation, identity)) this.queue = queue;
    } catch (error) { if (this.isCurrent(generation, identity)) this.error = saasError(error); }
    finally { if (this.isCurrent(generation, identity)) this.busy = false; }
  }
  async prepareQueue() {
    if (!this.saas.writable() || this.busy || !this.queueConfirmed || !this.queue || this.queue.as_of !== this.asOf) return;
    const generation = this.generation; const identity = this.saas.identity(); const asOf = this.queue.as_of;
    this.busy = true; this.error = ''; this.message = '';
    try {
      const result = await this.saas.post<{ created: number; skipped_paid: number; skipped_paused: number; already_run: number }>('/collection-runs', { asOf });
      if (!this.isCurrent(generation, identity)) return;
      this.message = `Tareas internas creadas: ${result.created}. Ya preparadas: ${result.already_run}. Pagadas omitidas: ${result.skipped_paid}. Pausadas omitidas: ${result.skipped_paused}. No se envió ningún correo ni se cobró dinero.`;
      this.busy = false; await this.loadQueue();
      if (this.selectedId) await this.selectAccount(this.selectedId);
    } catch (error) { if (this.isCurrent(generation, identity)) this.error = saasError(error); }
    finally { if (this.isCurrent(generation, identity)) this.busy = false; }
  }
  companyName(id: string) { return this.companies.find(row => row.id === id)?.name ?? id; }
  invoiceLabel(id: string) { return this.detail?.invoices.find(row => row.id === id)?.reference ?? id; }
  statusLabel(status: string) { return ({ al_dia: 'Al día', overdue: 'Vencido', no_contract: 'Sin contrato', open: 'Abierto', done: 'Hecho', paused: 'Pausado' } as Record<string, string>)[status] ?? status; }
}
