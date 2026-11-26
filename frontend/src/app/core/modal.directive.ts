import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

const FOCUSABLE =
  'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// ใช้กับพื้นหลังของหน้าต่าง popup ทุกอัน
// กด Esc เพื่อปิด คลิกนอกกรอบจะปิดเฉพาะเมื่อกดและปล่อยนอกกรอบ ลากเลือกข้อความแล้วหลุดออกมาจะไม่ปิด
// เปิดแล้วย้ายโฟกัสเข้าไปในหน้าต่าง ปิดแล้วคืนโฟกัสที่เดิม และกด Tab วนอยู่ในหน้าต่าง
@Directive({
  selector: '[appModal]',
  standalone: true,
  host: {
    '(mousedown)': 'onMouseDown($event)',
    '(click)': 'onClick($event)',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class ModalDirective implements AfterViewInit, OnDestroy {
  readonly dismiss = output<void>();

  private host = inject(ElementRef<HTMLElement>);
  private pressedOnBackdrop = false;
  private previousFocus: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    const dialog = this.dialog();
    if (dialog) {
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      const title = dialog.querySelector('h2');
      if (title) {
        title.id ||= `modal-title-${Math.random().toString(36).slice(2, 8)}`;
        dialog.setAttribute('aria-labelledby', title.id);
      }
    }
    // โฟกัสช่องกรอกแรก ถ้าไม่มีให้โฟกัสปุ่มแรก
    const first = this.focusables()[0];
    queueMicrotask(() => first?.focus());
  }

  ngOnDestroy(): void {
    this.previousFocus?.focus?.();
  }

  onMouseDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === this.host.nativeElement;
  }

  onClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === this.host.nativeElement) this.dismiss.emit();
    this.pressedOnBackdrop = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    // กด Tab ให้วนอยู่ในหน้าต่าง ไม่หลุดไปที่หน้าด้านหลัง
    const items = this.focusables();
    if (!items.length) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === firstItem || !this.host.nativeElement.contains(active))) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && (active === lastItem || !this.host.nativeElement.contains(active))) {
      event.preventDefault();
      firstItem.focus();
    }
  }

  private dialog(): HTMLElement | null {
    return this.host.nativeElement.querySelector('.modal');
  }

  private focusables(): HTMLElement[] {
    const dialog = this.dialog();
    if (!dialog) return [];
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  }
}
