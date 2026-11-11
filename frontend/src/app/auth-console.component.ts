import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { Router } from '@angular/router';
import { SessionService } from './core/session.service';

@Component({
  selector: 'app-auth-console',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header">
        <p class="eyebrow">TU ESPACIO DE TRABAJO</p>
        <h1>Bienvenido a ERP360</h1>
        <p>Accede a tu empresa con una cuenta autorizada. Tu información permanece en su contexto empresarial.</p>
      </header>
      <article class="surface-card">
        <h2><i class="bi bi-person-lock" aria-hidden="true"></i> Iniciar sesión</h2>
        <form class="form-grid" #loginForm="ngForm" (ngSubmit)="login()">
          <label for="login-email">Correo de trabajo</label>
          <input id="login-email" name="email" [(ngModel)]="email" type="email" required email autocomplete="username" />
          <label for="login-password">Contraseña</label>
          <input id="login-password" name="password" [(ngModel)]="password" [type]="showPassword ? 'text' : 'password'" required autocomplete="current-password" />
          <button type="button" class="btn btn-secondary" (click)="showPassword = !showPassword" [attr.aria-pressed]="showPassword">{{ showPassword ? 'Ocultar' : 'Mostrar' }} contraseña</button>
          <button type="submit" class="btn btn-primary" [disabled]="loading || loginForm.invalid">{{ loading ? 'Ingresando…' : 'Entrar a mi empresa' }}</button>
          <p class="muted">¿Olvidaste la contraseña? Solicita una clave de recuperación al administrador.</p>
        </form>
      </article>
      <details class="surface-card">
        <summary>Activar cuenta o restablecer contraseña</summary>
        <p>Usa la clave de un solo uso entregada por el administrador. No la compartas ni la incluyas en la URL.</p>
        <form class="form-grid" #resetForm="ngForm" (ngSubmit)="resetPassword()">
          <label>Clave privada<input name="resetToken" type="password" [(ngModel)]="resetToken" required autocomplete="off" /></label>
          <label>Nueva contraseña<input name="newPassword" type="password" [(ngModel)]="newPassword" minlength="12" maxlength="256" required autocomplete="new-password" /></label>
          <button class="btn btn-primary" type="submit" [disabled]="loading || resetForm.invalid">Guardar nueva contraseña</button>
        </form>
      </details>
      <details class="surface-card">
        <summary>Alta inicial de una empresa nueva · solo instalaciones autorizadas</summary>
        <p>El servidor debe habilitar temporalmente el registro. No permite agregar administradores a empresas existentes.</p>
        <form class="form-grid" #setupForm="ngForm" (ngSubmit)="bootstrapAdmin()">
          <label for="company-code">Código único de empresa</label>
          <input id="company-code" name="companyCode" [(ngModel)]="companyCode" required pattern="[A-Za-z0-9_-]{1,32}" maxlength="32" />
          <label for="company-name">Nombre de empresa</label>
          <input id="company-name" name="companyName" [(ngModel)]="companyName" required maxlength="160" />
          <label for="admin-name">Nombre del administrador</label>
          <input id="admin-name" name="fullName" [(ngModel)]="fullName" required autocomplete="name" />
          <label for="admin-email">Correo del administrador</label>
          <input id="admin-email" name="adminEmail" [(ngModel)]="adminEmail" type="email" email required autocomplete="email" />
          <label for="admin-password">Contraseña inicial · mínimo 12 caracteres</label>
          <input id="admin-password" name="adminPassword" [(ngModel)]="adminPassword" type="password" required minlength="12" autocomplete="new-password" />
          <button type="submit" class="btn btn-secondary" [disabled]="loading || setupForm.invalid">Crear empresa y administrador</button>
        </form>
      </details>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (success) { <p class="status status-success" role="status">{{ success }}</p> }
    </section>
  `,
})
export class AuthConsoleComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  resetToken = ''; newPassword = '';
  email = ''; password = ''; companyCode = ''; companyName = ''; fullName = '';
  adminEmail = ''; adminPassword = ''; loading = false; error = ''; success = ''; showPassword = false;

  async resetPassword() {
    if (this.loading) return;
    this.loading = true; this.error = ''; this.success = '';
    try {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/auth/reset-password`, { token: this.resetToken, password: this.newPassword }));
      this.resetToken = ''; this.newPassword = '';
      this.success = 'Contraseña guardada. Inicia sesión con tu nueva contraseña.';
    } catch { this.error = 'No se pudo cambiar la contraseña. Comprueba la clave, su vigencia y la longitud de contraseña.'; }
    finally { this.loading = false; }
  }

  async login() {
    if (this.loading) return;
    this.error = ''; this.success = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim()) || !this.password) {
      this.error = 'Introduce un correo válido y tu contraseña.'; return;
    }
    this.loading = true;
    try {
      await this.session.login(this.email.trim(), this.password);
      this.password = '';
      await this.router.navigateByUrl('/workspace');
    } catch (error) {
      this.error = error instanceof HttpErrorResponse && error.status === 401
        ? 'Correo o contraseña incorrectos.' : 'No se pudo acceder. Comprueba la conexión o intenta más tarde.';
    } finally { this.loading = false; }
  }

  async bootstrapAdmin() {
    if (this.loading) return;
    this.error = ''; this.success = '';
    if (!this.companyCode.trim() || !this.companyName.trim() || !this.fullName.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.adminEmail.trim()) || this.adminPassword.length < 12) {
      this.error = 'Completa los datos y utiliza una contraseña de al menos 12 caracteres.'; return;
    }
    this.loading = true;
    try {
      await this.session.bootstrapAdmin({ companyCode: this.companyCode.trim(), companyName: this.companyName.trim(),
        fullName: this.fullName.trim(), email: this.adminEmail.trim(), password: this.adminPassword });
      this.email = this.adminEmail.trim(); this.adminPassword = '';
      this.success = 'Empresa creada. Inicia sesión con el correo indicado.';
    } catch (error) {
      this.error = error instanceof HttpErrorResponse && error.status === 403
        ? 'El registro está deshabilitado. Contacta al responsable de la instalación.'
        : 'No se pudo crear la empresa. El código o correo puede estar registrado.';
    } finally { this.loading = false; }
  }
}
