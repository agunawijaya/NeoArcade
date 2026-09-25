import { createInput } from '@shared/input';

type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled])';

/**
 * Lets a gamepad (and the arrow keys) move through whichever menu is open:
 * up and down step through the controls, left and right move within a row,
 * A presses, B goes back.
 */
export class MenuNavigator {
  private readonly pad = createInput<MenuAction>({
    bindings: {
      up: ['pad:up', 'pad:leftY-'],
      down: ['pad:down', 'pad:leftY+'],
      left: ['pad:left', 'pad:leftX-'],
      right: ['pad:right', 'pad:leftX+'],
      confirm: ['pad:a'],
      back: ['pad:b'],
    },
    deadzone: 0.5,
  });

  constructor(
    private readonly currentMenu: () => HTMLElement | null,
    private readonly back: () => void,
  ) {
    window.addEventListener('keydown', (event) => {
      const menu = this.currentMenu();
      if (!menu) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.back();
        return;
      }
      const typing = event.target instanceof HTMLInputElement && event.target.type !== 'range';
      if (typing) return;
      if (event.key === 'ArrowDown') this.move(menu, 1, event);
      if (event.key === 'ArrowUp') this.move(menu, -1, event);
    });
  }

  update() {
    this.pad.update();
    const menu = this.currentMenu();
    if (!menu) return;
    if (this.pad.wasPressed('down') || this.pad.wasPressed('right')) this.move(menu, 1);
    if (this.pad.wasPressed('up') || this.pad.wasPressed('left')) this.move(menu, -1);
    if (this.pad.wasPressed('confirm')) (document.activeElement as HTMLElement | null)?.click();
    if (this.pad.wasPressed('back')) this.back();
  }

  private move(menu: HTMLElement, step: number, event?: Event) {
    const items = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => item.offsetParent !== null,
    );
    if (items.length === 0) return;
    event?.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(index + step + items.length) % items.length] ?? items[0];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
  }
}
