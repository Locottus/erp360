import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type User = { id: string; email: string; full_name: string; is_active: boolean; roles: string[]; management_revision: number; mfa_enabled?: boolean };
type RbacPermission = { code: string; resource: string; action: string; description: string };

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">ADMINISTRACIÓN</p><h1>Usuarios y permisos</h1>
        <p>Las cuentas pertenecen a la empresa actual. Los cambios de permisos invalidan sus sesiones.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere un administrador de la empresa.</p> }
      @else {
        @if (secret) {
          <article class="surface-card"><h2>Clave de activación o recuperación · una sola vez</h2>
            <p>Entrégala por un canal privado. El usuario debe abrir Acceso → Activar cuenta o restablecer contraseña.
              No se envía correo automáticamente.</p>
            <code class="one-time-secret">{{ secret }}</code>
            <button type="button" class="btn btn-secondary" (click)="secret = ''">Ocultar clave</button>
          </article>
        }
        <article class="surface-card"><h2>{{ editingId ? 'Editar usuario' : 'Invitar usuario' }}</h2>
          <form class="form-grid" #userForm="ngForm" (ngSubmit)="save()">
            <label>Nombre completo<input name="name" [(ngModel)]="form.fullName" maxlength="180" required /></label>
            <label>Correo de acceso<input name="email" type="email" email [(ngModel)]="form.email" [disabled]="!!editingId" maxlength="255" required /></label>
            <fieldset><legend>Roles</legend>
              @for (role of availableRoles; track role.code) {
                <label class="consent"><input type="checkbox" [name]="role.code" [ngModel]="form.roles.includes(role.code)"
                  (ngModelChange)="toggleRole(role.code, $event)" /> {{ role.label }}</label>
              }
            </fieldset>
            <p class="muted">Administrador habilita las escrituras de los módulos actuales. Ventas y Compras
              habilitan sus indicadores; Consulta no concede permisos administrativos.</p>
            @if (editingId) {
              <label class="consent"><input name="active" type="checkbox" [(ngModel)]="form.isActive" /> Cuenta activa</label>
              <label>Motivo del cambio de usuario<input name="userReason" [(ngModel)]="reason" minlength="10" maxlength="1000" required /></label>
              <p class="muted">Revisión {{ expectedRevision }}. Si otra persona guarda primero, actualiza la lista y vuelve a editar.</p>
            }
            <div class="quick-actions"><button class="btn btn-primary" type="submit" [disabled]="busy || userForm.invalid || !form.roles.length">Guardar</button>
              <button class="btn btn-secondary" type="button" (click)="resetForm()" [disabled]="busy">Cancelar edición</button></div>
          </form>
        </article>
        <article class="surface-card"><div class="header-with-action"><h2>Cuentas de la empresa</h2>
          <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="busy">Actualizar</button></div>
          <label>Motivo del restablecimiento MFA
            <input name="mfaResetReason" [(ngModel)]="mfaResetReason" minlength="10" maxlength="1000" required />
          </label>
          <div class="table-scroll"><table class="table-list"><caption>Sin contraseñas ni tokens recuperables</caption>
            <thead><tr><th>Usuario</th><th>Roles</th><th>Estado</th><th>MFA</th><th>Acciones</th></tr></thead>
            <tbody>@for (user of users; track user.id) { <tr><th scope="row">{{ user.full_name }}<br>{{ user.email }}</th>
              <td>{{ user.roles.join(', ') }}</td><td>{{ user.is_active ? 'Activo' : 'Inactivo' }}</td>
              <td>{{ user.mfa_enabled ? 'Activado' : 'Desactivado' }}</td>
              <td><div class="quick-actions">
                <button class="btn btn-secondary" type="button" (click)="edit(user)" [disabled]="busy">Editar</button>
                <button class="btn btn-secondary" type="button" (click)="revoke(user)" [disabled]="busy">Revocar sesiones</button>
                <button class="btn btn-secondary" type="button" (click)="issueReset(user)" [disabled]="busy || !user.is_active">Recuperación</button>
                <button class="btn btn-secondary" type="button" (click)="resetMfa(user)" [disabled]="busy || !user.is_active || !user.mfa_enabled || mfaResetReason.trim().length < 10">Restablecer MFA</button>
              </div></td></tr> }</tbody>
          </table></div>
        </article>
        <article class="surface-card">
          <h2>Permisos extraordinarios de la empresa</h2>
          <p class="muted">Los overrides se aplican sobre los roles globales. Denegar tiene prioridad sobre el permiso heredado.</p>
          <label>Motivo del cambio<input [(ngModel)]="rbacReason" name="rbacReason" minlength="10" maxlength="1000" required /></label>
          <div class="table-scroll"><table class="table-list">
            <thead><tr><th>Permiso</th><th>Descripción</th><th>Efecto</th></tr></thead>
            <tbody>
              @for (permission of rbacPermissions; track permission.code) {
                <tr><th scope="row">{{ permission.code }}</th><td>{{ permission.description }}</td>
                  <td><select [ngModel]="overrideEffects[permission.code] || ''"
                    (ngModelChange)="setOverride(permission.code, $event)">
                    <option value="">Predeterminado del rol</option>
                    <option value="grant">Otorgar</option>
                    <option value="deny">Denegar</option>
                  </select></td></tr>
              }
            </tbody>
          </table></div>
          <button type="button" class="btn btn-primary" (click)="saveRbac()"
            [disabled]="busy || rbacReason.trim().length < 10">Guardar permisos</button>
        </article>
      }
    </section>
  `,
})
export class UsersComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  readonly availableRoles = [{ code: 'admin', label: 'Administrador' }, { code: 'accountant', label: 'Contabilidad' }, { code: 'sales', label: 'Ventas' },
    { code: 'purchases', label: 'Compras' }, { code: 'employee', label: 'Consulta' }];
  users: User[] = [];
  rbacPermissions: RbacPermission[] = [];
  rbacRevision = 0;
  rbacReason = '';
  overrideEffects: Record<string, 'grant' | 'deny'> = {};
  form = { email: '', fullName: '', roles: ['employee'], isActive: true };
  editingId = ''; error = ''; message = ''; secret = ''; busy = false;
  expectedRevision = 0; reason = ''; mfaResetReason = '';
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.users = []; this.secret = ''; this.error = ''; this.message = ''; this.busy = false; this.resetForm();
        if (user?.roles.includes('admin')) void this.load();
      });
    });
  }
  async load() {
    const user = this.session.user();
    if (!this.isAdmin) return;
    try {
      const users = await firstValueFrom(this.http.get<User[]>(`${API_BASE_URL}/auth/users`));
      if (this.session.user() !== user) return;
      const rbac = await firstValueFrom(this.http.get<{
        revision: number;
        permissions: RbacPermission[];
        overrides: Array<{ permission_code: string; effect: 'grant' | 'deny' }>;
      }>(`${API_BASE_URL}/auth/rbac`));
      if (this.session.user() === user) {
        this.users = users;
        this.rbacPermissions = rbac.permissions;
        this.rbacRevision = rbac.revision;
        this.overrideEffects = {};
        for (const override of rbac.overrides)
          this.overrideEffects[override.permission_code] = override.effect;
      }
    } catch { if (this.session.user() === user) this.error = 'No se pudieron cargar los usuarios.'; }
  }
  setOverride(code: string, effect: '' | 'grant' | 'deny') {
    if (!effect) delete this.overrideEffects[code];
    else this.overrideEffects = { ...this.overrideEffects, [code]: effect };
  }
  async saveRbac() {
    if (this.busy || this.rbacReason.trim().length < 10) return;
    await this.perform(async () => {
      await firstValueFrom(this.http.patch(`${API_BASE_URL}/auth/rbac/overrides`, {
        expectedRevision: this.rbacRevision,
        reason: this.rbacReason,
        overrides: Object.entries(this.overrideEffects).map(([permissionCode, effect]) => ({
          permissionCode,
          effect,
        })),
      }));
      this.rbacReason = '';
      await this.load();
      return { clearForm: false };
    });
  }
  toggleRole(code: string, checked: boolean) {
    this.form.roles = checked ? [...this.form.roles, code] : this.form.roles.filter(role => role !== code);
  }
  edit(user: User) {
    this.editingId = user.id;
    this.expectedRevision = user.management_revision; this.reason = ''; this.secret = '';
    this.form = { email: user.email, fullName: user.full_name, roles: [...user.roles], isActive: user.is_active };
  }
  resetForm() { this.editingId = ''; this.expectedRevision = 0; this.reason = ''; this.form = { email: '', fullName: '', roles: ['employee'], isActive: true }; }
  async save() {
    const id = this.editingId;
    const data = { ...this.form, roles: [...this.form.roles], expectedRevision: this.expectedRevision, reason: this.reason };
    if (id && this.reason.trim().length < 10) { this.error = 'Indica un motivo de al menos 10 caracteres.'; return; }
    await this.perform(async () => {
      if (id) {
        await firstValueFrom(this.http.patch(`${API_BASE_URL}/auth/users/${id}`, data));
        return { logout: id === this.session.user()?.id, clearForm: true };
      } else {
        const result = await firstValueFrom(this.http.post<{ activationToken: string }>(`${API_BASE_URL}/auth/users`, data));
        return { secret: result.activationToken, clearForm: true };
      }
    });
  }
  async revoke(user: User) {
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/auth/users/${user.id}/revoke-sessions`, {}));
      return { logout: user.id === this.session.user()?.id };
    });
  }
  async issueReset(user: User) {
    await this.perform(async () => {
      const result = await firstValueFrom(this.http.post<{ resetToken: string }>(`${API_BASE_URL}/auth/users/${user.id}/reset-password`, {}));
      return { secret: result.resetToken };
    });
  }
  async resetMfa(user: User) {
    if (this.mfaResetReason.trim().length < 10) {
      this.error = 'Indica un motivo de al menos 10 caracteres para restablecer MFA.';
      return;
    }
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/auth/users/${user.id}/reset-mfa`, {
        expectedRevision: user.management_revision,
        reason: this.mfaResetReason,
      }));
      this.mfaResetReason = '';
      user.mfa_enabled = false;
      user.management_revision++;
      return { logout: user.id === this.session.user()?.id, reload: false };
    });
  }
  private async perform(action: () => Promise<{ secret?: string; logout?: boolean; clearForm?: boolean; reload?: boolean }>) {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = ''; this.secret = '';
    try {
      const result = await action();
      if (this.session.user() !== identity) return;
      if (result.logout) { this.session.logout(); return; }
      this.secret = result.secret ?? '';
      if (result.clearForm) this.resetForm();
      if (result.reload !== false) await this.load();
      if (this.session.user() === identity && !this.error) this.message = 'Operación registrada.';
    }
    catch (error) {
      if (this.session.user() !== identity) return;
      this.error = error instanceof HttpErrorResponse && error.status === 400
        ? 'Revisa los datos. Debe conservarse al menos un administrador activo.'
        : error instanceof HttpErrorResponse && error.status === 409
          ? 'Conflicto: actualiza la lista y vuelve a editar. Si invitas, comprueba que el correo no exista.' : 'La operación no pudo completarse.';
    } finally { if (this.session.user() === identity) this.busy = false; }
  }
}
