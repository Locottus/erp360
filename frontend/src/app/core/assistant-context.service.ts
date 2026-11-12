import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from './session.service';
import type { DiagnosticTarget } from './assistant-api.service';

@Injectable({ providedIn: 'root' })
export class AssistantContextService {
  private readonly session = inject(SessionService);
  private readonly selection = signal<{ identity: string; screen: string; target: DiagnosticTarget } | null>(null);
  readonly request = signal(0);
  constructor() {
    let previous: string | undefined;
    effect(() => {
      const identity = this.identity();
      untracked(() => {
        if (previous !== undefined && previous !== identity) this.selection.set(null);
        previous = identity;
      });
    });
  }
  private identity() {
    const user = this.session.user();
    return user ? `${user.id}:${user.companyId}` : '';
  }
  private screen(route: string) {
    const [path, query] = route.split('?');
    return path === '/operations' ? `${path}?tab=${new URLSearchParams(query).get('tab') || 'overview'}` : path;
  }
  select(target: DiagnosticTarget, route: string) {
    const identity = this.identity();
    if (!identity) return;
    this.selection.set({ identity, screen: this.screen(route), target });
    this.request.update(value => value + 1);
  }
  targetFor(route: string) {
    const selection = this.selection();
    return selection?.identity === this.identity() && selection.screen === this.screen(route) ? selection.target : null;
  }
}
