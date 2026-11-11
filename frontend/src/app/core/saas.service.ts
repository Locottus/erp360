import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api';
import { SessionService } from './session.service';

export type OperatorRole = 'owner' | 'billing' | 'viewer';
export type ModulePrice = { code: string; price: string };
export type Subscription = { id: string; company_id: string; company_name?: string; currency: string; revision: number; status: string; starts_on: string; renews_on: string; modules: ModulePrice[] };
export type Invoice = { id: string; subscription_id: string; reference: string; period_start: string; period_end: string; due_on: string; currency: string; total: string; paid_amount: string; credited_amount: string; balance: string; payment_status?: string; status?: string; lines: { description: string; module_code: string; amount: string }[]; credits?: { id: string; reference: string; amount: string; reason: string; issued_on: string }[] };
export type Payment = { id: string; invoice_id: string; reference: string; amount: string; reversed_amount: string; paid_on: string; method: string; reason: string; status: string };
export type Followup = { id: string; kind: string; note: string; due_on: string; promised_on?: string; owner_name?: string; status: string; revision: number };
export type Account = { id: string; name: string; billing_email: string };
export type Client = Account & { currency: string; open_balance: string; overdue_balance: string; days_overdue: number; status: string; modules: string[]; next_followup: Followup | null; followup_overdue: boolean };
export type Portfolio = { clients: Client[]; totals: { currency: string; open_balance: string; overdue_balance: string; bucket_1_30: string; bucket_31_60: string; bucket_61_90: string; bucket_90_plus: string; collected_month: string; clients_current: number; clients_overdue: number }[] };
export type SaasUser = { id?: string; user_id?: string; full_name: string; email: string; is_active?: boolean; role?: string };
export type AccountDetail = { account: Account; subscriptions: Subscription[]; invoices: Invoice[]; payments: Payment[]; followups: Followup[]; audit: { id: string; action: string; occurred_at: string; actor_name?: string; actor_user_id?: string; entity_type?: string; entity_id?: string; reason?: string }[]; users: SaasUser[] };

export function saasError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    const detail = Array.isArray(message) ? message.filter(item => typeof item === 'string').join(' · ') : typeof message === 'string' ? message : '';
    return `Error ${error.status || 'de conexión'}: ${detail || 'No se pudo completar la operación. Comprueba la conexión y actualiza antes de reintentar.'}`;
  }
  return 'No se pudo completar la operación. Actualiza y vuelve a intentarlo.';
}

@Injectable({ providedIn: 'root' })
export class SaasService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly roleValue = signal<OperatorRole | null>(null);
  private readonly checkedIdentity = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly identity = computed(() => {
    const user = this.session.user();
    return user ? `${user.id}:${user.companyId}:${this.session.getAccessToken()}` : '';
  });
  readonly role = computed(() => this.checkedIdentity() === this.identity() ? this.roleValue() : null);
  readonly writable = computed(() => this.role() === 'owner' || this.role() === 'billing');
  private generation = 0;
  constructor() {
    effect(() => {
      const identity = this.identity();
      untracked(() => {
        this.generation++;
        this.roleValue.set(null); this.checkedIdentity.set(''); this.error.set(''); this.loading.set(false);
        if (identity) void this.loadOperator();
      });
    });
  }
  async loadOperator() {
    if (!this.identity()) return;
    const identity = this.identity();
    const generation = ++this.generation;
    this.loading.set(true); this.error.set(''); this.roleValue.set(null);
    try {
      const response = await this.get<{ role: string | null }>('/operator');
      if (generation !== this.generation || identity !== this.identity()) return;
      this.checkedIdentity.set(identity);
      this.roleValue.set(response.role === 'owner' || response.role === 'billing' || response.role === 'viewer' ? response.role : null);
    } catch (error) {
      if (generation === this.generation && identity === this.identity()) this.error.set(saasError(error));
    } finally { if (generation === this.generation && identity === this.identity()) this.loading.set(false); }
  }
  get<T>(path: string) { return firstValueFrom(this.http.get<T>(`${API_BASE_URL}/saas${path}`)); }
  post<T = unknown>(path: string, body: unknown) { return firstValueFrom(this.http.post<T>(`${API_BASE_URL}/saas${path}`, body)); }
  patch(path: string, body: unknown) { return firstValueFrom(this.http.patch(`${API_BASE_URL}/saas${path}`, body)); }
  csv(asOf: string) { return firstValueFrom(this.http.get(`${API_BASE_URL}/saas/portfolio.csv`, { params: { asOf }, responseType: 'blob' })); }
}
