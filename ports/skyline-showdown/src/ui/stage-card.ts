import { lookFor } from '../render/gorilla';
import { GorillaPreview } from '../render/preview';
import { drawTwistDiagram, type DiagramKind } from '../render/twist-diagram';
import { RIVALS } from '../tour/rivals';
import type { StageRecord } from '../tour/save';
import { chapterOf, type Stage } from '../tour/stages';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface StageCardHandlers {
  play(stage: Stage): void;
  close(): void;
}

export interface StageCard {
  element: HTMLElement;
  open(stage: Stage, record: StageRecord | undefined, aimAssist: boolean): void;
  close(): void;
  animate(delta: number, reducedMotion: boolean): void;
}

/** Seconds each twist's diagram plays before the next, on stages with more than one. */
const DIAGRAM_SECONDS = 3.2;

/**
 * The card before each duel: the city, the rival and what they say, the
 * twist in one sentence with a little moving diagram, and the three stars
 * on offer. Aim assist is allowed, and the card says what it costs.
 */
export function buildStageCard(handlers: StageCardHandlers): StageCard {
  const chapterLine = h('p', { class: 'card__chapter' });
  const city = h('h2', { class: 'card__city', id: 'stage-card-title' });
  const portraitHolder = h('div', { class: 'card__portrait' });
  const rivalName = h('p', { class: 'card__rival' });
  const rivalTitle = h('p', { class: 'card__rival-title' });
  const banter = h('blockquote', { class: 'card__banter' });
  const twistName = h('h3', { class: 'card__twist-name' });
  const twistLine = h('p', { class: 'card__twist-line' });
  const diagram = h('canvas', { class: 'card__diagram', 'aria-hidden': 'true' });
  const goals = h('ul', { class: 'card__goals' });
  const assistNote = h('p', { class: 'card__assist' });
  const play = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Play',
  );
  const back = h(
    'button',
    { class: 'button button--quiet', type: 'button' },
    icon(ICONS.map),
    'Map',
  );
  back.addEventListener('click', handlers.close);

  const element = h(
    'section',
    {
      class: 'overlay overlay--card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'stage-card-title',
      hidden: true,
    },
    h(
      'div',
      { class: 'panel card' },
      h('div', { class: 'card__rival-side' }, portraitHolder, rivalName, rivalTitle, banter),
      h(
        'div',
        { class: 'card__stage-side' },
        chapterLine,
        city,
        h('div', { class: 'card__twist' }, diagram, h('div', {}, twistName, twistLine)),
        goals,
        assistNote,
        h('div', { class: 'menu menu--row card__actions' }, back, play),
      ),
    ),
  );

  let current: Stage | null = null;
  let preview: GorillaPreview | null = null;
  let kinds: DiagramKind[] = ['lowGravity'];
  let time = 0;
  play.addEventListener('click', () => {
    if (current) handlers.play(current);
  });

  return {
    element,
    open(stage, record, aimAssist) {
      current = stage;
      time = 0;
      const rival = RIVALS[stage.rival];
      const chapter = chapterOf(stage);
      element.style.setProperty('--rival', rival.colour);
      chapterLine.textContent = `Stage ${stage.number} of 15 · ${chapter.name}${stage.boss ? ' · Boss' : ''}`;
      city.textContent = stage.city;
      preview = new GorillaPreview(lookFor(rival.outfit, rival.colour));
      portraitHolder.replaceChildren(preview.canvas);
      rivalName.textContent = rival.name;
      rivalTitle.textContent = `${rival.title} · ${rival.styleNote}`;
      banter.textContent = `“${rival.lines.intro}”`;
      twistName.textContent = stage.twist.name;
      twistLine.textContent = stage.twist.line;
      kinds = stage.twists.length > 0 ? [...stage.twists] : ['lowGravity'];

      const best = record?.stars ?? 0;
      const goalRows = [
        `Win the duel (first to ${stage.points})`,
        `Win within ${stage.throwBudget} throws`,
        'Win without being hit',
      ];
      // Stars are counted, not tied to a goal, so the card fills them from the left.
      goals.replaceChildren(
        ...goalRows.map((text, index) =>
          h(
            'li',
            { class: index < best ? 'card__goal card__goal--earned' : 'card__goal' },
            h('span', { class: 'card__star', 'aria-hidden': 'true' }, icon(ICONS.star)),
            text,
          ),
        ),
      );
      goals.setAttribute('aria-label', `Star goals. Best so far: ${best} of 3 stars.`);
      assistNote.textContent = aimAssist
        ? 'Aim assist is on: this stage can earn 1 star at most. Switch it off in Settings for all three.'
        : '';
      assistNote.hidden = !aimAssist;
      element.hidden = false;
      play.focus();
    },
    close() {
      element.hidden = true;
      current = null;
      preview = null;
    },
    animate(delta, reducedMotion) {
      if (element.hidden || !preview) return;
      time += delta;
      preview.update(delta, reducedMotion);
      preview.draw();
      const kind = kinds[Math.floor(time / DIAGRAM_SECONDS) % kinds.length] ?? 'lowGravity';
      drawTwistDiagram(diagram, kind, time, reducedMotion);
    },
  };
}
