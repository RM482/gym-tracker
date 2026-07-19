// settings.js — Phase 7 settings/backup surface. The owner-requested readable
// analysis export ships early; restorable backup/import remains Phase 7.

import { header, placeholder } from './components.js';
import { toast } from './components.js';
import { collectAnalysisExport, analysisExportFilename } from '../analysis-export.js';
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
  el.appendChild(placeholder('Backup restore and the remaining preferences arrive in Phase 7.'));
}
