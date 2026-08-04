// exercise-picker.js — a bottom sheet for choosing one exercise out of a long
// list, grouped into muscle-group sections that fold (owner feedback, change
// set 4: "I can't scroll the list of exercises… ideally would also have them
// grouped in their groups, in a foldable way").
//
// A plain menuSheet cannot do this job: it renders one flat button per item, so
// with twenty exercises the sheet grew past the top of the screen. The sheet
// itself is now bounded and scrollable (style.css), and this picker scrolls its
// LIST rather than the whole sheet, so the title and Cancel stay put instead of
// scrolling away from someone halfway down a long list.
//
// Fold state is the same `settings.collapsedGroups` Home uses — one preference,
// not one per screen — so folding Legs here folds it there too, and vice versa.

import { sheet, groupExercises, groupToggleButton } from './components.js';

export function pickExerciseSheet({ title, exercises, collapsedGroups = [], onPick, onFoldChange }) {
  const collapsed = new Set(collapsedGroups);

  sheet({
    title,
    build(card, close) {
      const list = document.createElement('div');
      list.className = 'picker-list';

      // Each section keeps its own rows and its own repaint, so folding touches
      // only that section — no whole-sheet rebuild that would lose the scroll
      // position mid-list.
      for (const section of groupExercises(exercises)) {
        const rows = section.rows.map((ex) => {
          const item = document.createElement('button');
          item.className = 'menu-item';
          item.textContent = ex.name;
          item.addEventListener('click', () => { close(); onPick(ex); });
          return item;
        });

        const apply = () => {
          const open = !collapsed.has(section.name);
          for (const row of rows) row.style.display = open ? '' : 'none';
          return open;
        };

        const { btn, paint } = groupToggleButton({
          name: section.name,
          count: section.rows.length,
          expanded: !collapsed.has(section.name),
          onToggle: () => {
            if (collapsed.has(section.name)) collapsed.delete(section.name);
            else collapsed.add(section.name);
            paint(apply());
            onFoldChange?.([...collapsed]);
          },
        });

        const heading = document.createElement('h3');
        heading.className = 'section-label group-heading picker-heading';
        heading.appendChild(btn);
        list.appendChild(heading);
        for (const row of rows) list.appendChild(row);
        apply();
      }

      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);

      card.append(list, cancel);
    },
  });
}
