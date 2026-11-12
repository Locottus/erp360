import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AssistantApiService, assistantError, type AiCompany, type AiProvider, type AiType, type ProviderConfig, type ProviderOption } from './core/assistant-api.service';
import { SaasService } from './core/saas.service';

@Component({
  selector: 'app-assistant-admin',
  imports: [CommonModule, FormsModule],
  styles: ['.status { display: block; margin: .75rem 0; } details { margin-top: 1rem; padding: .75rem; border: 1px solid var(--border); border-radius: .75rem; } summary { min-height: 44px; cursor: pointer; font-weight: 600; } details[open] > summary { margin-bottom: .75rem; }'],
  template: `
    <p>Servicio independiente de la facturación operativa. La bolsa mensual de tokens pertenece a la empresa y suma los servicios activos de sus usuarios. No envía documentos al proveedor.</p>
    @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
    @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
    <label>Empresa para servicio de IA<select name="aiCompany" [(ngModel)]="companyId" (ngModelChange)="loadCompany()" [disabled]="busy">
      <option value="">Selecciona una empresa</option>
      @for (company of companies(); track company.id) { <option [value]="company.id">{{ company.code }} · {{ company.name }}</option> }
    </select></label>
    @if (data; as detail) {
      <p>Mes {{ detail.usage.month.slice(0, 7) }} UTC · incluidos {{ detail.usage.includedTokens }} · adicionales {{ detail.usage.extraTokens }} · consumidos {{ detail.usage.usedTokens }} · reservados {{ detail.usage.reservedTokens }} · disponibles {{ detail.usage.availableTokens }}.</p>
      <button type="button" class="btn btn-secondary" (click)="refreshSummary()" [disabled]="busy">Actualizar consumo IA</button>
      @if (saas.role() === 'owner') {
        <details open><summary>Proveedor Adapter</summary>
        <form class="form-grid" #providerForm="ngForm" (ngSubmit)="saveProvider()">
          <label>Proveedor de IA<select name="aiProvider" [(ngModel)]="selection" (ngModelChange)="loadProvider()" [disabled]="busy" required>
            @for (option of options; track option.code) { <option [value]="option.code">{{ option.label }}</option> }
          </select></label>
          @if (config; as current) {
            <label>Modelo IA<select name="aiModel" [(ngModel)]="current.model" required [disabled]="busy">
              @for (model of models; track model) { <option [value]="model">{{ model }}</option> }
            </select></label>
            <label>API key de {{ selection }}<input name="aiApiKey" type="password" autocomplete="new-password" [(ngModel)]="apiKey" maxlength="256"
              [placeholder]="current.keyConfigured ? 'Configurada; deja vacío para conservarla' : 'Introduce una clave válida'" [disabled]="busy" /></label>
            <label class="consent"><input type="checkbox" name="aiEnabled" [(ngModel)]="current.enabled" [disabled]="busy" />Habilitar este proveedor y deshabilitar los otros de esta empresa</label>
            <label>Motivo del cambio de proveedor<input name="aiProviderReason" [(ngModel)]="providerReason" required minlength="10" maxlength="2000" [disabled]="busy" /></label>
            <button class="btn btn-primary" type="submit" [disabled]="busy || providerForm.invalid || (current.enabled && !current.keyConfigured && !apiKey.trim())">Guardar proveedor IA</button>
          }
        </form>
        <p>Las claves se almacenan cifradas. Cambiar proveedor no reinicia consumo ni cuota; cada proveedor conserva su propia clave. No se prueba la clave ni se genera un cargo al guardar.</p>
        </details>
      } @else { <p>Solo owner puede elegir el proveedor y configurar credenciales.</p> }
      <details><summary>Servicio por usuario</summary>
      <div class="table-scroll"><table class="table-list"><caption>Usuarios de la empresa seleccionada</caption>
        <thead><tr><th>Usuario</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>
          @for (user of detail.users; track user.id) { <tr><th scope="row">{{ user.full_name }}</th><td>{{ user.service_code || 'Sin servicio' }}</td><td>{{ user.enabled && user.is_active ? 'Activo' : 'Sin acceso IA' }}</td></tr> }
        </tbody></table></div>
      @if (saas.writable()) {
        <form class="form-grid" #assignmentForm="ngForm" (ngSubmit)="assign()">
          <label>Usuario del servicio IA<select name="aiUser" [(ngModel)]="userId" required [disabled]="busy">
            <option value="">Selecciona usuario</option>
            @for (user of detail.users; track user.id) { <option [value]="user.id">{{ user.full_name }}</option> }
          </select></label>
          <label>Tipo de servicio IA<select name="aiServiceType" [(ngModel)]="serviceCode" required [disabled]="busy">
            <option value="">Selecciona servicio</option>
            @for (type of types; track type.code) { <option [value]="type.code">{{ type.name }} · {{ type.monthly_tokens }} tokens/mes</option> }
          </select></label>
          <label class="consent"><input type="checkbox" name="aiUserEnabled" [(ngModel)]="userEnabled" />Habilitar IA para este usuario</label>
          <label>Motivo del servicio<input name="aiAssignmentReason" [(ngModel)]="assignmentReason" required minlength="10" maxlength="2000" /></label>
          <button class="btn btn-primary" [disabled]="busy || assignmentForm.invalid">Guardar servicio de usuario</button>
        </form>
      }
      </details>
      @if (saas.writable()) {
        <details><summary>Ampliación por compra confirmada</summary>
        <p>Válida solo para el mes UTC actual. Registra un servicio realmente comprado; no cobra bancos ni genera factura o asiento contable.</p>
        <form class="form-grid" #purchaseForm="ngForm" (ngSubmit)="purchaseTokens()">
          <label>Tokens adicionales<input name="aiExtraTokens" type="number" [(ngModel)]="purchase.tokens" min="1" max="1000000000" required /></label>
          <label>Referencia de compra IA<input name="aiPurchaseReference" [(ngModel)]="purchase.reference" required maxlength="120" /></label>
          <label>Importe pagado USD<input name="aiPaidAmount" [(ngModel)]="purchase.paidAmount" inputmode="decimal" required pattern="[0-9]+([.][0-9]{1,4})?" /></label>
          <label>Motivo de ampliación<input name="aiPurchaseReason" [(ngModel)]="purchase.reason" required minlength="10" maxlength="2000" /></label>
          <label class="consent"><input type="checkbox" name="aiPaymentConfirmed" [(ngModel)]="purchase.paymentConfirmed" />Confirmo una compra realmente pagada por esta empresa</label>
          <button class="btn btn-primary" [disabled]="busy || purchaseForm.invalid || !purchase.paymentConfirmed">Registrar ampliación IA</button>
        </form>
        </details>
      }
      @if (detail.requests.length) {
        <h3>Reservas pendientes o inciertas</h3>
        <p>No liberes reservas por suposición. Owner puede conciliarlas por API con consumo verificado en el proveedor. Las consultas inciertas no se reintentan automáticamente.</p>
        <div class="table-scroll"><table class="table-list"><caption>Solicitudes a revisar</caption><thead><tr><th>Referencia</th><th>Proveedor</th><th>Estado</th><th>Reserva</th></tr></thead><tbody>
          @for (request of detail.requests; track request.id) { <tr><th scope="row">{{ request.id }}</th><td>{{ request.provider }}</td><td>{{ request.status }}</td><td>{{ request.reserved_tokens }}</td></tr> }
        </tbody></table></div>
      }
    }
  `,
})
export class AssistantAdminComponent {
  readonly companies = input.required<readonly { id: string; code: string; name: string }[]>();
  readonly saas = inject(SaasService);
  private readonly api = inject(AssistantApiService);
  options: ProviderOption[] = [];
  types: AiType[] = [];
  data: AiCompany | null = null;
  config: ProviderConfig | null = null;
  companyId = ''; selection: AiProvider = 'deepseek';
  apiKey = ''; providerReason = ''; userId = ''; serviceCode = ''; userEnabled = true; assignmentReason = '';
  purchase = this.emptyPurchase();
  busy = false; error = ''; message = '';
  private generation = 0;
  private summarySequence = 0;
  get models() { return this.options.find(option => option.code === this.selection)?.models ?? []; }
  constructor() {
    effect(() => {
      const identity = this.saas.identity(), role = this.saas.role();
      untracked(() => {
        this.generation++; this.companyId = ''; this.data = null; this.config = null; this.apiKey = '';
        this.options = []; this.types = []; this.providerReason = ''; this.assignmentReason = '';
        this.userId = ''; this.serviceCode = ''; this.purchase = this.emptyPurchase();
        this.busy = false; this.error = ''; this.message = '';
        if (identity && role) void this.loadOptions();
      });
    });
  }
  private emptyPurchase() { return { tokens: 10000, reference: '', paidAmount: '', reason: '', paymentConfirmed: false }; }
  private current(revision: number, id: string) { return revision === this.generation && id === this.companyId && Boolean(this.saas.role()); }
  private async loadOptions() {
    const identity = this.saas.identity(), role = this.saas.role();
    try {
      const [options, types] = await Promise.all([this.api.get<{ providers: ProviderOption[] }>('/options'), this.api.get<AiType[]>('/service-types')]);
      if (identity === this.saas.identity() && role === this.saas.role()) { this.options = options.providers; this.types = types; }
    } catch (error) { if (identity === this.saas.identity() && role === this.saas.role()) this.error = assistantError(error); }
  }
  async loadCompany() {
    const id = this.companyId, revision = ++this.generation;
    this.data = null; this.config = null; this.apiKey = ''; this.providerReason = ''; this.error = ''; this.message = '';
    this.userId = ''; this.serviceCode = ''; this.assignmentReason = ''; this.purchase = this.emptyPurchase();
    if (!id) return;
    this.busy = true;
    try {
      const [data, config] = await Promise.all([
        this.api.get<AiCompany>(`/companies/${id}`),
        this.saas.role() === 'owner' ? this.api.get<ProviderConfig>(`/companies/${id}/provider`) : Promise.resolve(null),
      ]);
      if (this.current(revision, id)) { this.data = data; this.config = config; if (config) this.selection = config.provider; }
    } catch (error) { if (this.current(revision, id)) this.error = assistantError(error); }
    finally { if (this.current(revision, id)) this.busy = false; }
  }
  async loadProvider() {
    const id = this.companyId, selection = this.selection, revision = ++this.generation;
    this.config = null; this.apiKey = ''; this.providerReason = ''; this.error = ''; this.message = '';
    this.busy = true;
    try {
      const config = await this.api.get<ProviderConfig>(`/companies/${id}/provider?provider=${selection}`);
      if (this.current(revision, id)) this.config = config;
    } catch (error) { if (this.current(revision, id)) this.error = assistantError(error); }
    finally { if (this.current(revision, id)) this.busy = false; }
  }
  async refreshSummary() {
    const id = this.companyId, revision = this.generation, sequence = ++this.summarySequence;
    if (!id) return;
    try {
      const data = await this.api.get<AiCompany>(`/companies/${id}`);
      if (this.current(revision, id) && sequence === this.summarySequence) this.data = data;
    } catch (error) { if (this.current(revision, id) && sequence === this.summarySequence) this.error = assistantError(error); }
  }
  async saveProvider() {
    if (!this.config || this.busy) return;
    const id = this.companyId, revision = this.generation;
    const body = { provider: this.selection, model: this.config.model, enabled: this.config.enabled,
      expectedRevision: this.config.revision, reason: this.providerReason, apiKey: this.apiKey.trim() || undefined };
    this.busy = true; this.error = ''; this.message = '';
    try {
      const config = await this.api.post<ProviderConfig>(`/companies/${id}/provider`, body);
      if (this.current(revision, id)) { this.config = config; this.providerReason = ''; this.message = 'Proveedor guardado. El consumo mensual no se reinició.'; }
    } catch (error) { if (this.current(revision, id)) this.error = assistantError(error); }
    finally { if (this.current(revision, id)) { this.apiKey = ''; this.busy = false; } }
  }
  async assign() {
    const user = this.data?.users.find(row => row.id === this.userId);
    if (!user || this.busy) { this.error = 'Selecciona un usuario de esta empresa.'; return; }
    const id = this.companyId, revision = this.generation;
    this.busy = true; this.error = ''; this.message = '';
    try {
      await this.api.post(`/companies/${id}/users/${user.id}/service`, { serviceCode: this.serviceCode,
        enabled: this.userEnabled, expectedRevision: user.revision, reason: this.assignmentReason });
      if (this.current(revision, id)) { this.assignmentReason = ''; this.message = 'Servicio de usuario actualizado.'; await this.refreshSummary(); }
    } catch (error) { if (this.current(revision, id)) this.error = assistantError(error); }
    finally { if (this.current(revision, id)) this.busy = false; }
  }
  async purchaseTokens() {
    if (this.busy || !this.purchase.paymentConfirmed) { this.error = 'Confirma una compra de servicio realmente pagada.'; return; }
    const id = this.companyId, revision = this.generation;
    this.busy = true; this.error = ''; this.message = '';
    try {
      await this.api.post(`/companies/${id}/token-purchases`, { ...this.purchase });
      if (this.current(revision, id)) { this.purchase = this.emptyPurchase(); this.message = 'Ampliación registrada para el mes UTC actual.'; await this.refreshSummary(); }
    } catch (error) { if (this.current(revision, id)) this.error = assistantError(error); }
    finally { if (this.current(revision, id)) this.busy = false; }
  }
}
