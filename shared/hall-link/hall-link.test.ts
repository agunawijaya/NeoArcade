// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountHallButton } from './index';

describe('mountHallButton', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('adds an accessible link to the Hall in the chosen corner', () => {
    const button = mountHallButton({ corner: 'bottom-right', href: '../' });
    const link = document.querySelector('a.neo-hall-link');
    expect(link).toBe(button.element);
    expect(link?.getAttribute('href')).toBe('../');
    expect(link?.getAttribute('aria-label')).toBe('Back to the Arcade Hall');
    expect(link?.classList.contains('neo-hall-link--bottom-right')).toBe(true);
  });

  it('dims itself after a while and wakes up on pointer movement', () => {
    vi.useFakeTimers();
    const { element } = mountHallButton();
    vi.advanceTimersByTime(3000);
    expect(element.classList.contains('neo-hall-link--dim')).toBe(true);
    window.dispatchEvent(new Event('pointermove'));
    expect(element.classList.contains('neo-hall-link--dim')).toBe(false);
  });

  it('lets the game cancel leaving', () => {
    const { element } = mountHallButton({ href: '#hall', beforeLeave: () => false });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    element.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('removes itself on dispose', () => {
    const button = mountHallButton();
    button.dispose();
    expect(document.querySelector('.neo-hall-link')).toBeNull();
  });
});
