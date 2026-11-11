import { CommonModule } from '@angular/common';
import { Component, effect, inject, untracked } from '@angular/core';
import { SessionService } from './core/session.service';
import { SaasService, Subscription, saasError } from './core/saas.service';

type OwnSubscription = {
  subscription: Subscription | null;
  access: 'informational';
  company?: { id: string; code: string; name: string };
  balance?: { currency: string; open_balance: string; overdue_balance: string; as_of: string };
  users?: { total_count: number; active_count: number };
};

@Component({
  selector: 'app-subscription', standalone: true, imports: [CommonModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow"><i class="bi bi-card-checklist" aria-hidden="true"></i> MI EMPRESA</p><h1>Mi suscripción SaaS</h1><p>Contrato comercial de ERP360 · consulta de solo lectura.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (!saas.identity()) { <p role="alert">Inicia sesión para consultar la suscripción de tu empresa.</p> }
      @else {
        <button class="btn btn-secondary" (click)="reload()" [disabled]="busy">Actualizar suscripción</button>
        @if (busy) { <p role="status">Cargando suscripción de tu empresa…</p> }
        @if (data; as own) {
          <article class="surface-card"><h2>{{ own.company?.name || session.company()?.name || 'Empresa de tu sesión' }}</h2><p>{{ own.company?.code || session.company()?.code }}</p>
            @if (own.subscription; as contract) {
              <p>Estado: <strong>{{ contract.status }}</strong> · revisión {{ contract.revision }}</p>
              <div class="panel-grid">
                <div><h3>Período contratado</h3><p>Inicio: {{ contract.starts_on.slice(0, 10) }}<br>Próxima renovación: {{ contract.renews_on.slice(0, 10) }}</p></div>
                <div><h3>Saldo SaaS actual</h3>@if (own.balance) { <p class="amount">Abierto: {{ own.balance.open_balance }} {{ own.balance.currency }}<br>Vencido: {{ own.balance.overdue_balance }} {{ own.balance.currency }}</p><p>Al {{ own.balance.as_of.slice(0, 10) }} · solo tu empresa.</p> } @else { <p>Saldo no disponible. Consulta al operador.</p> }</div>
                <div><h3>Usuarios de tu empresa</h3>@if (own.users) { <p>{{ own.users.active_count }} activos · {{ own.users.total_count }} registrados</p> } @else { <p>Recuento no disponible. Consulta Usuarios con los permisos correspondientes.</p> }</div>
              </div>
              <div class="table-scroll"><table class="table-list"><caption>Módulos contratados y precios por período · {{ contract.currency }}</caption><thead><tr><th>Módulo</th><th>Precio periódico</th></tr></thead><tbody>@for (module of contract.modules; track module.code) { <tr><th scope="row">{{ module.code }}</th><td class="amount">{{ module.price }} {{ contract.currency }}</td></tr> }@empty { <tr><td colspan="2">Sin módulos informados.</td></tr> }</tbody></table></div>
            } @else { <p>No hay una suscripción activa registrada para tu empresa. Contacta al operador de plataforma.</p> }
          </article>
          <aside class="surface-card"><h2>Derechos informativos, sin bloqueo automático</h2><p>Los módulos y precios describen el contrato, no activan funciones ni aplican restricciones por saldo. No hay cobro automático ni pasarela configurada.</p><p>Para modificar el contrato, conciliar el saldo o registrar un pago ya recibido, contacta al operador. Esto no es la facturación de tus ventas operativas.</p></aside>
        }
      }
    </section>
  `,
  styles: [`:host { display: block; min-width: 0; } table { min-width: 26rem; } th, .amount { white-space: nowrap; } .amount { font-variant-numeric: tabular-nums; }`],
})
export class SubscriptionComponent {
  readonly saas = inject(SaasService);
  readonly session = inject(SessionService);
  data: OwnSubscription | null = null;
  busy = false; error = '';
  private generation = 0;
  constructor() {
    effect(() => {
      const identity = this.saas.identity();
      untracked(() => {
        this.generation++; this.data = null; this.busy = false; this.error = '';
        if (identity) void this.reload();
      });
    });
  }
  async reload() {
    if (!this.saas.identity() || this.busy) return;
    const generation = this.generation; const identity = this.saas.identity();
    this.busy = true; this.error = '';
    try {
      const data = await this.saas.get<OwnSubscription>('/subscription');
      if (generation === this.generation && identity === this.saas.identity()) this.data = data;
    } catch (error) { if (generation === this.generation && identity === this.saas.identity()) this.error = saasError(error); }
    finally { if (generation === this.generation && identity === this.saas.identity()) this.busy = false; }
  }
}
