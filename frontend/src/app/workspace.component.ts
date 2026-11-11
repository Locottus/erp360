import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';
import { EmptyStateComponent } from './shared/empty-state.component';

type Period = 'day' | 'week' | 'month';
type Summary = {
  products: number;
  stockRows: number;
  customers: number | null;
  quotations: number | null;
  suppliers: number | null;
  purchaseRequests: number | null;
  portalTokens: number | null;
  ecommerceListings: number | null;
  ecommerceSubscribers: number | null;
};
type Overview = {
  period: Period;
  timezone: string;
  visibility: { admin: boolean; sales: boolean; purchases: boolean };
  summary: Summary;
  series: { start: string; salesOrders: number | null; purchaseOrders: number | null }[];
};
const labels: Record<keyof Summary, string> = {
  customers: 'Clientes',
  products: 'Productos',
  suppliers: 'Proveedores',
  stockRows: 'Saldos de inventario',
  quotations: 'Cotizaciones',
  purchaseRequests: 'Solicitudes de compra',
  portalTokens: 'Tokens de portal',
  ecommerceListings: 'Publicaciones eCommerce',
  ecommerceSubscribers: 'Suscriptores eCommerce',
};

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EmptyStateComponent],
  template: `
    <section class="page-shell" aria-labelledby="workspace-title">
      <header class="page-header">
        <p class="eyebrow">CENTRO DE CONTROL</p>
        <h1 id="workspace-title">Dashboard de tu empresa</h1>
        <p>
          Indicadores reales y actividad comercial. Solo se muestra el contexto de la sesión activa.
        </p>
      </header>

      @if (session.isAuthenticated()) {
        <article class="surface-card">
          <div class="header-with-action">
            <div>
              <h2>{{ session.company()?.name || 'Empresa de la sesión' }}</h2>
              <p>{{ session.user()?.fullName }} · {{ session.user()?.roles?.join(', ') }}</p>
            </div>
            <button
              type="button"
              class="btn btn-secondary"
              (click)="loadMetrics()"
              [disabled]="loading()"
            >
              <i class="bi bi-arrow-clockwise" aria-hidden="true"></i> Actualizar
            </button>
          </div>
          <p class="muted">
            Cada usuario pertenece a una empresa. Para trabajar en otra, utiliza una cuenta
            autorizada de esa empresa.
          </p>
          @if (updatedAt()) {
            <small class="muted">Última actualización: {{ updatedAt() | date: 'short' }}</small>
          }
        </article>

        @if (error()) {
          <div class="surface-card" role="alert">
            <p class="status status-error">{{ error() }}</p>
            <button class="btn btn-secondary" type="button" (click)="loadMetrics()">
              Reintentar
            </button>
          </div>
        }

        @if (loading()) {
          <div class="kpi-grid" role="status" aria-label="Cargando indicadores" aria-busy="true">
            @for (slot of skeletonSlots; track slot) {
              <div class="kpi-card skeleton-box"></div>
            }
          </div>
        } @else if (overview(); as data) {
          <div class="kpi-grid" aria-label="Totales históricos de la empresa">
            @for (widget of widgets; track widget.key) {
              <article class="kpi-card">
                <span>{{ widget.label }}</span
                ><strong>{{ widget.value | number }}</strong>
                <small class="muted">Total histórico</small>
              </article>
            }
          </div>

          <article class="surface-card" aria-labelledby="activity-title">
            <div class="header-with-action">
              <div>
                <h2 id="activity-title">
                  <i class="bi bi-bar-chart-line" aria-hidden="true"></i> Actividad por período
                </h2>
                <p>
                  Pedidos creados, excluyendo cancelados. Zona horaria UTC; semana desde el lunes.
                </p>
              </div>
              <label class="period-control"
                >Agrupar por
                <select [ngModel]="period()" (ngModelChange)="changePeriod($event)">
                  <option value="day">Día · últimos 14 días</option>
                  <option value="week">Semana · últimas 12 semanas</option>
                  <option value="month">Mes · últimos 12 meses</option>
                </select>
              </label>
            </div>
            @if (data.visibility.sales || data.visibility.purchases) {
              <div class="chart-legend">
                @if (data.visibility.sales) {
                  <span><b class="legend-dot sales"></b> Pedidos de venta</span>
                }
                @if (data.visibility.purchases) {
                  <span><b class="legend-dot purchases"></b> Órdenes de compra</span>
                }
              </div>
              @if (hasActivity) {
                <div class="chart-scroll">
                  <div
                    class="activity-chart"
                    role="img"
                    aria-label="Pedidos por período; valores exactos en la tabla inferior"
                  >
                    @for (point of data.series; track point.start) {
                      <div class="chart-column">
                        <div class="chart-bars">
                          @if (point.salesOrders !== null) {
                            <div
                              class="chart-bar sales"
                              [style.height.%]="barHeight(point.salesOrders)"
                              [attr.title]="point.start + ': ' + point.salesOrders + ' ventas'"
                            ></div>
                          }
                          @if (point.purchaseOrders !== null) {
                            <div
                              class="chart-bar purchases"
                              [style.height.%]="barHeight(point.purchaseOrders)"
                              [attr.title]="point.start + ': ' + point.purchaseOrders + ' compras'"
                            ></div>
                          }
                        </div>
                        <small>{{
                          point.start | date: (period() === 'month' ? 'MM/yy' : 'dd/MM') : 'UTC'
                        }}</small>
                      </div>
                    }
                  </div>
                </div>
              } @else {
                <app-empty-state
                  title="Sin pedidos en este período"
                  description="Las nuevas operaciones aparecerán automáticamente al actualizar el dashboard."
                  icon="bi-graph-up"
                ></app-empty-state>
              }
              <details class="chart-details">
                <summary>Ver datos del gráfico</summary>
                <div class="table-scroll">
                  <table class="table-list">
                    <caption>
                      Inicio del período (UTC) y cantidad de pedidos
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Período</th>
                        @if (data.visibility.sales) {
                          <th scope="col">Ventas</th>
                        }
                        @if (data.visibility.purchases) {
                          <th scope="col">Compras</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (point of data.series; track point.start) {
                        <tr>
                          <th scope="row">{{ point.start }}</th>
                          @if (data.visibility.sales) {
                            <td>{{ point.salesOrders }}</td>
                          }
                          @if (data.visibility.purchases) {
                            <td>{{ point.purchaseOrders }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </details>
            } @else {
              <p class="muted">
                Tu rol permite consultar inventario. Los gráficos comerciales requieren un rol
                admin, sales o purchases.
              </p>
            }
          </article>
        }
        <div class="quick-actions">
          <a routerLink="/store" class="btn btn-primary"
            ><i class="bi bi-shop" aria-hidden="true"></i> Tienda</a
          >
          <a routerLink="/portal" class="btn btn-secondary"
            ><i class="bi bi-person-vcard" aria-hidden="true"></i> Portal cliente</a
          >
        </div>
      } @else {
        <app-empty-state
          title="Inicia sesión para continuar"
          description="El dashboard carga los datos y widgets autorizados para tu empresa."
          icon="bi-shield-lock"
        >
          <a routerLink="/login" class="btn btn-primary">Ir a acceso</a>
        </app-empty-state>
      }
    </section>
  `,
})
export class WorkspaceComponent implements OnDestroy {
  readonly session = inject(SessionService);
  private readonly http = inject(HttpClient);
  readonly period = signal<Period>('day');
  readonly overview = signal<Overview | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly updatedAt = signal<Date | null>(null);
  readonly skeletonSlots = [1, 2, 3, 4, 5, 6];
  private requestId = 0;

  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.reset();
        if (user) void this.loadMetrics();
      });
    });
  }

  get widgets() {
    const summary = this.overview()?.summary;
    if (!summary) return [];
    return (Object.keys(labels) as (keyof Summary)[])
      .filter((key) => summary[key] !== null)
      .map((key) => ({ key, label: labels[key], value: summary[key] }));
  }

  get hasActivity() {
    return (
      this.overview()?.series.some(
        (point) => (point.salesOrders ?? 0) + (point.purchaseOrders ?? 0) > 0,
      ) ?? false
    );
  }

  barHeight(value: number) {
    const max = Math.max(
      1,
      ...(this.overview()?.series.flatMap((point) => [
        point.salesOrders ?? 0,
        point.purchaseOrders ?? 0,
      ]) ?? []),
    );
    return (value / max) * 100;
  }

  changePeriod(period: Period) {
    this.period.set(period);
    void this.loadMetrics();
  }

  async loadMetrics() {
    if (!this.session.isAuthenticated()) return;
    const id = ++this.requestId;
    const period = this.period();
    this.loading.set(true);
    this.error.set('');
    this.overview.set(null);
    this.updatedAt.set(null);
    try {
      const response = await firstValueFrom(
        this.http.get<Overview>(`${API_BASE_URL}/dashboard/overview`, {
          params: { period },
        }),
      );
      if (id !== this.requestId) return;
      this.overview.set(response);
      this.updatedAt.set(new Date());
    } catch (error) {
      if (id !== this.requestId) return;
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
          : 'No se pudieron cargar los indicadores. Revisa la conexión y vuelve a intentar.',
      );
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.reset();
  }

  private reset() {
    this.requestId++;
    this.overview.set(null);
    this.updatedAt.set(null);
    this.error.set('');
    this.loading.set(false);
  }
}
