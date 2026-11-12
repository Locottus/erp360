import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HelpService } from './core/help.service';
import { SessionService } from './core/session.service';
import { AssistantApiService, assistantError, type AiProvider, type AiUsage, type DiagnosticTarget, type DiagnosticReport } from './core/assistant-api.service';
import { AssistantContextService } from './core/assistant-context.service';

type Destination = { route: string; label: string };
type ChatMessage = { id: number; author: 'user' | 'assistant'; text: string; links: Destination[]; provider?: AiProvider; report?: DiagnosticReport };

@Component({
  selector: 'app-assistant-chat',
  imports: [CommonModule, FormsModule],
  template: `
    @if (!opened()) {
      <button #launcher type="button" class="chat-launcher" (click)="open()" aria-label="Abrir asistente ERP360" aria-controls="assistant-chat">
        <i class="bi bi-chat-dots" aria-hidden="true"></i><span>Asistente</span>
      </button>
    }
    @if (opened()) {
      <section id="assistant-chat" class="chat-panel" [class.agent-panel]="diagnosticReport() !== null" role="dialog" aria-modal="false" aria-labelledby="assistant-title" (keydown.escape)="close()">
        <header class="chat-header">
          <div><h2 id="assistant-title">Asistente ERP360</h2><span>{{ useAI() ? providerLabel() + ' · IA externa' : 'Agente · solo lectura' }}</span></div>
          <button type="button" (click)="close()" aria-label="Minimizar asistente" title="Minimizar asistente"><i class="bi bi-dash-lg" aria-hidden="true"></i></button>
        </header>
        <div class="chat-context">Pantalla: <strong>{{ context().title }}</strong></div>
        <details class="chat-settings"><summary>IA y privacidad · {{ usage()?.usedTokens ?? 0 }} tokens usados</summary>
        <label class="chat-notice"><input type="checkbox" name="aiConsent" [ngModel]="useAI()" (ngModelChange)="useAI.set($event)"
          [disabled]="!session.isAuthenticated() || busy() || !usage()?.enabled" />
          Usar {{ providerLabel() }}: consiento enviar mi consulta y contexto seguro, sin historial ni documentos completos.
        </label>
        @if (usage(); as meter) {
          <div class="chat-context">{{ meter.service?.name || 'Sin servicio de IA' }} · {{ meter.month.slice(0, 7) }} UTC<br />
            Tokens: {{ meter.usedTokens }} / {{ meter.limitTokens }} · reservados {{ meter.reservedTokens }} · disponibles {{ meter.availableTokens }}
            @if (meter.blockReason) { <span>{{ meter.blockReason }}</span> }
          </div>
        }
        @if (diagnosticReport()) {
          <label class="chat-notice"><input type="checkbox" name="diagnosticConsent" [ngModel]="shareDiagnostic()" (ngModelChange)="shareDiagnostic.set($event)" [disabled]="busy()" />
            Compartir con la IA los hechos mínimos de este diagnóstico (estado, permisos y recuentos; sin nombres ni identificadores).
          </label>
        }
        </details>
        @if (usageError()) { <p class="chat-error" role="alert">{{ usageError() }}</p> }
        <p class="chat-notice">Agente de solo lectura. Analiza la pantalla o un registro seleccionado; no ejecuta correcciones. No compartas datos personales, contraseñas o tokens.</p>
        <div #conversation class="chat-messages" role="log" aria-label="Conversación con el asistente" aria-live="polite" aria-relevant="additions" tabindex="0">
          @for (message of messages(); track message.id) {
            <article class="chat-message" [class.user-message]="message.author === 'user'">
              <span class="message-author">{{ message.author === 'user' ? 'Tú' : 'Asistente · ' + (message.provider || 'guía local') }}</span>
              <p>{{ message.text }}</p>
              @if (message.report; as report) {
                <details class="chat-evidence"><summary>Evidencia y límites · {{ report.capturedAt | date:'short' }}</summary>
                  <p>Referencia local (no se envía a la IA):</p><pre>{{ report.target | json }}</pre>
                  @for (item of report.evidence; track item.id) {
                    <p><strong>[{{ item.id }}] {{ item.source }}</strong></p><pre>{{ item.facts | json }}</pre>
                  }
                  @for (limit of report.limitations; track limit) { <p>{{ limit }}</p> }
                </details>
              }
              @if (message.links.length) {
                <div class="chat-links">
                  @for (link of message.links; track link.route) {
                    @if (canNavigate(link.route)) {
                      <button type="button" (click)="navigate(link.route)">Abrir {{ link.label }} <i class="bi bi-arrow-up-right" aria-hidden="true"></i></button>
                    }
                  }
                </div>
              }
            </article>
          }
        </div>
        @if (error()) { <p class="chat-error" role="alert">{{ error() }}</p> }
        @if (loadingAI()) { <p class="chat-context" role="status">Consultando al proveedor de IA…</p> }
        @if (loadingDiagnostic()) { <p class="chat-context" role="status">Consultando herramientas de solo lectura…</p> }
        <div class="chat-tools">
          @if (session.isAuthenticated()) {
            <button type="button" (click)="inspectScreen()" [disabled]="busy()">Analizar pantalla</button>
            @if (selectedTarget(); as target) { <button type="button" (click)="inspect(target)" [disabled]="busy()">Analizar registro seleccionado</button> }
          }
          <button type="button" (click)="diagnose()" [disabled]="busy()">Diagnosticar último error</button>
          <button type="button" (click)="showContext.set(!showContext())" [attr.aria-expanded]="showContext()">Contexto seguro</button>
          <button type="button" (click)="clear()">Limpiar chat</button>
          @if (session.isAuthenticated()) { <button type="button" (click)="refreshUsage()" [disabled]="busy() || usageLoading()">Actualizar uso IA</button> }
        </div>
        @if (showContext()) { <pre class="chat-diagnostic" tabindex="0" aria-label="Contexto seguro sin datos de documentos">{{ context() | json }}</pre> }
        <form class="chat-composer" (ngSubmit)="send()">
          <label class="chat-input-label" for="assistant-question">Mensaje al asistente</label>
          <textarea #composer id="assistant-question" name="assistantQuestion" [(ngModel)]="draft" maxlength="500" rows="2"
            placeholder="Ej.: abre Inventario o no puedo aprobar una compra" [disabled]="busy()"></textarea>
          <button type="submit" [disabled]="!draft.trim() || busy()" aria-label="Enviar mensaje">
            <i class="bi bi-send" aria-hidden="true"></i>
          </button>
          <small>Enter agrega una línea. Usa Enviar para consultar. Hasta 500 caracteres.</small>
        </form>
      </section>
    }
  `,
  styleUrl: './assistant-chat.component.scss',
})
export class AssistantChatComponent {
  readonly destinations = input.required<readonly Destination[]>();
  readonly openRequest = input(0);
  private readonly help = inject(HelpService);
  readonly session = inject(SessionService);
  private readonly api = inject(AssistantApiService);
  private readonly diagnosticContext = inject(AssistantContextService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly launcher = viewChild<ElementRef<HTMLButtonElement>>('launcher');
  private readonly conversation = viewChild<ElementRef<HTMLElement>>('conversation');
  readonly opened = signal(false);
  readonly navigating = signal(false);
  readonly loadingAI = signal(false);
  readonly loadingDiagnostic = signal(false);
  readonly diagnosticReport = signal<DiagnosticReport | null>(null);
  readonly shareDiagnostic = signal(false);
  readonly usageLoading = signal(false);
  readonly usageError = signal('');
  readonly useAI = signal(false);
  readonly usage = signal<AiUsage | null>(null);
  readonly busy = computed(() => this.navigating() || this.loadingAI() || this.loadingDiagnostic());
  readonly providerLabel = computed(() => ({ openai: 'OpenAI', deepseek: 'DeepSeek', claude: 'Claude' })[this.usage()?.provider ?? 'deepseek']);
  readonly error = signal('');
  readonly showContext = signal(false);
  readonly route = signal(this.router.url);
  readonly context = computed(() => this.help.context(this.route()));
  readonly selectedTarget = computed(() => this.diagnosticContext.targetFor(this.route()));
  readonly messages = signal<ChatMessage[]>([]);
  draft = '';
  private sequence = 0;
  private identityRevision = 0;
  private contextRevision = 0;
  private handledDiagnosticRequest = 0;

  constructor() {
    effect(() => { if (this.openRequest()) this.open(); });
    let previousIdentity: string | undefined;
    effect(() => {
      const user = this.session.user();
      const identity = user ? `${user.id}:${user.companyId}` : '';
      untracked(() => {
        if (identity === previousIdentity) return;
        if (previousIdentity !== undefined) this.help.incident.set(null);
        previousIdentity = identity;
        this.clear();
        this.useAI.set(false); this.usage.set(null); this.usageLoading.set(false); this.usageError.set('');
        if (identity && this.opened()) void this.refreshUsage();
      });
    });
    effect(() => {
      const request = this.diagnosticContext.request();
      const target = this.selectedTarget();
      untracked(() => {
        if (!request || request === this.handledDiagnosticRequest || !target) return;
        this.handledDiagnosticRequest = request;
        this.clear(); this.useAI.set(false); this.open(); void this.inspect(target);
      });
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        if (this.route() !== event.urlAfterRedirects) {
          this.contextRevision++; this.loadingDiagnostic.set(false); this.loadingAI.set(false);
          this.diagnosticReport.set(null); this.shareDiagnostic.set(false);
        }
        this.route.set(event.urlAfterRedirects);
      }
    });
  }

