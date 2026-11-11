import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { CurrentCompany, SessionService } from './core/session.service';

type CompanyProfile = CurrentCompany & { profile_revision: number };

@Component({
  selector: 'app-company', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">ADMINISTRACIÓN</p><h1>Mi empresa</h1>
        <p>Actualiza el perfil de la empresa autenticada, sin cambiar su identidad ni reescribir documentos.</p></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere administrador de empresa.</p> }
      @else {
        <article class="surface-card">
          <div class="header-with-action"><h2>Datos de la empresa</h2>
            <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="busy">Recargar perfil</button></div>
          @if (profile) {
            <p>Código inmutable: <strong>{{ profile.code }}</strong> · Revisión {{ profile.profile_revision }}</p>
            <form class="form-grid" #companyForm="ngForm" (ngSubmit)="save()">
              <label>Nombre de la empresa<input name="companyName" [(ngModel)]="form.name" maxlength="160" required [disabled]="busy" /></label>
              <label>Identificación tributaria (vacío = sin registrar)<input name="taxId" [(ngModel)]="form.taxId" maxlength="64" [disabled]="busy" /></label>
              <label>Motivo del cambio de empresa<input name="companyReason" [(ngModel)]="form.reason" minlength="10" maxlength="1000" required [disabled]="busy" /></label>
              <button type="submit" class="btn btn-primary" [disabled]="busy || companyForm.invalid">Guardar perfil de empresa</button>
            </form>
            <p class="muted">El identificador tributario se registra sin certificarlo ante autoridades. Este formulario no cambia país, moneda, contrato SaaS, estado operativo ni empresa de los usuarios.</p>
            <p class="muted">Las facturas con instantánea conservan el nombre de emisión. Los PDF legados sin instantánea muestran datos descriptivos actuales con un aviso.</p>
          }
        </article>
      }
    </section>
  `,
})
export class CompanyComponent {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  profile: CompanyProfile | null = null;
  form = { name: '', taxId: '', reason: '' };
  error = ''; message = ''; busy = false;
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.profile = null; this.form = { name: '', taxId: '', reason: '' };
        this.error = ''; this.message = ''; this.busy = false;
        if (user?.roles.includes('admin')) void this.load();
      });
    });
  }
  async load() {
    if (this.busy || !this.isAdmin) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try {
      const result = await firstValueFrom(this.http.get<CompanyProfile>(`${API_BASE_URL}/companies/current`));
      if (identity !== this.session.user()) return;
      this.profile = result; this.form = { name: result.name, taxId: result.tax_id ?? '', reason: '' };
    } catch { if (identity === this.session.user()) this.error = 'No se pudo cargar el perfil de empresa.'; }
    finally { if (identity === this.session.user()) this.busy = false; }
  }
  async save() {
    if (this.busy || !this.isAdmin || !this.profile) return;
    const identity = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try {
      const result = await firstValueFrom(this.http.patch<CompanyProfile>(`${API_BASE_URL}/companies/current`, {
        name: this.form.name, taxId: this.form.taxId.trim() || null,
        expectedRevision: this.profile.profile_revision, reason: this.form.reason,
      }));
      if (identity !== this.session.user()) return;
      this.profile = result; this.form = { name: result.name, taxId: result.tax_id ?? '', reason: '' };
      this.session.company.set(result);
      this.message = 'Perfil actualizado con auditoría. No se reescribieron documentos.';
    } catch (error) {
      if (identity !== this.session.user()) return;
      this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'El perfil cambió o no hay cambios. Recarga el perfil antes de volver a guardar.'
        : 'No se pudo guardar. Revisa los datos, el motivo y tus permisos.';
    } finally { if (identity === this.session.user()) this.busy = false; }
  }
}
