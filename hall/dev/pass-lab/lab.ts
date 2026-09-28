import '@shared/fonts/tilt-neon.css';
import './lab.css';
import { createAudio } from '@shared/audio';
import { createInput } from '@shared/input';
import {
  createArcadePass,
  levelProgress,
  mountUnlockToasts,
  rankForLevel,
  type UnlockToasts,
} from '@shared/pass';
import { BlockedStorage } from '@shared/pass/test-helpers';
import { applyPreset, PRESETS, type PresetName } from './fixtures';
import labManifest from './lab.manifest';
import { paintPlayfield } from './playfield';

/**
 * The Pass Lab: a pretend game on the dev server that fires awards, unlocks
 * and toasts through the real Pass, so every state can be seen and
 * screenshotted before a real game joins. Not linked from the Hall and never
 * built for production.
 *
 * URL parameters, for screenshots:
 *   ?preset=mid        replace this browser's Pass with a ready-made one (see fixtures.ts)
 *   ?toast=gold|secret|level   fire an unlock or a level-up once the page is up
 *   ?toast=queued      just show whatever is waiting (e.g. the not-saving notice)
 *   ?theme=light|dark  pick the theme; ?storage=blocked pretend storage is blocked
 *   ?hold=1            keep toasts up until dismissed; ?panel=0 hide the controls
 */
const params = new URLSearchParams(location.search);
const LAB_ACCENT = '#7cf29c';
const HALL_PASS = '/hall/#/pass';

document.documentElement.dataset.theme =
  params.get('theme') ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

const preset = params.get('preset');
if (preset && preset in PRESETS) {
  applyPreset(preset as PresetName, localStorage);
  params.delete('preset');
  location.replace(`${location.pathname}?${params}`);
} else {
  start();
}