  open() {
    this.opened.set(true);
    this.focusComposer();
    if (this.session.isAuthenticated()) void this.refreshUsage();
  }

  close() {
    this.opened.set(false);
    afterNextRender(() => this.launcher()?.nativeElement.focus(), { injector: this.injector });
  }

  clear() {
    this.identityRevision++;
    this.navigating.set(false);
    this.loadingAI.set(false);
    this.loadingDiagnostic.set(false); this.diagnosticReport.set(null); this.shareDiagnostic.set(false);
    this.usageLoading.set(false);
    this.draft = '';
    this.showContext.set(false);
    this.error.set('');
    this.messages.set([{ id: ++this.sequence, author: 'assistant', links: [],
      text: 'Puedo analizar esta pantalla con lecturas autorizadas. Usa Analizar pantalla o Analizar junto a un registro para investigar con evidencia. Pídeme «abre Inventario» para navegar. No ejecuto correcciones ni comparto el diagnóstico con IA sin tu autorización.' }]);
  }

  canNavigate(route: string) {
    const screen = route.split('?')[0];
    const isPublic = ['/', '/login', '/store', '/portal', '/processes'].includes(screen);
    return (isPublic || this.session.isAuthenticated()) &&
      this.destinations().some(destination => destination.route === screen);
  }

