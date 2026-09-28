import {
  backupFileName,
  drawAvatar,
  readBackup,
  summariseProfile,
  type ArcadePass,
  type BackupSummary,
  type Profile,
} from '@shared/pass';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { buildNamePlate } from './pass-look';
import { formatNumber } from './time';

export type BackupTab = 'export' | 'import';

export interface BackupDialog {
  open(tab: BackupTab, onClosed?: () => void): void;
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const COPIED_FOR_MS = 2200;

/**
 * Back up and restore, in one dialog with two tabs. Backing up shows the
 * code to copy and offers the file; restoring reads a pasted code or a
 * chosen file, shows whose Pass it is, and only replaces anything after the
 * player confirms.
 */
export function createBackupDialog(
  pass: ArcadePass,
  onRestored: (summary: BackupSummary) => void,
): BackupDialog {
  const dialog = h('dialog', { class: 'sheet backup', 'aria-labelledby': 'backup-title' });
  document.body.append(dialog);
  let onClosed: (() => void) | undefined;
  let tab: BackupTab = 'export';
  let pending: Profile | null = null;

  const exportTab = tabButton('export', 'Back up');
  const importTab = tabButton('import', 'Restore');
  const body = h('div', { class: 'backup__body' });
  const closeButton = h(
    'button',
    { class: 'sheet__close', type: 'button', 'aria-label': 'Close' },
    icon(ICONS.close),
  );
  dialog.append(
    h(
      'div',
      { class: 'sheet__panel backup__panel' },
      closeButton,
      h('h2', { class: 'sheet__title', id: 'backup-title' }, 'Your Pass, backed up'),
      h(
        'div',
        { class: 'backup__tabs', role: 'tablist', 'aria-label': 'Back up or restore' },
        exportTab,
        importTab,
      ),
      body,
    ),
  );

  const show = (next: BackupTab) => {
    tab = next;
    pending = null;
    for (const button of [exportTab, importTab]) {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    body.replaceChildren(tab === 'export' ? exportPanel() : importPanel());
  };

  const exportPanel = () => {
    const code = pass.exportCode();
    const field = h('textarea', {
      class: 'backup__code',
      readonly: true,
      rows: 5,
      spellcheck: 'false',
      'aria-label': 'Your backup code',
    });
    field.value = code;
    const copyButton = h(
      'button',
      { class: 'button button--play', type: 'button' },
      icon(ICONS.copy),
      'Copy code',
    );
    const copyStatus = h('p', { class: 'backup__status', role: 'status' });
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        copyStatus.textContent = 'Copied. Paste it somewhere safe.';
      } catch {
        field.focus();
        field.select();
        copyStatus.textContent = 'Selected. Press Ctrl+C (or ⌘C) to copy it.';
      }
      setTimeout(() => (copyStatus.textContent = ''), COPIED_FOR_MS * 2);
    });
    const downloadButton = h(
      'button',
      { class: 'button', type: 'button' },
      icon(ICONS.download),
      'Download file',
    );
    downloadButton.addEventListener('click', () => {
      const now = new Date();
      const url = URL.createObjectURL(new Blob([pass.exportFile()], { type: 'application/json' }));
      const link = h('a', { href: url, download: backupFileName(pass.profile, now) });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    return h(
      'div',
      { class: 'backup__pane', role: 'tabpanel', 'aria-labelledby': 'backup-tab-export' },
      h(
        'p',
        { class: 'backup__intro' },
        'This code is your whole Pass: level, badges, stats and look. Keep it somewhere safe, or paste it into NeoArcade on another device to carry on there.',
      ),
      field,
      h('div', { class: 'backup__buttons' }, copyButton, downloadButton),
      copyStatus,
    );
  };

  const importPanel = () => {
    const field = h('textarea', {
      class: 'backup__code',
      rows: 5,
      spellcheck: 'false',
      placeholder: 'NEOPASS1.…',
      'aria-label': 'Backup code or file contents',
    });
    const fileInput = h('input', {
      type: 'file',
      accept: '.json,.txt,application/json,text/plain',
      hidden: true,
    });
    const chooseButton = h(
      'button',
      { class: 'button', type: 'button' },
      icon(ICONS.restore),
      'Choose a file',
    );
    const checkButton = h(
      'button',
      { class: 'button button--play', type: 'button' },
      'Check backup',
    );
    const problem = h('p', { class: 'backup__problem', role: 'alert' });
    const previewSlot = h('div', { class: 'backup__preview-slot' });

    chooseButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      field.value = await file.text();
      check();
    });
    const check = () => {
      const reading = readBackup(field.value, new Date());
      previewSlot.replaceChildren();
      pending = null;
      problem.textContent = reading.ok ? '' : reading.problem;
      if (!reading.ok) return;
      pending = reading.profile;
      previewSlot.replaceChildren(previewCard(reading.profile, reading.exportedAt));
      previewSlot.querySelector<HTMLElement>('.button--danger')?.focus();
    };
    checkButton.addEventListener('click', check);

