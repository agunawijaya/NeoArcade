import './hall-link.css';

/**
 * The small "back to the Hall" button every game shows in a corner. It dims
 * itself while the player is busy and wakes up when the pointer moves.
 *
 *   mountHallButton({ corner: 'top-right' });
 */
export interface HallButtonOptions {
  /** Pick the corner the game's HUD leaves free. */
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Runs before leaving; return false to stay, e.g. after asking "leave the match?". */
  beforeLeave?: () => boolean | void;
  /** Where the Hall is. Defaults to the parent folder, or /hall/ on the dev server. */
  href?: string;
  parent?: HTMLElement;
}

export interface HallButton {
  readonly element: HTMLAnchorElement;
  dispose(): void;
}

const DIM_AFTER_MS = 2500;

export function hallUrl(): string {
  return import.meta.env.DEV ? '/hall/' : '../';
}

export function mountHallButton({
  corner = 'top-left',
  beforeLeave,
  href = hallUrl(),
  parent = document.body,
}: HallButtonOptions = {}): HallButton {
  const link = document.createElement('a');
  link.className = `neo-hall-link neo-hall-link--${corner}`;
  link.href = href;
  link.setAttribute('aria-label', 'Back to the Arcade Hall');
  link.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 3h12l1 3H5z M6.5 6h11v9h-11z M5 15h14l1 3H4z M6 18h12v3H6z" />
      <path d="M9 9.5 7.5 11 9 12.5 M15 9.5l1.5 1.5-1.5 1.5" />
    </svg>
    <span>Hall</span>`;

  let dimTimer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    link.classList.remove('neo-hall-link--dim');
    clearTimeout(dimTimer);
    dimTimer = setTimeout(() => link.classList.add('neo-hall-link--dim'), DIM_AFTER_MS);
  };
  const onClick = (event: MouseEvent) => {
    if (beforeLeave?.() === false) event.preventDefault();
  };

  link.addEventListener('click', onClick);
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  parent.append(link);
  wake();

  return {
    element: link,
    dispose() {
      clearTimeout(dimTimer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      link.remove();
    },
  };
}