function start() {
  const panel = document.querySelector<HTMLElement>('#panel')!;
  const hud = document.querySelector<HTMLElement>('#hud')!;
  const canvas = document.querySelector<HTMLCanvasElement>('#playfield')!;
  panel.hidden = params.get('panel') === '0';

  let dayOffset = 0;
  const blocked = params.get('storage') === 'blocked';
  const arcade = createArcadePass({
    backend: blocked ? new BlockedStorage() : localStorage,
    now: () => new Date(Date.now() + dayOffset * 86_400_000),
  });
  const pass = arcade.forGame(labManifest);
  const audio = createAudio();
  let placement: 'top' | 'bottom' = 'top';
  let autoFlush = false;
  let streak = 0;
  let toasts: UnlockToasts = mount();

  function mount() {
    return mountUnlockToasts(pass, {
      accent: LAB_ACCENT,
      audio,
      placement,
      autoFlush,
      duration: params.get('hold') === '1' ? 10 * 60_000 : undefined,
    });
  }

  function remount() {
    toasts.dispose();
    toasts = mount();
    render();
  }

  const playRound = (won: boolean) => {
    pass.award(10, 'Played a round');
    pass.stat('rounds', { add: 1 });
    pass.progress('warmed-up', { add: 1 });
    pass.progress('marathon', { add: 1 });
    pass.unlock('first-coin');
    if (!won) {
      streak = 0;
      return;
    }
    streak += 1;
    pass.award(40, 'Won a round');
    pass.stat('wins', { add: 1 });
    pass.stat('bestStreak', { max: streak });
    if (streak >= 5) pass.unlock('hot-streak');
    if (streak >= 10) pass.unlock('untouchable');
  };

  const levelUp = () => {
    const target = pass.level + 1;
    while (pass.level < target) {
      if (pass.award(200, 'Practice round').granted === 0) dayOffset += 1;
    }
  };

  const unlockNext = () => {
    const next = labManifest.badges.find((badge) => !pass.hasBadge(badge.id));
    if (next) pass.unlock(next.id);
  };

  const groups: [string, [string, () => void][]][] = [
    [
      'Play',
      [
        ['Win a round', () => playRound(true)],
        ['Lose a round', () => playRound(false)],
        ['Collect a power-up', () => pass.progress('magpie', { add: 1 })],
        ['Hit the sun', () => pass.stat('sunHits', { add: 1 })],
        ['Hit yourself (secret)', () => pass.unlock('oops')],
        ['Unlock the next badge', unlockNext],
        ['Level up', levelUp],
        ['Tomorrow', () => (dayOffset += 1)],
      ],
    ],
    [
      'Toasts',
      [
        ['Show queued toasts', () => toasts.flush()],
        ['Hold (next turn)', () => toasts.hold()],
        [
          'Show as they come: off',
          () => {
            autoFlush = !autoFlush;
            remount();
          },
        ],
        [
          'Placement: top',
          () => {
            placement = placement === 'top' ? 'bottom' : 'top';
            remount();
          },
        ],
      ],
    ],
    [
      'Presets (replace this browser’s Pass)',
      (Object.keys(PRESETS) as PresetName[]).map((name) => [
        PRESETS[name],
        () => {
          params.set('preset', name);
          location.search = params.toString();
        },
      ]),
    ],
    [
      'Pages',
      [
        ['Open the Pass in the Hall', () => location.assign(HALL_PASS)],
        ['Art sheet', () => location.assign('./art.html')],
        [
          blocked ? 'Storage: blocked' : 'Storage: working',
          () => {
            if (blocked) params.delete('storage');
            else params.set('storage', 'blocked');
            location.search = params.toString();
          },
        ],
        [
          'Theme: switch',
          () => {
            params.set(
              'theme',
              document.documentElement.dataset.theme === 'light' ? 'dark' : 'light',
            );
            location.search = params.toString();
          },
        ],
      ],
    ],
  ];

  const labels = new Map<string, HTMLButtonElement>();
  panel.append(
    heading('Pass Lab'),
    paragraph(
      'A pretend game wired to the real Arcade Pass in this browser (dev server only). Toasts wait for “Show queued toasts”, the way a game shows them between turns.',
    ),
    ...groups.map(([title, actions]) => {
      const group = document.createElement('div');
      group.className = 'lab__group';
      const label = document.createElement('h2');
      label.textContent = title;
      const buttons = document.createElement('div');
      buttons.className = 'lab__buttons';
      for (const [text, action] of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.addEventListener('click', () => {
          action();
          render();
        });
        labels.set(text, button);
        buttons.append(button);
      }
      group.append(label, buttons);
      return group;
    }),
  );

  function render() {
    const progress = levelProgress(arcade.profile.xp);
    const flushLabel = labels.get('Show as they come: off');
    if (flushLabel) flushLabel.textContent = `Show as they come: ${autoFlush ? 'on' : 'off'}`;
    const placementLabel = labels.get('Placement: top');
    if (placementLabel) placementLabel.textContent = `Placement: ${placement}`;
    hud.replaceChildren(
      hudLine(
        `${arcade.profile.name} · level ${progress.level} · ${rankForLevel(progress.level).name}`,
      ),
      hudLine(`${progress.xpIntoLevel} / ${progress.xpForNextLevel} XP · storage ${arcade.health}`),
      hudLine(
        `${toasts.pending} toast${toasts.pending === 1 ? '' : 's'} waiting${dayOffset ? ` · day +${dayOffset}` : ''}`,
      ),
    );
  }

  // The pattern every game follows: its own back button closes a toast first.
  const input = createInput({ bindings: { back: ['pad:b', 'key:Backspace'] } });
  const pollInput = () => {
    input.update();
    if (input.wasPressed('back') && toasts.visible) toasts.dismiss();
    requestAnimationFrame(pollInput);
  };
  requestAnimationFrame(pollInput);

  arcade.subscribe(render);
  paintPlayfield(canvas);
  window.addEventListener('resize', () => paintPlayfield(canvas));
  render();

  const toast = params.get('toast');
  if (toast) {
    if (toast === 'gold') pass.unlock('champion');
    if (toast === 'secret') pass.unlock('oops');
    if (toast === 'level') playRound(true);
    toasts.flush();
    render();
  }
}

function heading(text: string) {
  const element = document.createElement('h1');
  element.textContent = text;
  return element;
}

function paragraph(text: string) {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function hudLine(text: string) {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}