  diagnose() {
    this.draft = 'Diagnostica el último error observado';
    void this.send();
  }
  inspectScreen() {
    const area = this.context().screen === '/operations' ? new URLSearchParams(this.route().split('?')[1]).get('tab') : null;
    return this.inspect({ kind: 'screen', screen: this.context().screen, ...(area ? { area } : {}) });
  }
  async inspect(target: DiagnosticTarget) {
    if (this.busy() || !this.session.isAuthenticated()) return;
    const revision = this.identityRevision, scope = this.contextRevision;
    this.error.set(''); this.loadingDiagnostic.set(true); this.shareDiagnostic.set(false);
    this.diagnosticReport.set(null);
    try {
      const report = await this.api.diagnose(target);
      if (revision !== this.identityRevision || scope !== this.contextRevision) return;
      this.diagnosticReport.set(report);
      this.append({ author: 'assistant', report, text: 'Diagnóstico ERP · solo lectura\n' +
        report.findings.map(item => `${item.evidenceIds.map(id => `[${id}]`).join(' ')} ${item.title}\n${item.recommendation}`).join('\n\n'),
        links: [...new Set(report.findings.map(item => item.route))].filter(route => this.canNavigate(route))
          .map(route => ({ route, label: this.destinations().find(item => item.route === route.split('?')[0])?.label ?? 'Pantalla' })) });
    } catch (error) {
      if (revision === this.identityRevision && scope === this.contextRevision) this.error.set(assistantError(error));
    } finally { if (revision === this.identityRevision && scope === this.contextRevision) this.loadingDiagnostic.set(false); }
  }
  async refreshUsage() {
    if (!this.session.isAuthenticated() || this.usageLoading()) return;
    const revision = this.identityRevision;
    this.usageLoading.set(true); this.usageError.set('');
    try {
      const usage = await this.api.usage();
      if (revision === this.identityRevision) this.setUsage(usage);
    } catch (error) {
      if (revision === this.identityRevision) this.usageError.set(assistantError(error));
    } finally { if (revision === this.identityRevision) this.usageLoading.set(false); }
  }

