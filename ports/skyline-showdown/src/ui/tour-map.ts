import type { Point } from '../engine/geometry';
import { BOARD, CHAPTER_LABELS, STOPS, TourMapArt } from '../render/tour-map-art';
import {
  chapterGate,
  chapterUnlocked,
  MAX_STARS,
  nextStage,
  stageUnlocked,
  totalStars,
} from '../tour/progress';
import { RIVALS } from '../tour/rivals';
import type { TourSave } from '../tour/save';
import { CHAPTERS, STAGES, type Chapter, type ChapterId, type Stage } from '../tour/stages';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface TourMapHandlers {
  open(stage: Stage): void;
  back(): void;
}

export interface TourMap {
  element: HTMLElement;
  refresh(save: TourSave): void;
  /** Redraws the board: twinkling stars, drifting clouds, the route shimmering ahead. */
  animate(delta: number, reducedMotion: boolean): void;
  focusNext(): void;
}

/** Stars as text: filled for earned, hollow for still to win. */
export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

/**
 * The World Tour map. The board is drawn on a canvas; every stop is a
 * button laid over it, so the map works with a keyboard, a gamepad and a
 * screen reader as well as a mouse or a finger.
 */
export function buildTourMap(handlers: TourMapHandlers): TourMap {
  const art = new TourMapArt();
  const canvas = h('canvas', { class: 'tour__canvas', 'aria-hidden': 'true' });
  const board = h('div', { class: 'tour__board' }, canvas);
  const total = h('p', { class: 'tour__total' });
  const info = h('p', { class: 'tour__info', 'aria-live': 'polite' });
  const back = h(
    'button',
    { class: 'button button--quiet', type: 'button' },
    icon(ICONS.back),
    'Back',
  );
  back.addEventListener('click', handlers.back);

  const stops = new Map<Stage['id'], HTMLButtonElement>();
  for (const stage of STAGES) {
    const stop = h('button', { class: 'stop', type: 'button', 'data-stage': stage.id });
    stop.addEventListener('click', () => {
      if (stop.getAttribute('aria-disabled') === 'true') {
        info.textContent = lockedText(save, stage);
        return;
      }
      handlers.open(stage);
    });
    const describe = () => (info.textContent = stopText(save, stage));
    stop.addEventListener('focus', describe);
    stop.addEventListener('pointerenter', describe);
    stops.set(stage.id, stop);
    board.append(stop);
  }
  const labels = new Map<ChapterId, HTMLElement>();
  for (const chapter of CHAPTERS) {
    const label = h('div', { class: 'tour__chapter' });
    labels.set(chapter.id, label);
    board.append(label);
  }

  const element = h(
    'section',
    { class: 'screen screen--tour', 'aria-labelledby': 'tour-title', hidden: true },
    h(
      'header',
      { class: 'tour__head' },
      back,
      h('h2', { class: 'tour__title', id: 'tour-title' }, 'World Tour'),
      total,
    ),
    board,
    info,
  );

  let save: TourSave | null = null;
  let time = 0;
  let layout = { scale: 1, left: 0, top: 0 };

  const place = () => {
    const width = board.clientWidth;
    const height = board.clientHeight;
    const scale = Math.min(width / BOARD.width, height / BOARD.height);
    layout = {
      scale,
      left: (width - BOARD.width * scale) / 2,
      top: (height - BOARD.height * scale) / 2,
    };
    const at = (point: Point) => ({
      x: layout.left + point.x * scale,
      y: layout.top + point.y * scale,
    });
    for (const stage of STAGES) {
      const stop = stops.get(stage.id);
      const point = at(STOPS[stage.id]);
      stop?.style.setProperty('left', `${point.x}px`);
      stop?.style.setProperty('top', `${point.y}px`);
    }
    for (const chapter of CHAPTERS) {
      const point = at(CHAPTER_LABELS[chapter.id]);
      const label = labels.get(chapter.id);
      label?.style.setProperty('left', `${point.x}px`);
      label?.style.setProperty('top', `${point.y}px`);
    }
  };
  new ResizeObserver(place).observe(board);

  const draw = (reducedMotion: boolean) => {
    if (!save) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(board.clientWidth * ratio);
    const height = Math.round(board.clientHeight * ratio);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { scale, left, top } = layout;
    ctx.setTransform(scale * ratio, 0, 0, scale * ratio, left * ratio, top * ratio);
    const current = save;
    const next = nextStage(current);
    art.draw(ctx, {
      theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      time: reducedMotion ? 0 : time,
      route: STAGES.map((stage) => STOPS[stage.id]),
      reached: next ? STAGES.indexOf(next) : STAGES.length,
      open: Object.fromEntries(
        CHAPTERS.map((chapter) => [chapter.id, chapterUnlocked(current, chapter)]),
      ) as Record<ChapterId, boolean>,
    });
  };

  return {
    element,
    refresh(next) {
      save = next;
      const stars = totalStars(next);
      total.replaceChildren(icon(ICONS.star), `${stars} / ${MAX_STARS}`);
      total.setAttribute('aria-label', `${stars} of ${MAX_STARS} stars`);
      const upcoming = nextStage(next);
      for (const stage of STAGES) {
        const stop = stops.get(stage.id);
        if (stop) dressStop(stop, next, stage, upcoming);
      }
      for (const chapter of CHAPTERS) {
        const label = labels.get(chapter.id);
        if (label) dressChapter(label, next, chapter);
      }
      info.textContent = upcoming
        ? `Next stop: ${stopText(next, upcoming)}`
        : 'Tour complete! Replay any stop to chase its stars.';
      place();
    },
    animate(delta, reducedMotion) {
      time += delta;
      draw(reducedMotion);
    },
    focusNext() {
      const upcoming = save ? nextStage(save) : null;
      (stops.get(upcoming?.id ?? 'jakarta') ?? back).focus();
    },
  };
}

