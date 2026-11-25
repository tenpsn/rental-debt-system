import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, tone: Toast['tone'] = 'info') {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), 4200);
  }

  success(text: string) { this.show(text, 'success'); }
  error(text: string) { this.show(text, 'error'); }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