    const locked = pass.health === 'newer-version';
    for (const control of [field, chooseButton, checkButton])
      control.toggleAttribute('disabled', locked);

    return h(
      'div',
      { class: 'backup__pane', role: 'tabpanel', 'aria-labelledby': 'backup-tab-import' },
      h(
        'p',
        { class: 'backup__intro' },
        locked
          ? 'Restoring is paused while this browser holds a Pass from a newer version of NeoArcade.'
          : 'Paste a backup code, or choose a backup file. You will see whose Pass it is before anything changes.',
      ),
      field,
      fileInput,
      h('div', { class: 'backup__buttons' }, checkButton, chooseButton),
      problem,
      previewSlot,
    );
  };

  const previewCard = (profile: Profile, exportedAt: string | null) => {
    const summary = summariseProfile(profile);
    const current = summariseProfile(pass.profile);
    const replaceButton = h(
      'button',
      { class: 'button button--danger', type: 'button' },
      icon(ICONS.restore),
      'Replace my Pass',
    );
    replaceButton.addEventListener('click', () => {
      if (!pending) return;
      pass.restore(pending);
      dialog.close();
      onRestored(summary);
    });
    return h(
      'div',
      { class: 'backup__preview' },
      h(
        'div',
        { class: 'backup__who' },
        h('span', { class: 'backup__avatar' }, drawAvatar(profile.look)),
        h(
          'div',
          {},
          buildNamePlate(summary.name, profile.look.frame),
          h('p', { class: 'backup__rank' }, `Level ${summary.level} · ${summary.rank.name}`),
        ),
      ),
      h(
        'dl',
        { class: 'backup__facts' },
        fact('XP', formatNumber(summary.xp)),
        fact('Badges', String(summary.badges)),
        fact('Games', String(summary.games)),
        fact('Started', dateFormat.format(new Date(summary.createdAt))),
        exportedAt ? fact('Backed up', dateFormat.format(new Date(exportedAt))) : null,
      ),
      h(
        'p',
        { class: 'backup__warning' },
        `This replaces the Pass in this browser (${current.name}, level ${current.level}, ${current.badges} badges). It can’t be undone, so back that one up first if you might want it.`,
      ),
      h('div', { class: 'backup__buttons' }, replaceButton),
    );
  };

  for (const button of [exportTab, importTab]) {
    button.addEventListener('click', () => show(button.dataset.tab as BackupTab));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      show(tab === 'export' ? 'import' : 'export');
      (tab === 'export' ? exportTab : importTab).focus();
    });
  }
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => onClosed?.());

  return {
    open(next, closed) {
      onClosed = closed;
      show(next);
      dialog.showModal();
      (next === 'export' ? exportTab : importTab).focus();
    },
  };
}

export interface ResetDialog {
  open(onClosed?: () => void): void;
}

/** "Start over": says exactly what will be erased, offers a backup first, then erases. */
export function createResetDialog(
  pass: ArcadePass,
  backUpFirst: () => void,
  onReset: () => void,
): ResetDialog {
  const dialog = h('dialog', {
    class: 'sheet reset',
    'aria-labelledby': 'reset-title',
    'aria-describedby': 'reset-text',
  });
  document.body.append(dialog);
  let onClosed: (() => void) | undefined;
  const text = h('p', { class: 'reset__text', id: 'reset-text' });
  const eraseButton = h(
    'button',
    { class: 'button button--danger', type: 'button' },
    icon(ICONS.erase),
    'Erase my Pass',
  );
  const backupButton = h(
    'button',
    { class: 'button', type: 'button' },
    icon(ICONS.download),
    'Back up first',
  );
  const cancelButton = h('button', { class: 'button', type: 'button' }, 'Keep it');

  dialog.append(
    h(
      'div',
      { class: 'sheet__panel reset__panel' },
      h('h2', { class: 'sheet__title', id: 'reset-title' }, 'Start over?'),
      text,
      h('div', { class: 'sheet__actions' }, backupButton, cancelButton, eraseButton),
    ),
  );

  eraseButton.addEventListener('click', () => {
    pass.reset();
    dialog.close();
    onReset();
  });
  backupButton.addEventListener('click', () => {
    dialog.close();
    backUpFirst();
  });
  cancelButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => onClosed?.());

  return {
    open(closed) {
      onClosed = closed;
      const summary = summariseProfile(pass.profile);
      text.textContent = `This erases ${summary.name}’s Arcade Pass in this browser: level ${summary.level}, ${formatNumber(summary.xp)} XP and ${summary.badges} badges. Each game keeps its own settings and saves.`;
      eraseButton.toggleAttribute('disabled', pass.health === 'newer-version');
      dialog.showModal();
      cancelButton.focus();
    },
  };
}

function tabButton(tab: BackupTab, label: string) {
  return h(
    'button',
    { class: 'backup__tab', type: 'button', role: 'tab', id: `backup-tab-${tab}`, 'data-tab': tab },
    label,
  );
}

function fact(term: string, value: string) {
  return h('div', {}, h('dt', {}, term), h('dd', {}, value));
}
