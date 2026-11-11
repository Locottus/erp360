import { Injectable, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'erp360.ui.theme';
type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('light');

  constructor() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const nextMode: ThemeMode = stored === 'dark' ? 'dark' : 'light';
    this.setMode(nextMode);
  }

  toggle() {
    this.setMode(this.mode() === 'dark' ? 'light' : 'dark');
  }

  private setMode(mode: ThemeMode) {
    this.mode.set(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    document.documentElement.setAttribute('data-theme', mode);
  }
}
