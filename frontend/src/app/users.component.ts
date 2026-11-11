import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type User = { id: string; email: string; full_name: string; is_active: boolean; roles: string[]; management_revision: number };

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
          <div class="table-scroll"><table class="table-list"><caption>Sin contraseñas ni tokens recuperables</caption>
            <thead><tr><th>Usuario</th><th>Roles</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>@for (user of users; track user.id) { <tr><th scope="row">{{ user.full_name }}<br>{{ user.email }}</th>
              <td>{{ user.roles.join(', ') }}</td><td>{{ user.is_active ? 'Activo' : 'Inactivo' }}</td>
              <td><div class="quick-actions">
                <button class="btn btn-secondary" type="button" (click)="edit(user)" [disabled]="busy">Editar</button>
                <button class="btn btn-secondary" type="button" (click)="revoke(user)" [disabled]="busy">Revocar sesiones</button>
                <button class="btn btn-secondary" type="button" (click)="issueReset(user)" [disabled]="busy || !user.is_active">Recuperación</button>
              </div></td></tr> }</tbody>
          </table></div>
        </article>
      }
    </section>
  `,
})
export class UsersComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  readonly availableRoles = [{ code: 'admin', label: 'Administrador' }, { code: 'sales', label: 'Ventas' },
    { code: 'purchases', label: 'Compras' }, { code: 'employee', label: 'Consulta' }];
  users: User[] = [];
  form = { email: '', fullName: '', roles: ['employee'], isActive: true };
  editingId = ''; error = ''; message = ''; secret = ''; busy = false;
  expectedRevision = 0; reason = '';
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
      if (this.session.user() === user) this.users = users;
    } catch { if (this.session.user() === user) this.error = 'No se pudieron cargar los usuarios.'; }
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
  private async perform(action: () => Promise<{ secret?: string; logout?: boolean; clearForm?: boolean }>) {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = ''; this.secret = '';
    try {
      const result = await action();
      if (this.session.user() !== identity) return;
      if (result.logout) { this.session.logout(); return; }
      this.secret = result.secret ?? '';
      if (result.clearForm) this.resetForm();
      await this.load();
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
