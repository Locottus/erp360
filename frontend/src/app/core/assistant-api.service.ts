import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api';
import type { HelpService } from './help.service';

export type AiProvider = 'deepseek' | 'openai' | 'claude';
export type ProviderOption = { code: AiProvider; label: string; models: string[] };
export type DiagnosticTarget = { kind: 'screen'; screen: string; area?: string } |
  { kind: 'purchase-request'; id: string } | { kind: 'sales-order' | 'stock'; id: string; locationCode: string };
export type DiagnosticReport = {
  target: DiagnosticTarget; capturedAt: string; readOnly: true;
  evidence: { id: string; source: string; facts: Record<string, boolean | string | number | null> }[];
  findings: { code: string; severity: 'info' | 'warning' | 'blocking'; title: string; recommendation: string; evidenceIds: string[]; route: string }[];
  limitations: string[];
};
export type AiUsage = {
  month: string; includedTokens: number; extraTokens: number; limitTokens: number;
  promptTokens: number; completionTokens: number; usedTokens: number; reservedTokens: number; availableTokens: number;
  enabled: boolean; provider: AiProvider | null; model: string | null;
  service: { code: string; name: string; maxOutputTokens: number } | null; blockReason: string | null;
};
export type ProviderConfig = { provider: AiProvider; model: string; enabled: boolean; revision: number; keyConfigured: boolean };
export type AiType = { code: string; name: string; monthly_tokens: number; max_output_tokens: number; enabled: boolean; revision: number };
export type AiCompany = {
  usage: Omit<AiUsage, 'enabled' | 'provider' | 'model' | 'service' | 'blockReason'>;
  users: { id: string; full_name: string; email: string; is_active: boolean; service_code: string | null; enabled: boolean | null; revision: number }[];
  requests: { id: string; user_id: string; month_start: string; provider: AiProvider; model: string; reserved_tokens: number; status: string; failure_code: string | null }[];
  purchases: { id: string; month_start: string; tokens: number; reference: string; paid_amount: string; currency: string }[];
};
export type AiReply = { requestId: string; text: string; provider: AiProvider; truncated: boolean; diagnostic?: DiagnosticReport;
  tokens: { prompt: number; completion: number; total: number }; usage: AiUsage };

export function assistantError(error: unknown) {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message;
    return `No se pudo completar la solicitud de IA (${error.status || 'conexión'}). Comprueba el servicio; no se reintenta automáticamente.`;
  }
  return 'No se pudo completar la solicitud de IA. Comprueba el servicio; no se reintenta automáticamente.';
}

@Injectable({ providedIn: 'root' })
export class AssistantApiService {
  private readonly http = inject(HttpClient);
  usage() { return firstValueFrom(this.http.get<AiUsage>(`${API_BASE_URL}/assistant/usage`)); }
  diagnose(target: DiagnosticTarget) {
    return firstValueFrom(this.http.post<DiagnosticReport>(`${API_BASE_URL}/assistant/diagnostics`, target));
  }
  chat(question: string, context: ReturnType<HelpService['context']>, provider: AiProvider, target?: DiagnosticTarget) {
    return firstValueFrom(this.http.post<AiReply>(`${API_BASE_URL}/assistant/chat`, {
      requestId: crypto.randomUUID(), question, context, provider, consent: true,
      ...(target ? { diagnostic: { consent: true, target } } : {}),
    }));
  }
  get<T>(path: string) { return firstValueFrom(this.http.get<T>(`${API_BASE_URL}/assistant/admin${path}`)); }
  post<T>(path: string, body: unknown) { return firstValueFrom(this.http.post<T>(`${API_BASE_URL}/assistant/admin${path}`, body)); }
}
