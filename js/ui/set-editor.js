// set-editor.js — one shared edit/delete flow for Log, History and Day (§6.3).

import { sheet, confirmSheet, toast } from './components.js';
import { workoutDay } from '../stats.js';

function localInputValue(ms) {
  const date = new Date(ms);
  const part = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function parseLocalDateTime(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function openSetEditor(set, ctx) {
  const initialDateTime = localInputValue(set.performedAtMs);
  sheet({
    title: 'Edit set',
    build(card, close) {
      const makeField = (labelText, value, inputMode, type = 'text') => {
        const label = document.createElement('label');
        label.className = 'sheet-field';
        const labelTextEl = document.createElement('span');
        labelTextEl.textContent = labelText;
        const input = document.createElement('input');
        input.type = type;
        if (inputMode) input.inputMode = inputMode;
        input.value = value;
        label.append(labelTextEl, input);
        return { label, input };
      };

      const weight = makeField('Weight (kg)', String(set.weightKg), 'decimal');
      const reps = makeField('Repetitions', String(set.reps), 'numeric');

      // The machine add-on is recorded state, correctable here (D7). Its
      // kilograms are unknown, so it never alters the weight field.
      let addOn = set.addOn === true;
      const addOnToggle = document.createElement('button');
      addOnToggle.type = 'button';
      addOnToggle.className = 'addon-toggle';
      const paintAddOn = () => {
        addOnToggle.textContent = addOn ? 'Machine add-on: ON' : 'Machine add-on: off';
        addOnToggle.classList.toggle('addon-on', addOn);
        addOnToggle.setAttribute('aria-pressed', String(addOn));
      };
      addOnToggle.addEventListener('click', () => { addOn = !addOn; paintAddOn(); });
      paintAddOn();
      const when = makeField('Date and time', initialDateTime, undefined, 'datetime-local');
      const dayNote = document.createElement('p');
      dayNote.className = 'day-move-note';
      const error = document.createElement('p');
      error.className = 'sheet-error';
      error.setAttribute('aria-live', 'polite');

      const chosenDay = () => {
        if (when.input.value === initialDateTime) return set.workoutDay;
        const date = parseLocalDateTime(when.input.value);
        return date ? workoutDay(date.getTime(), -date.getTimezoneOffset()) : null;
      };
      const updateDayNote = () => {
        const day = chosenDay();
        if (!day) dayNote.textContent = 'Choose a valid date and time.';
        else if (day !== set.workoutDay) dayNote.textContent = `Moves to workout day: ${day}`;
        else dayNote.textContent = `Workout day: ${day}`;
      };
      when.input.addEventListener('input', updateDayNote);
      updateDayNote();

      const save = document.createElement('button');
      save.className = 'btn-primary';
      save.textContent = 'Save changes';
      let pending = false;
      save.addEventListener('click', async () => {
        if (pending) return;
        error.textContent = '';
        const weightKg = Number(String(weight.input.value).replace(',', '.'));
        const repetitions = Number(reps.input.value);
        const patch = { weightKg, reps: repetitions, addOn };
        if (when.input.value !== initialDateTime) {
          const date = parseLocalDateTime(when.input.value);
          if (!date) { error.textContent = 'Choose a valid date and time'; return; }
          patch.performedAtMs = date.getTime();
        }
        pending = true;
        save.disabled = true;
        try {
          await ctx.store.editSet(set.id, patch);
          close();
          toast('Set updated ✓');
          ctx.refresh();
        } catch (err) {
          pending = false;
          save.disabled = false;
          error.textContent = err.message;
        }
      });

      const remove = document.createElement('button');
      remove.className = 'btn-secondary text-danger';
      remove.textContent = 'Delete set';
      remove.addEventListener('click', () => {
        close();
        confirmSheet({
          title: 'Delete this set?',
          message: 'It will be deleted immediately. You’ll have 6 seconds to undo.',
          confirmLabel: 'Delete set',
          danger: true,
          async onConfirm() {
            try {
              const deleted = await ctx.store.deleteSet(set.id);
              ctx.refresh();
              toast('Set deleted', {
                durationMs: 6000,
                actionLabel: 'Undo',
                async onAction() {
                  try {
                    await ctx.store.restoreSet(deleted);
                    ctx.refresh();
                    toast('Set restored ✓');
                  } catch (err) {
                    toast(err.message);
                  }
                },
              });
            } catch (err) {
              toast(err.message);
            }
          },
        });
      });

      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);
      card.append(weight.label, reps.label, addOnToggle, when.label, dayNote, error, save, remove, cancel);
    },
  });
}
