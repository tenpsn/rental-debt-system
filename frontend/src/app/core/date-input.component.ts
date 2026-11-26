import { Component, ElementRef, Injector, OnDestroy, afterNextRender, computed, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { todayIso } from './format';

const MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const PANEL_MIN_WIDTH = 209;
const GAP = 6;

interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

// แปลงปี เดือน วัน เป็นข้อความรูปแบบที่ API ใช้
function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// อ่านวันที่จากข้อความ โดยไม่ให้เวลาโซนทำวันเพี้ยน
function parseIso(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateToIso(date: Date): string {
  return toIso(date.getFullYear(), date.getMonth(), date.getDate());
}

@Component({
  selector: 'app-date-input',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInputComponent), multi: true }],
  template: `
    <button
      #trigger
      type="button"
      class="di-trigger"
      [class.empty]="!value()"
      [class.active]="open()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() ? ariaLabel() + ' ' + displayText() : null"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <span class="di-text">{{ displayText() }}</span>
      <svg class="di-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    </button>

    @if (open()) {
      <div
        #panel
        class="di-panel"
        role="dialog"
        aria-label="เลือกวันที่"
        [style.top.px]="position().top"
        [style.left.px]="position().left"
        [style.width.px]="position().width"
        (keydown)="onKeydown($event)"
      >
        <div class="di-head">
          <button type="button" class="di-nav" (click)="shift(-1)" [attr.aria-label]="view() === 'days' ? 'เดือนก่อน' : 'ปีก่อน'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button type="button" class="di-title" (click)="toggleView()" [attr.aria-label]="view() === 'days' ? 'เลือกเดือน' : 'กลับไปเลือกวัน'">
            {{ title() }}
          </button>
          <button type="button" class="di-nav" (click)="shift(1)" [attr.aria-label]="view() === 'days' ? 'เดือนถัดไป' : 'ปีถัดไป'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>

        @if (view() === 'days') {
          <div class="di-week" aria-hidden="true">
            @for (w of weekdays; track w) { <span [class.weekend]="w === 'ส' || w === 'อา'">{{ w }}</span> }
          </div>
          <div class="di-grid">
            @for (d of days(); track d.iso) {
              <button
                type="button"
                class="di-day"
                [class.out]="!d.inMonth"
                [class.today]="d.isToday"
                [class.selected]="d.iso === value()"
                [attr.data-iso]="d.iso"
                [attr.tabindex]="d.iso === focusIso() ? 0 : -1"
                [attr.aria-label]="longLabel(d.iso)"
                [attr.aria-pressed]="d.iso === value()"
                [attr.aria-current]="d.isToday ? 'date' : null"
                (click)="pick(d.iso)"
              >{{ d.day }}</button>
            }
          </div>
        } @else {
          <div class="di-months">
            @for (m of monthsShort; track $index) {
              <button
                type="button"
                class="di-month"
                [class.selected]="isSelectedMonth($index)"
                [class.current]="isCurrentMonth($index)"
                (click)="pickMonth($index)"
              >{{ m }}</button>
            }
          </div>
        }

        <div class="di-foot">
          <button type="button" class="di-link muted" (click)="clear()">ล้าง</button>
          <button type="button" class="di-link" (click)="pick(today())">วันนี้</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; position: relative; width: 100%; }

    .di-trigger {
      width: 100%; min-height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 12px; border: 1px solid #d4dce6; border-radius: 8px; background: #fff;
      font: inherit; font-size: 13.5px; color: var(--ink); text-align: left; cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
    }
    .di-trigger:hover:not(:disabled) { border-color: #b9c7d8; }
    .di-trigger:focus-visible, .di-trigger.active { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(29,111,214,.12); }
    .di-trigger:disabled { background: #f4f6fa; color: var(--muted); cursor: not-allowed; }
    .di-trigger.empty .di-text { color: #98a5b5; }
    .di-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .di-icon { flex: 0 0 auto; color: var(--brand); opacity: .8; }
    .di-trigger:hover .di-icon, .di-trigger.active .di-icon { opacity: 1; }

    .di-panel {
      position: fixed; z-index: 300; padding: 10px;
      background: #fff; border: 1px solid var(--line); border-radius: 12px;
      box-shadow: 0 16px 40px rgba(16, 24, 40, .16);
      animation: di-in .14s ease-out;
    }
    @keyframes di-in { from { transform: translateY(-4px); } to { transform: none; } }
    @media (prefers-reduced-motion: reduce) { .di-panel { animation: none; } }

    .di-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 4px; }
    .di-nav, .di-title, .di-day, .di-month, .di-link {
      font: inherit; border: none; background: none; cursor: pointer; color: var(--ink);
    }
    .di-nav { width: 30px; height: 30px; border-radius: 7px; display: grid; place-items: center; color: #45566b; }
    .di-nav:hover { background: #f2f6fb; color: var(--brand); }
    .di-title {
      display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px; border-radius: 8px;
      font-size: 13.5px; font-weight: 600; white-space: nowrap;
    }
    .di-title:hover { background: #f2f6fb; }

    .di-week { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 4px; }
    .di-week span { text-align: center; font-size: 11px; font-weight: 600; color: var(--muted); padding: 2px 0; }
    .di-week span.weekend { color: #c0647a; }

    .di-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
    .di-day {
      height: 32px; border-radius: 7px; font-size: 12.5px; font-variant-numeric: tabular-nums;
      display: grid; place-items: center; position: relative;
    }
    .di-day:hover { background: #f2f6fb; }
    .di-day.out { color: #b3bfcc; }
    .di-day.today { color: var(--brand); font-weight: 700; }
    .di-day.today::after {
      content: ''; position: absolute; bottom: 3px; width: 3px; height: 3px; border-radius: 50%; background: var(--brand);
    }
    .di-day.selected { background: var(--brand); color: #fff; font-weight: 600; }
    .di-day.selected::after { background: #fff; }
    .di-day:focus-visible, .di-month:focus-visible, .di-nav:focus-visible, .di-title:focus-visible, .di-link:focus-visible {
      outline: 2px solid var(--brand); outline-offset: 1px;
    }

    .di-months { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 4px 0; }
    .di-month { height: 36px; border-radius: 7px; font-size: 12.5px; }
    .di-month:hover { background: #f2f6fb; }
    .di-month.current { color: var(--brand); font-weight: 700; }
    .di-month.selected { background: var(--brand); color: #fff; font-weight: 600; }

    .di-foot { display: flex; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
    .di-link { padding: 4px 8px; border-radius: 6px; font-size: 12.5px; font-weight: 600; color: var(--brand); }
    .di-link:hover { background: var(--brand-soft); }
    .di-link.muted { color: var(--muted); font-weight: 500; }
    .di-link.muted:hover { background: #f2f6fb; color: var(--ink); }

    /* จอสัมผัสให้ปุ่มสูงขึ้น กดด้วยนิ้วได้ง่าย ต้องอยู่ท้ายสุดเพื่อทับค่าด้านบน */
    @media (pointer: coarse) {
      .di-day { height: 40px; }
      .di-nav { width: 36px; height: 36px; }
      .di-title { height: 36px; }
      .di-link { padding: 8px 10px; }
    }
  `],
})
export class DateInputComponent implements ControlValueAccessor, OnDestroy {
  // ข้อความบอกว่าช่องนี้คือวันที่อะไร ใช้กับโปรแกรมอ่านหน้าจอ
  readonly ariaLabel = input<string>('');
  readonly placeholder = input<string>('เลือกวันที่');

