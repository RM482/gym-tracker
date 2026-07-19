// dashboard.js — progress charts, PRs, consistency (plan §6.4).

import { header, placeholder } from './components.js';
import { exerciseProgress, filterSetsByPeriod, consistencyWorkouts } from '../stats.js';
import { lineChart } from './chart.js';

let selectedExerciseId = null;
let selectedPeriod = '8w';

function dateLabel(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export async function render(el, params, ctx) {
  el.appendChild(header({ title: 'Progress', back: '#/' }));
  const exercises = await ctx.store.listExercises({ order: 'recent' });
  if (!exercises.length) {
    el.appendChild(placeholder('Add an exercise and log your first set to see progress.'));
    return;
  }
  if (!exercises.some((exercise) => exercise.id === selectedExerciseId)) selectedExerciseId = exercises[0].id;

  const controls = document.createElement('div');
  controls.className = 'dashboard-controls';
  const exerciseSelect = document.createElement('select');
  exerciseSelect.setAttribute('aria-label', 'Exercise');
  for (const exercise of exercises) {
    const option = document.createElement('option');
    option.value = exercise.id; option.textContent = exercise.name;
    option.selected = exercise.id === selectedExerciseId;
    exerciseSelect.appendChild(option);
  }
  const periodSelect = document.createElement('select');
  periodSelect.setAttribute('aria-label', 'Period');
  for (const [value, label] of [['8w', '8 weeks'], ['6m', '6 months'], ['all', 'All']]) {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; option.selected = value === selectedPeriod;
    periodSelect.appendChild(option);
  }
  controls.append(exerciseSelect, periodSelect);
  el.appendChild(controls);
  const body = document.createElement('div');
  el.appendChild(body);

  const allExercises = await ctx.store.listExercises({ includeArchived: true, order: 'manual' });
  const allNested = await Promise.all(allExercises.map((exercise) => ctx.store.getSetsForExercise(exercise.id)));
  const allSets = allNested.flat();
  const consistency = consistencyWorkouts(allSets, ctx.store.getTodayDay());

  const draw = async () => {
    selectedExerciseId = exerciseSelect.value;
    selectedPeriod = periodSelect.value;
    body.replaceChildren();
    const sets = await ctx.store.getSetsForExercise(selectedExerciseId);
    if (!sets.length) {
      body.appendChild(placeholder('Log your first set to see progress.'));
      const line = document.createElement('p');
      line.className = 'consistency-line';
      line.textContent = `${consistency} workout${consistency === 1 ? '' : 's'} in the last 4 weeks`;
      body.appendChild(line);
      return;
    }
    const allProgress = exerciseProgress(sets);
    const periodSets = filterSetsByPeriod(sets, ctx.store.getTodayDay(), selectedPeriod);
    const periodProgress = exerciseProgress(periodSets);

    const prCard = document.createElement('section');
    prCard.className = 'card pr-card';
    const title = document.createElement('h2'); title.textContent = 'Personal records'; prCard.appendChild(title);
    const addPr = (label, record, unit, decimals = 0) => {
      if (!record) return;
      const row = document.createElement('p');
      row.textContent = `★ ${label}: ${Number(record.value.toFixed(decimals))} ${unit} · ${dateLabel(record.day)}`;
      prCard.appendChild(row);
    };
    addPr('Heaviest', allProgress.prs.heaviest, 'kg', 2);
    addPr('Best estimated 1RM', allProgress.prs.e1rm, 'kg', 1);
    addPr('Most reps', allProgress.prs.reps, 'reps');
    body.appendChild(prCard);

    if (!periodSets.length) {
      body.appendChild(placeholder('No sessions in this period.'));
    } else if (allProgress.mode === 'reps') {
      body.appendChild(lineChart({
        title: 'Max reps', unit: 'reps',
        points: periodProgress.days.map((day) => ({ day: day.day, value: day.maxReps })),
      }));
    } else {
      body.appendChild(lineChart({
        title: 'Top-set weight', unit: 'kg', decimals: 1,
        points: periodProgress.days.map((day) => ({ day: day.day, value: day.topWeightKg })),
      }));
      body.appendChild(lineChart({
        title: 'Best estimated 1RM', unit: 'kg', decimals: 1,
        points: periodProgress.days.map((day) => ({ day: day.day, value: day.bestE1rmKg })),
      }));
    }
    const line = document.createElement('p');
    line.className = 'consistency-line';
    line.textContent = `${consistency} workout${consistency === 1 ? '' : 's'} in the last 4 weeks`;
    body.appendChild(line);
  };
  exerciseSelect.addEventListener('change', draw);
  periodSelect.addEventListener('change', draw);
  await draw();
}
