import { HttpClient } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api';

type LoginResponse = {
  access_token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    companyId: string;
    roles: string[];
  };
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  companyId: string;
  roles: string[];
};

export type CurrentCompany = {
  id: string;
  code: string;
  name: string;
  tax_id: string | null;
  is_active: boolean;
};

type BootstrapAdminInput = {
  companyCode: string;
  companyName: string;
  email: string;
  password: string;
  fullName: string;
};

const TOKEN_STORAGE_KEY = 'erp360.auth.token';

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly user = signal<AuthUser | null>(null);
  readonly company = signal<CurrentCompany | null>(null);
  readonly error = signal('');
  private readonly token = signal<string | null>(null);
  private revision = 0;
  readonly isAuthenticated = computed(() => Boolean(this.token()) && Boolean(this.user()));

  constructor(private readonly http: HttpClient) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (storedToken) {
      this.token.set(storedToken);
      queueMicrotask(() => { void this.refreshContext(); });
    }
  }

  getAccessToken() {
    return this.token();
  }

  async login(email: string, password: string) {
    const revision = ++this.revision;
    this.error.set('');
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, {
        email,
        password,
      }),
    );
    if (!response?.access_token || !response.user) {
      throw new Error('Invalid login response');
    }
    if (revision !== this.revision) return;
    this.token.set(response.access_token);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
    this.user.set(response.user);
    await this.refreshCompany(revision);
  }

  async bootstrapAdmin(input: BootstrapAdminInput) {
    await firstValueFrom(this.http.post(`${API_BASE_URL}/auth/bootstrap-admin`, input));
  }

  async refreshContext() {
    const revision = this.revision;
    if (!this.token()) {
      this.logout();
      return;
    }
    try {
      const me = await firstValueFrom(this.http.get<AuthUser>(`${API_BASE_URL}/auth/me`));
      if (revision !== this.revision) return;
      this.user.set(me);
      await this.refreshCompany(revision);
    } catch {
      if (revision !== this.revision) return;
      this.error.set('No se pudo restaurar la sesión. Inicia sesión de nuevo o comprueba la conexión.');
      this.logout();
    }
  }

  logout() {
    this.revision++;
    this.user.set(null);
    this.company.set(null);
    this.token.set(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  private async refreshCompany(revision: number) {
    try {
      const company = await firstValueFrom(this.http.get<CurrentCompany>(`${API_BASE_URL}/companies/current`));
      if (revision !== this.revision) return;
      this.company.set(company);
    } catch {
      if (revision !== this.revision) return;
      this.company.set(null);
      this.error.set('No se pudo cargar la empresa. Vuelve a iniciar sesión o contacta con soporte.');
    }
  }
}