  async send() {
    const question = this.draft.trim();
    if (!question || this.busy()) return;
    if (question.length > 500) { this.error.set('Usa un mensaje de hasta 500 caracteres.'); return; }
    this.error.set(''); this.draft = '';
    const sensitive = /contrase|password|token|bearer|clave|@/i.test(question);
    this.append({ author: 'user', text: sensitive ? 'Consulta con posible contenido sensible (texto omitido).' : question, links: [] });
    const response = this.help.chatReply(question, this.route());
    const links = response.routes.flatMap(route => {
      const destination = this.destinations().find(item => item.route === route.split('?')[0]);
      return destination && this.canNavigate(route) ? [{
        route, label: route === '/operations?tab=purchases' ? 'Compras'
          : route === '/operations?tab=sales' ? 'Ventas' : destination.label,
      }] : [];
    });
    if (!this.useAI() || response.localOnly) {
      this.append({ author: 'assistant', text: response.text, links });
      if (response.requestedRoute) await this.navigate(response.requestedRoute);
    } else {
      const revision = this.identityRevision, scope = this.contextRevision;
      if (sensitive) {
        this.error.set('La consulta puede contener datos sensibles. Retíralos o utiliza la guía local; no se envió al proveedor.');
        return;
      }
      const meter = this.usage();
      if (!meter?.enabled || !meter.provider) { this.error.set('Tu sesión no tiene un servicio de IA habilitado.'); return; }
      this.loadingAI.set(true);
      try {
        const target = this.shareDiagnostic() ? this.diagnosticReport()?.target : undefined;
        const reply = target ? await this.api.chat(question, this.context(), meter.provider, target)
          : await this.api.chat(question, this.context(), meter.provider);
        if (revision !== this.identityRevision || scope !== this.contextRevision) return;
        this.setUsage(reply.usage);
        this.append({ author: 'assistant', provider: reply.provider,
          text: reply.text + (reply.truncated ? '\nRespuesta limitada por el máximo de tokens disponible.' : ''), links,
          ...(reply.diagnostic ? { report: reply.diagnostic } : {}) });
      } catch (error) {
        if (revision === this.identityRevision && scope === this.contextRevision) this.error.set(assistantError(error));
      } finally {
        if (revision === this.identityRevision && scope === this.contextRevision) {
          this.loadingAI.set(false);
          void this.refreshUsage();
        }
      }
    }
    this.focusComposer();
  }

  async navigate(route: string) {
    if (this.navigating()) return;
    if (!this.canNavigate(route)) {
      this.error.set('Esta pantalla no está disponible para tu sesión. No se cambiaron permisos.');
      return;
    }
    const revision = this.identityRevision;
    this.navigating.set(true);
    this.error.set('');
    try {
      const success = await this.router.navigateByUrl(route);
      if (revision !== this.identityRevision) return;
      if (!success) throw new Error('Navigation was cancelled.');
      this.append({ author: 'assistant', text: 'Pantalla abierta. La navegación no ejecutó operaciones ni leyó nuevos registros. Usa Analizar pantalla para consultar su contexto autorizado.', links: [] });
    } catch {
      if (revision === this.identityRevision) this.error.set('No se pudo abrir la pantalla. Comprueba tu sesión e inténtalo nuevamente.');
    } finally {
      if (revision === this.identityRevision) this.navigating.set(false);
    }
  }

  private append(message: Omit<ChatMessage, 'id'>) {
    this.messages.update(messages => [...messages, { ...message, id: ++this.sequence }].slice(-40));
    afterNextRender(() => {
      const element = this.conversation()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    }, { injector: this.injector });
  }
  private setUsage(usage: AiUsage) {
    if (this.usage()?.provider !== usage.provider) {
      this.useAI.set(false); this.shareDiagnostic.set(false);
    }
    this.usage.set(usage);
  }

  private focusComposer() {
    afterNextRender(() => {
      this.document.defaultView?.requestAnimationFrame(() => {
        if (!this.destroyRef.destroyed && this.opened()) this.composer()?.nativeElement.focus();
      });
    }, { injector: this.injector });
  }
}