function dressStop(stop: HTMLButtonElement, save: TourSave, stage: Stage, upcoming: Stage | null) {
  const record = save.stages[stage.id];
  const open = stageUnlocked(save, stage);
  stop.className = [
    'stop',
    stage.boss ? 'stop--boss' : '',
    record?.won ? 'stop--won' : open ? 'stop--open' : 'stop--locked',
    upcoming === stage ? 'stop--next' : '',
  ]
    .filter(Boolean)
    .join(' ');
  stop.style.setProperty('--rival', RIVALS[stage.rival].colour);
  stop.setAttribute('aria-disabled', String(!open));
  stop.setAttribute(
    'aria-label',
    `Stage ${stage.number}, ${stage.city}${open ? `, against ${RIVALS[stage.rival].name}` : ', locked'}${
      record?.won ? `, ${record.stars} of 3 stars` : ''
    }`,
  );
  stop.replaceChildren(
    h('span', { class: 'stop__number' }, open ? String(stage.number) : icon(ICONS.lock)),
    h('span', { class: 'stop__name', 'aria-hidden': 'true' }, stage.city),
  );
  if (record?.won) {
    stop.append(h('span', { class: 'stop__stars', 'aria-hidden': 'true' }, starText(record.stars)));
  }
}

function dressChapter(label: HTMLElement, save: TourSave, chapter: Chapter) {
  const open = chapterUnlocked(save, chapter);
  const gate = chapterGate(save, chapter);
  const needs = [
    gate.stars > 0 ? `${gate.stars} more ★` : null,
    gate.boss ? `beat ${gate.boss.city}` : null,
  ].filter(Boolean);
  label.classList.toggle('tour__chapter--locked', !open);
  label.replaceChildren(
    h('strong', {}, `${chapter.number} · ${chapter.name}`),
    h('span', {}, open ? chapter.feel : `Needs ${needs.join(' · ')}`),
  );
}

function stopText(save: TourSave | null, stage: Stage): string {
  if (!save || !stageUnlocked(save, stage)) return lockedText(save, stage);
  const record = save.stages[stage.id];
  const stars = record?.won ? ` · ${starText(record.stars)}` : '';
  return `${stage.number} · ${stage.city} · vs ${RIVALS[stage.rival].name} · ${stage.twist.name}${stars}`;
}

function lockedText(save: TourSave | null, stage: Stage): string {
  const chapter = CHAPTERS.find((candidate) => candidate.id === stage.chapter) as Chapter;
  if (save && !chapterUnlocked(save, chapter)) {
    const gate = chapterGate(save, chapter);
    const needs = [
      gate.stars > 0 ? `${gate.stars} more stars` : null,
      gate.boss ? `a win in ${gate.boss.city}` : null,
    ].filter(Boolean);
    return `${stage.city} is on ${chapter.name}, which opens with ${needs.join(' and ')}.`;
  }
  return `${stage.city} opens when you win the stop before it.`;
}
