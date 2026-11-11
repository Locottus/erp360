import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './core/api';
import { SessionService } from './core/session.service';

type Employee = { id: string; employee_code: string; full_name: string; email: string | null; job_title: string | null; hire_date: string; status: string; revision: number };
type Attendance = { id: string; full_name: string; check_in_at: string; check_out_at: string | null; status: string; revision: number; total_minutes: number | null };
type Leave = { id: string; full_name: string; start_date: string; end_date: string; reason: string | null; status: string; revision: number; decision_note: string | null; cancellation_reason: string | null };

@Component({
  selector: 'app-people', standalone: true, imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page-shell">
      <header class="page-header"><p class="eyebrow">PERSONAS</p><h1>Expedientes y correcciones auditadas</h1>
        <p>Conserva el historial. No incluye cálculo de nómina legal ni modifica salarios.</p>
        <a routerLink="/operations" [queryParams]="{ module: 'hr' }" class="btn btn-secondary">Altas, asistencia y ausencias</a></header>
      @if (error) { <p class="status status-error" role="alert">{{ error }}</p> }
      @if (message) { <p class="status status-success" role="status">{{ message }}</p> }
      @if (!isAdmin) { <p role="alert">Requiere administrador de empresa.</p> } @else {
        <button class="btn btn-secondary" type="button" (click)="refresh()" [disabled]="busy">Actualizar y descartar edición</button>
        <div class="panel-grid">
          <article class="surface-card"><h2>Editar expediente</h2>
            <label>Persona<select [(ngModel)]="employee" (ngModelChange)="selectEmployee()" [disabled]="busy">
              <option [ngValue]="null">Selecciona</option>@for (row of employees; track row.id) {
                <option [ngValue]="row">{{ row.employee_code }} · {{ row.full_name }} · {{ row.status }}</option>
              }</select></label>
            @if (employee) {
              <form class="form-grid" #personForm="ngForm" (ngSubmit)="saveEmployee()">
                <label>Nombre<input name="fullName" [(ngModel)]="person.fullName" maxlength="200" required /></label>
                <label>Correo<input name="email" [(ngModel)]="person.email" type="email" email maxlength="254" /></label>
                <label>Puesto<input name="jobTitle" [(ngModel)]="person.jobTitle" maxlength="120" /></label>
                <label>Fecha de alta<input name="hireDate" [(ngModel)]="person.hireDate" type="date" required /></label>
                <label>Estado<select name="status" [(ngModel)]="person.status"><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label>
                <label>Motivo<input name="personReason" [(ngModel)]="person.reason" minlength="10" maxlength="1000" required /></label>
                <p>No se permite la baja con una jornada abierta. El código de empleado no cambia.</p>
                <button class="btn btn-primary" type="submit" [disabled]="busy || personForm.invalid">Guardar expediente y auditoría</button>
              </form>
            }
          </article>
          <article class="surface-card"><h2>Corregir jornada cerrada</h2>
            <p>Fechas en UTC. Se conserva el antes/después en auditoría. Una edición concurrente o un solapamiento impide guardar.</p>
            <label>Jornada<select [(ngModel)]="attendance" (ngModelChange)="selectAttendance()" [disabled]="busy">
              <option [ngValue]="null">Selecciona</option>@for (row of closedAttendance; track row.id) {
                <option [ngValue]="row">{{ row.full_name }} · {{ row.check_in_at | date:'yyyy-MM-dd HH:mm':'UTC' }} UTC · {{ row.total_minutes }} min</option>
              }</select></label>
            @if (attendance) {
              <form class="form-grid" #attendanceForm="ngForm" (ngSubmit)="saveAttendance()">
                <label>Entrada UTC<input name="checkInAt" type="datetime-local" [(ngModel)]="correction.checkInAt" required /></label>
                <label>Salida UTC<input name="checkOutAt" type="datetime-local" [(ngModel)]="correction.checkOutAt" required /></label>
                <label>Motivo<input name="attendanceReason" [(ngModel)]="correction.reason" minlength="10" maxlength="1000" required /></label>
                <button class="btn btn-primary" type="submit" [disabled]="busy || attendanceForm.invalid">Corregir y auditar</button>
              </form>
            }
          </article>
        </div>
        <article class="surface-card"><h2>Cancelar ausencia con auditoría</h2>
          <p>Retira una solicitud pendiente o anula administrativamente una aprobada, con motivo y control de versión. Conserva fechas, solicitud y decisión originales. No recalcula vacaciones legales ni nómina; concilia esos efectos con el responsable.</p>
          <label>Ausencia a cancelar<select [(ngModel)]="leave" [disabled]="busy" (ngModelChange)="leaveCancellation = { reason: '', confirmed: false }">
            <option [ngValue]="null">Selecciona</option>@for (row of cancellableLeaves; track row.id) {
              <option [ngValue]="row">{{ row.full_name }} · {{ row.start_date | date:'yyyy-MM-dd':'UTC' }} / {{ row.end_date | date:'yyyy-MM-dd':'UTC' }} · {{ leaveStatus(row.status) }}</option>
            }
          </select></label>
          @if (leave) {
            <form class="form-grid" #cancelLeaveForm="ngForm" (ngSubmit)="cancelLeave()">
              <label>Motivo de cancelación de ausencia<input name="leaveCancellationReason" [(ngModel)]="leaveCancellation.reason" minlength="10" maxlength="1000" required /></label>
              <label><input name="leaveCancellationConfirmed" [(ngModel)]="leaveCancellation.confirmed" type="checkbox" required /> Confirmo la cancelación administrativa de esta ausencia.</label>
              <button type="submit" class="btn btn-secondary" [disabled]="busy || cancelLeaveForm.invalid">Cancelar ausencia y auditar</button>
            </form>
          }
          <div class="table-scroll"><table class="table-list leave-history"><caption>Historial de ausencias, incluidas las canceladas</caption>
            <thead><tr><th>Persona</th><th>Fechas UTC</th><th>Estado</th><th>Solicitud / decisión</th><th>Cancelación</th></tr></thead>
            <tbody>@for (row of leaves; track row.id) { <tr><th scope="row">{{ row.full_name }}</th><td>{{ row.start_date | date:'yyyy-MM-dd':'UTC' }} /<br>{{ row.end_date | date:'yyyy-MM-dd':'UTC' }}</td>
              <td>{{ leaveStatus(row.status) }}</td><td>{{ row.reason || 'Sin motivo inicial' }}<br>{{ row.decision_note || 'Sin nota de decisión' }}</td><td>{{ row.cancellation_reason || 'No cancelada' }}</td></tr> }
            @empty { <tr><td colspan="5">Sin ausencias registradas.</td></tr> }</tbody>
          </table></div>
        </article>
      }
    </section>
  `,
  styles: [`
    .leave-history { min-width: 48rem; }
    .leave-history thead th,
    .leave-history td:nth-child(2),
    .leave-history td:nth-child(3) { white-space: nowrap; }
  `],
})
export class PeopleComponent {
  private readonly http = inject(HttpClient); private readonly session = inject(SessionService);
  employees: Employee[] = []; attendances: Attendance[] = [];
  leaves: Leave[] = []; leave: Leave | null = null;
  leaveCancellation = { reason: '', confirmed: false };
  employee: Employee | null = null; attendance: Attendance | null = null;
  person = { fullName: '', email: '', jobTitle: '', hireDate: '', status: 'active', reason: '' };
  correction = { checkInAt: '', checkOutAt: '', reason: '' };
  busy = false; error = ''; message = '';
  get isAdmin() { return this.session.user()?.roles.includes('admin') ?? false; }
  get closedAttendance() { return this.attendances.filter(row => row.status === 'closed'); }
  get cancellableLeaves() { return this.leaves.filter(row => ['requested', 'approved'].includes(row.status)); }
  leaveStatus(status: string) { return ({ requested: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada' } as Record<string, string>)[status] ?? status; }
  constructor() {
    effect(() => {
      const user = this.session.user();
      untracked(() => {
        this.employees = []; this.attendances = []; this.employee = null; this.attendance = null;
        this.leaves = []; this.leave = null; this.leaveCancellation = { reason: '', confirmed: false };
        this.busy = false; this.error = ''; this.message = '';
        if (user?.roles.includes('admin')) void this.refresh();
      });
    });
  }
  selectEmployee() {
    if (this.employee) this.person = { fullName: this.employee.full_name, email: this.employee.email ?? '', jobTitle: this.employee.job_title ?? '',
      hireDate: this.employee.hire_date.slice(0, 10), status: this.employee.status, reason: '' };
  }
  selectAttendance() {
    if (this.attendance) this.correction = { checkInAt: this.attendance.check_in_at.slice(0, 16), checkOutAt: this.attendance.check_out_at?.slice(0, 16) ?? '', reason: '' };
  }
  private async load() {
    const user = this.session.user();
    const [employees, attendances, leaves] = await Promise.all([
      firstValueFrom(this.http.get<Employee[]>(`${API_BASE_URL}/hr/employees`)),
      firstValueFrom(this.http.get<Attendance[]>(`${API_BASE_URL}/hr/attendance`)),
      firstValueFrom(this.http.get<Leave[]>(`${API_BASE_URL}/hr/leave-requests`)),
    ]);
    if (this.session.user() !== user) return;
    this.employees = employees; this.attendances = attendances;
    this.employee = null; this.attendance = null;
    this.leaves = leaves; this.leave = null;
  }
  async refresh() { await this.perform(() => this.load()); }
  async cancelLeave() {
    if (!this.leave || !this.leaveCancellation.confirmed) { this.error = 'Selecciona ausencia y confirma su cancelación.'; return; }
    const user = this.session.user(); const leave = this.leave;
    await this.perform(async () => {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/hr/leave-requests/${leave.id}/cancel`,
        { reason: this.leaveCancellation.reason, expectedRevision: leave.revision }));
      if (this.session.user() !== user) return;
      this.leaveCancellation = { reason: '', confirmed: false };
      this.message = 'Ausencia cancelada con historial conservado. Revisa efectos externos de nómina o vacaciones.';
      await this.load();
    });
  }
  async saveEmployee() {
    if (!this.employee) { this.error = 'Selecciona un expediente.'; return; }
    const employee = this.employee;
    await this.perform(async () => {
      await firstValueFrom(this.http.patch(`${API_BASE_URL}/hr/employees/${employee.id}`, { ...this.person, expectedRevision: employee.revision }));
      this.message = 'Expediente actualizado, historial conservado.'; await this.load();
    });
  }
  async saveAttendance() {
    if (!this.attendance) { this.error = 'Selecciona una jornada cerrada.'; return; }
    const attendance = this.attendance;
    await this.perform(async () => {
      await firstValueFrom(this.http.patch(`${API_BASE_URL}/hr/attendance/${attendance.id}`, {
        checkInAt: `${this.correction.checkInAt}:00Z`, checkOutAt: `${this.correction.checkOutAt}:00Z`,
        reason: this.correction.reason, expectedRevision: attendance.revision,
      }));
      this.message = 'Jornada corregida; antes y después registrados en auditoría.'; await this.load();
    });
  }
  private async perform(action: () => Promise<void>) {
    if (this.busy || !this.isAdmin) return;
    const user = this.session.user();
    this.busy = true; this.error = ''; this.message = '';
    try { await action(); }
    catch (error) {
      if (this.session.user() !== user) return;
      this.error = error instanceof HttpErrorResponse && error.status === 409
        ? 'Otra persona modificó el registro. Actualiza y revisa antes de guardar.'
        : error instanceof HttpErrorResponse && error.status === 400
          ? 'Revisa fechas, solapamientos, motivo y jornadas abiertas antes de desactivar.'
          : 'No se pudo completar la operación de RRHH.';
    } finally { if (this.session.user() === user) this.busy = false; }
  }
}