  private host = inject(ElementRef<HTMLElement>);
  private injector = inject(Injector);
  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private panel = viewChild<ElementRef<HTMLDivElement>>('panel');

  readonly weekdays = WEEKDAYS;
  readonly monthsShort = MONTHS_SHORT;

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly view = signal<'days' | 'months'>('days');
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());
  readonly focusIso = signal('');
  readonly today = signal(todayIso());
  readonly position = signal({ top: 0, left: 0, width: PANEL_MIN_WIDTH });

  readonly displayText = computed(() => {
    const date = parseIso(this.value());
    if (!date) return this.placeholder();
    return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear() + 543}`;
  });

  readonly title = computed(() =>
    this.view() === 'days'
      ? `${MONTHS_LONG[this.viewMonth()]} ${this.viewYear() + 543}`
      : `พ.ศ. ${this.viewYear() + 543}`,
  );

  // สร้างตารางวัน 6 แถว เริ่มวันจันทร์
  readonly days = computed<CalendarDay[]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const today = this.today();
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = dateToIso(date);
      return { iso, day: date.getDate(), inMonth: date.getMonth() === month, isToday: iso === today };
    });
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly outsideHandler = (event: Event) => {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close(false);
  };
  private readonly repositionHandler = () => this.reposition();

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggle(): void {
    this.open() ? this.close(true) : this.openPanel();
  }

  private openPanel(): void {
    this.today.set(todayIso());
    const base = parseIso(this.value()) ?? parseIso(todayIso())!;
    this.viewYear.set(base.getFullYear());
    this.viewMonth.set(base.getMonth());
    this.focusIso.set(this.value() || this.today());
    this.view.set('days');
    this.open.set(true);
    this.reposition();
    document.addEventListener('mousedown', this.outsideHandler, true);
    document.addEventListener('touchstart', this.outsideHandler, true);
    window.addEventListener('scroll', this.repositionHandler, true);
    window.addEventListener('resize', this.repositionHandler);
    // รอให้ปฏิทินแสดงก่อน แล้ววัดความสูงจริงและย้ายโฟกัสไปที่วัน
    this.afterRender(() => {
      this.reposition();
      this.focusDay(this.focusIso());
    });
  }

  close(returnFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.removeListeners();
    this.onTouched();
    if (returnFocus) this.trigger()?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.removeListeners();
  }

  private removeListeners(): void {
    document.removeEventListener('mousedown', this.outsideHandler, true);
    document.removeEventListener('touchstart', this.outsideHandler, true);
    window.removeEventListener('scroll', this.repositionHandler, true);
    window.removeEventListener('resize', this.repositionHandler);
  }

  // วางปฏิทินใต้ช่อง ถ้าข้างล่างที่ไม่พอให้เปิดขึ้นข้างบน และไม่ให้ล้นขอบจอ
  private reposition(): void {
    const triggerEl = this.trigger()?.nativeElement;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    // ปฏิทินกว้างเท่าช่องพอดี แต่ไม่แคบกว่าขั้นต่ำเพื่อให้ยังอ่านง่าย
    const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), window.innerWidth - 24);
    const height = this.panel()?.nativeElement.offsetHeight ?? 380;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const spaceBelow = window.innerHeight - rect.bottom - GAP - 8;
    const spaceAbove = rect.top - GAP - 8;
    let top: number;
    if (height <= spaceBelow) {
      top = rect.bottom + GAP;
    } else if (height <= spaceAbove) {
      top = rect.top - GAP - height;
    } else {
      // ที่ไม่พอทั้งบนและล่าง ให้ชิดขอบล่างจอเพื่อให้เห็นทั้งปฏิทิน
      top = Math.max(8, window.innerHeight - height - 8);
    }
    this.position.set({ top, left, width });
  }

  pick(iso: string): void {
    this.value.set(iso);
    this.onChange(iso);
    this.close(true);
  }

  clear(): void {
    this.value.set('');
    this.onChange('');
    this.close(true);
  }

  shift(step: number): void {
    if (this.view() === 'months') {
      this.viewYear.update((y) => y + step);
      return;
    }
    this.moveMonth(step);
    this.focusIso.set(toIso(this.viewYear(), this.viewMonth(), 1));
  }

  toggleView(): void {
    this.view.update((v) => (v === 'days' ? 'months' : 'days'));
    this.afterRender(() => this.reposition());
  }

  pickMonth(month: number): void {
    this.viewMonth.set(month);
    this.view.set('days');
    this.focusIso.set(toIso(this.viewYear(), month, 1));
    this.afterRender(() => {
      this.reposition();
      this.focusDay(this.focusIso());
    });
  }

  isSelectedMonth(month: number): boolean {
    const date = parseIso(this.value());
    return !!date && date.getFullYear() === this.viewYear() && date.getMonth() === month;
  }

  isCurrentMonth(month: number): boolean {
    const now = parseIso(todayIso())!;
    return now.getFullYear() === this.viewYear() && now.getMonth() === month;
  }

  longLabel(iso: string): string {
    const date = parseIso(iso)!;
    return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear() + 543}`;
  }

  // ใช้ลูกศรเลื่อนวัน PageUp PageDown เลื่อนเดือน Esc ปิดปฏิทิน
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (this.view() !== 'days') return;
    const target = event.target as HTMLElement;
    if (!target.classList.contains('di-day')) return;
    const current = parseIso(this.focusIso()) ?? new Date();
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => this.addDays(current, -1),
      ArrowRight: () => this.addDays(current, 1),
      ArrowUp: () => this.addDays(current, -7),
      ArrowDown: () => this.addDays(current, 7),
      Home: () => this.addDays(current, -((current.getDay() + 6) % 7)),
      End: () => this.addDays(current, 6 - ((current.getDay() + 6) % 7)),
      PageUp: () => new Date(current.getFullYear(), current.getMonth() - 1, Math.min(current.getDate(), 28)),
      PageDown: () => new Date(current.getFullYear(), current.getMonth() + 1, Math.min(current.getDate(), 28)),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move();
    this.viewYear.set(next.getFullYear());
    this.viewMonth.set(next.getMonth());
    this.focusIso.set(dateToIso(next));
    this.afterRender(() => this.focusDay(this.focusIso()));
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  private moveMonth(step: number): void {
    const next = new Date(this.viewYear(), this.viewMonth() + step, 1);
    this.viewYear.set(next.getFullYear());
    this.viewMonth.set(next.getMonth());
  }

  // รอให้ Angular วาดหน้าจอเสร็จก่อน แล้วค่อยทำงาน
  private afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
  }

  private focusDay(iso: string): void {
    const el = this.panel()?.nativeElement.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
    el?.focus();
  }
}
