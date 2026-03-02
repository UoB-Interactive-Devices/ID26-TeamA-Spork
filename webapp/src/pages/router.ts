/**
 * Page Router — lightweight client-side page manager.
 *
 * Manages .page elements with enter / exit transitions.
 * No hash or History API needed — purely in-memory.
 */
import type { PageId } from '../types/motion.types.ts';

type NavigateCallback = (from: PageId | null, to: PageId) => void;

class Router {
  private currentPage: PageId | null = null;
  private listeners: NavigateCallback[] = [];

  /** Navigate to a page by ID. Handles CSS transition classes. */
  go(pageId: PageId, meta?: Record<string, string>): void {
    const prev = this.currentPage;
    if (prev === pageId) return;

    // Exit current page
    if (prev) {
      const prevEl = document.getElementById(prev);
      if (prevEl) {
        prevEl.classList.remove('active');
        prevEl.classList.add('exit');
        // Clean up exit class after transition
        const onEnd = () => {
          prevEl.classList.remove('exit');
          prevEl.removeEventListener('transitionend', onEnd);
        };
        prevEl.addEventListener('transitionend', onEnd, { once: true });
        // Fallback in case transitionend doesn't fire
        setTimeout(() => prevEl.classList.remove('exit'), 600);
      }
    }

    // Enter new page
    const nextEl = document.getElementById(pageId);
    if (nextEl) {
      // Set data-* attributes for passing state (e.g. selected level)
      if (meta) {
        Object.entries(meta).forEach(([k, v]) => nextEl.dataset[k] = v);
      }
      // Small delay so the exit transition can start first
      requestAnimationFrame(() => {
        nextEl.classList.add('active');
      });
    }

    this.currentPage = pageId;
    this.listeners.forEach(cb => cb(prev, pageId));
  }

  /** Get the currently active page */
  get current(): PageId | null {
    return this.currentPage;
  }

  /** Listen for page navigation events */
  onNavigate(cb: NavigateCallback): void {
    this.listeners.push(cb);
  }

  /** Go back to main menu */
  home(): void {
    this.go('main-menu');
  }
}

export const router = new Router();
