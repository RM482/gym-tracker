// manage.js — add/rename/archive/unarchive/delete/reorder exercises (plan §6.5).
// Reorder via ▲▼ buttons (accessible, no drag). Delete is a two-step confirm
// naming the exact set count; archive is always offered as the safe default.

import { header, promptSheet, confirmSheet, menuSheet, toast } from './components.js';
import { ValidationError } from '../store.js';

let showArchived = false; // session-level toggle

export async function render(el, params, ctx) {
  el.appendChild(header({ title: 'Manage exercises', back: '#/' }));

  const active = await ctx.store.listExercises();
  const all = await ctx.store.listExercises({ includeArchived: true });
  const archived = all.filter((x) => x.archivedAtMs);

  if (active.length === 0 && archived.length === 0) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = 'No exercises yet — add one below.';
    el.appendChild(p);
  }

  active.forEach((ex, i) => el.appendChild(activeRow(ex, i, active.length, ctx)));

  el.appendChild(addButton(ctx));

  if (archived.length > 0) {
    const toggle = document.createElement('button');
    toggle.className = 'btn-secondary';
    toggle.textContent = showArchived ? 'Hide archived' : `Show archived (${archived.length})`;
    toggle.addEventListener('click', () => { showArchived = !showArchived; ctx.refresh(); });
    el.appendChild(toggle);
    if (showArchived) {
      const label = document.createElement('p');
      label.className = 'section-label';
      label.textContent = 'Archived';
      el.appendChild(label);
      for (const ex of archived) el.appendChild(archivedRow(ex, ctx));
    }
  }
}

function activeRow(ex, index, count, ctx) {
  const row = document.createElement('div');
  row.className = 'list-row';
  const main = document.createElement('span');
  main.className = 'row-main';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = ex.name;
  main.appendChild(name);
  row.appendChild(main);

  const actions = document.createElement('span');
  actions.className = 'row-actions';
  const up = iconBtn('▲', `Move ${ex.name} up`, async () => { await ctx.store.moveExercise(ex.id, -1); ctx.refresh(); });
  const down = iconBtn('▼', `Move ${ex.name} down`, async () => { await ctx.store.moveExercise(ex.id, 1); ctx.refresh(); });
  up.disabled = index === 0;
  down.disabled = index === count - 1;
  const more = iconBtn('⋯', `Options for ${ex.name}`, () => optionsMenu(ex, ctx));
  actions.append(up, down, more);
  row.appendChild(actions);
  return row;
}

function archivedRow(ex, ctx) {
  const row = document.createElement('div');
  row.className = 'list-row';
  const main = document.createElement('span');
  main.className = 'row-main';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = ex.name;
  const sub = document.createElement('span');
  sub.className = 'sub archived-label';
  sub.textContent = 'Archived — history kept';
  main.append(name, sub);
  row.appendChild(main);

  const actions = document.createElement('span');
  actions.className = 'row-actions';
  actions.append(
    iconBtn('↩', `Unarchive ${ex.name}`, () => unarchive(ex, ctx)),
    iconBtn('⋯', `Options for ${ex.name}`, () => menuSheet({
      title: ex.name,
      items: [{ label: 'Delete permanently…', danger: true, onTap: () => deleteFlow(ex, ctx) }],
    })),
  );
  row.appendChild(actions);
  return row;
}

function iconBtn(icon, label, onTap) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.setAttribute('aria-label', label);
  b.textContent = icon;
  b.addEventListener('click', onTap);
  return b;
}

function optionsMenu(ex, ctx) {
  menuSheet({
    title: ex.name,
    items: [
      {
        label: 'Rename',
        onTap: () => promptSheet({
          title: `Rename “${ex.name}”`,
          label: 'New name',
          value: ex.name,
          async onSubmit(value) {
            await ctx.store.renameExercise(ex.id, value);
            ctx.refresh();
          },
        }),
      },
      {
        label: 'Archive (safe — keeps history)',
        onTap: async () => {
          await ctx.store.archiveExercise(ex.id);
          toast(`${ex.name} archived`);
          ctx.refresh();
        },
      },
      { label: 'Delete permanently…', danger: true, onTap: () => deleteFlow(ex, ctx) },
    ],
  });
}

// Two-step delete naming the set count; archive offered first (plan §6.5, §12).
async function deleteFlow(ex, ctx) {
  const count = await ctx.store.countSets(ex.id);
  confirmSheet({
    title: `Delete “${ex.name}”?`,
    message: count > 0
      ? `This deletes ${count} logged set${count === 1 ? '' : 's'} forever. Archiving keeps your history — consider that instead.`
      : 'This exercise has no logged sets.',
    confirmLabel: 'Continue to delete…',
    danger: true,
    onConfirm: () => confirmSheet({
      title: 'Really delete forever?',
      message: `“${ex.name}”${count > 0 ? ` and its ${count} set${count === 1 ? '' : 's'}` : ''} will be gone for good. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
      async onConfirm() {
        await ctx.store.deleteExercise(ex.id);
        toast(`${ex.name} deleted`);
        ctx.refresh();
      },
    }),
  });
}

// Unarchive; on a name conflict with an active exercise, ask for a new name (plan §6.5).
async function unarchive(ex, ctx) {
  try {
    await ctx.store.unarchiveExercise(ex.id);
    toast(`${ex.name} restored`);
    ctx.refresh();
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    promptSheet({
      title: 'Name already in use',
      label: 'New name',
      value: `${ex.name} (2)`,
      submitLabel: 'Unarchive',
      async onSubmit(value) {
        await ctx.store.unarchiveExercise(ex.id, { newName: value });
        ctx.refresh();
      },
    });
  }
}

function addButton(ctx) {
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = '＋ Add exercise';
  btn.addEventListener('click', () => {
    promptSheet({
      title: 'New exercise',
      label: 'Exercise name',
      submitLabel: 'Add',
      async onSubmit(value) {
        await ctx.store.addExercise(value);
        ctx.refresh();
      },
    });
  });
  return btn;
}
