// exercise-actions.js — rename and muscle-group flows shared by the Manage
// screen and the in-exercise (log) screen, so the owner can do either without
// first walking back to the main menu (owner feedback), and both entry points
// stay in step. Each flow calls ctx.refresh() so the screen it was opened from
// re-renders with the new name or group.

import { promptSheet, menuSheet } from './components.js';
import { MUSCLE_GROUPS } from '../store.js';

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
