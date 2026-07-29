// exercise-actions.js — rename and muscle-group flows shared by the Manage
// screen and the in-exercise (log) screen, so the owner can do either without
// first walking back to the main menu (owner feedback), and both entry points
// stay in step. Each flow calls ctx.refresh() so the screen it was opened from
// re-renders with the new name or group.

import { promptSheet, menuSheet, sheet } from './components.js';
import { MUSCLE_GROUPS } from '../store.js';

// Add sheet: name plus an optional muscle group, in ONE sheet. Change set 3
// amends the earlier choice (D8) that new exercises always land Ungrouped and
// are tagged later from Manage: the owner asked to group an exercise as they
// add it. The group stays optional — no chip selected is still Ungrouped — so
// the fast path is unchanged in tap count.
//
// Built on sheet() rather than by growing promptSheet a mode flag: promptSheet
// has four other call sites that all want exactly one field. The inline-error
// contract is reproduced here deliberately (sheet() does not provide it): a
// duplicate name must report and keep the sheet open, never discard the typing.
export function exerciseAddSheet(ctx, { onAdded }) {
  sheet({
    title: 'New exercise',
    build(card, close) {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'Exercise name');

      const groupLabel = document.createElement('p');
      groupLabel.className = 'sheet-field';
      groupLabel.textContent = 'Muscle group (optional)';

      let selected = null;
      const chips = document.createElement('div');
      chips.className = 'chip-row';
      const chipFor = (group) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = group;
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          // Tapping the chosen group again clears it, so the owner can back out
          // to Ungrouped without cancelling the whole sheet.
          selected = selected === group ? null : group;
          for (const c of chips.children) c.setAttribute('aria-pressed', String(c.textContent === selected));
        });
        return chip;
      };
      for (const group of MUSCLE_GROUPS) chips.appendChild(chipFor(group));

      const err = document.createElement('p');
      err.className = 'sheet-error';
      const save = document.createElement('button');
      save.className = 'btn-primary';
      save.textContent = 'Add';
      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);

      let saving = false;
      const submit = async () => {
        if (saving) return; // Enter plus a tap must not create two exercises.
        saving = true;
        save.disabled = true;
        try {
          const ex = await ctx.store.addExercise(input.value, { muscleGroup: selected });
          close();
          await onAdded(ex);
        } catch (e) {
          err.textContent = e.message;
          saving = false;
          save.disabled = false;
        }
      };
      save.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

      card.append(input, groupLabel, chips, err, save, cancel);
      setTimeout(() => input.focus(), 50);
    },
  });
}

// promptSheet surfaces a thrown ValidationError (e.g. a duplicate name) inline
// and keeps itself open, so no extra handling is needed here.
export function renameExerciseFlow(ex, ctx) {
  promptSheet({
    title: `Rename “${ex.name}”`,
    label: 'New name',
    value: ex.name,
    async onSubmit(value) {
      await ctx.store.renameExercise(ex.id, value);
      ctx.refresh();
    },
  });
}

// Assigning a group is a one-tap choice from the curated taxonomy (D8);
// "Ungrouped" clears it again.
export function muscleGroupSheet(ex, ctx) {
  menuSheet({
    title: `Muscle group for “${ex.name}”`,
    items: [
      ...MUSCLE_GROUPS.map((group) => ({
        label: group === ex.muscleGroup ? `${group} ✓` : group,
        onTap: async () => { await ctx.store.setMuscleGroup(ex.id, group); ctx.refresh(); },
      })),
      {
        label: 'Ungrouped',
        onTap: async () => { await ctx.store.setMuscleGroup(ex.id, null); ctx.refresh(); },
      },
    ],
  });
}
