// settings.js — Phase 7 settings/backup surface. The owner-requested readable
// analysis export ships early; restorable backup/import remains Phase 7.

import { header, placeholder } from './components.js';
import { toast } from './components.js';
import { collectAnalysisExport, analysisExportFilename } from '../analysis-export.js';
import { collectBackup, backupFilename } from '../backup.js';
import * as platform from '../platform.js';

export async function render(el, params, ctx) {
  el.appendChild(header({ title: 'Settings', back: '#/' }));

  // Prepare while the screen renders. Calling navigator.share must happen
  // directly from the later tap; awaiting IndexedDB first would lose Safari's
  // transient user activation and the share sheet could be blocked.
  const preparedAtMs = Date.now();
  let preparedData = null;
  let preparationError = null;
  try {
    preparedData = await collectAnalysisExport(ctx.store, preparedAtMs);
  } catch (err) {
    preparationError = err;
  }
  let preparedBackup = null;
  try { preparedBackup = await collectBackup(ctx.store, preparedAtMs); } catch { /* shown if tapped */ }

  const settings = await ctx.store.getSettings();
  const preferences = document.createElement('section');
  preferences.className = 'card settings-card';
  const prefTitle = document.createElement('h2'); prefTitle.textContent = 'Logging preferences';
  const makeSelect = (labelText, options, value, onChange) => {
    const label = document.createElement('label'); label.className = 'settings-field';
    const span = document.createElement('span'); span.textContent = labelText;
    const select = document.createElement('select');
    for (const [optionValue, optionLabel] of options) {
      const option = document.createElement('option'); option.value = optionValue; option.textContent = optionLabel;
      option.selected = String(value) === optionValue; select.appendChild(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    label.append(span, select); return label;
  };
  preferences.append(
    prefTitle,
    makeSelect('Coarse weight increment', [['1', '1 kg'], ['2', '2 kg'], ['2.5', '2.5 kg'], ['5', '5 kg']], settings.coarseIncrementKg,
      (value) => ctx.store.updateSettings({ coarseIncrementKg: Number(value) })),
    makeSelect('Exercise order', [['recent', 'Most recent'], ['manual', 'My order']], settings.exerciseSort,
      (value) => ctx.store.updateSettings({ exerciseSort: value })),
  );
  el.appendChild(preferences);

  const backupCard = document.createElement('section'); backupCard.className = 'card settings-card';
  const backupTitle = document.createElement('h2'); backupTitle.textContent = 'Restorable backup';
  const backupCopy = document.createElement('p'); backupCopy.textContent = 'Save a complete backup for restoring this app on this or a new phone.';
  const backupButton = document.createElement('button'); backupButton.className = 'btn-primary'; backupButton.textContent = 'Export backup';
  const backupError = document.createElement('p'); backupError.className = 'sheet-error';
  backupButton.disabled = !preparedBackup;
  backupButton.addEventListener('click', async () => {
    try {
      const file = new File([`${JSON.stringify(preparedBackup, null, 2)}\n`], backupFilename(preparedAtMs), { type: 'application/json' });
      if (platform.canShare(file)) await platform.shareFile(file); else platform.downloadFile(file);
      await ctx.store.updateSettings({ lastExportAtMs: preparedAtMs });
      toast('Backup ready ✓');
    } catch (err) { if (err?.name !== 'AbortError') backupError.textContent = `Couldn’t export: ${err.message}`; }
  });
  backupCard.append(backupTitle, backupCopy, backupButton, backupError); el.appendChild(backupCard);

  const exportCard = document.createElement('section');
  exportCard.className = 'card settings-card';
  const title = document.createElement('h2');
  title.textContent = 'Use your data elsewhere';
  const copy = document.createElement('p');
  copy.textContent = 'Export readable JSON with exercise names, dates, weights and reps. You can attach this file to an LLM for analysis.';
  const privacy = document.createElement('p');
  privacy.className = 'privacy-note';
  privacy.textContent = 'Nothing is uploaded by this app. The file leaves your phone only when you choose where to save or share it.';
  const button = document.createElement('button');
  button.className = 'btn-primary';
  button.textContent = 'Export for AI analysis';
  const error = document.createElement('p');
  error.className = 'sheet-error';
  error.setAttribute('aria-live', 'polite');
  if (preparationError) {
    button.disabled = true;
    error.textContent = `Couldn’t prepare your data: ${preparationError.message}`;
  }
  button.addEventListener('click', async () => {
    if (!preparedData) return;
    button.disabled = true;
    error.textContent = '';
    try {
      const filename = analysisExportFilename(preparedAtMs);
      const file = new File([`${JSON.stringify(preparedData, null, 2)}\n`], filename, { type: 'application/json' });
      if (platform.canShare(file)) await platform.shareFile(file);
      else platform.downloadFile(file);
      toast(`Export ready · ${preparedData.summary.setCount} set${preparedData.summary.setCount === 1 ? '' : 's'}`);
    } catch (err) {
      if (err?.name !== 'AbortError') error.textContent = `Couldn’t export: ${err.message}`;
    } finally {
      button.disabled = false;
    }
  });
  exportCard.append(title, copy, privacy, button, error);
  el.appendChild(exportCard);
  const storage = document.createElement('section'); storage.className = 'card settings-card';
  const storageTitle = document.createElement('h2'); storageTitle.textContent = 'Storage';
  const storageLine = document.createElement('p'); storageLine.textContent = `Persistent storage: ${await platform.persistenceStatus()}`;
  storage.append(storageTitle, storageLine); el.appendChild(storage);
  el.appendChild(placeholder('Backup import arrives in the next Phase 7 step.'));
}
