// store.js — validation + the app-facing data API (plan §5, §8). No DOM access.
// UI code calls this module only; it never touches IndexedDB directly.
//
// Public API:
//   createStore({ dbHandle, platform }) -> store (methods below)
//   ValidationError — every rejected input carries a plain-language message
//
// Store methods (all async):
//   Exercises: listExercises({includeArchived, order}), getExercise(id),
//     addExercise(name, {muscleGroup}), renameExercise(id, name),
//     setMuscleGroup(id, group), archiveExercise(id),
//     unarchiveExercise(id, {newName}), deleteExercise(id) [cascades sets],
//     moveExercise(id, direction), countSets(exerciseId)
//   Sets: addSet({exerciseId, weightKg, reps, performedAtMs?, addOn?}),
//     addSets(exerciseId, [{weightKg, reps}...]) [one transaction, ordered],
//     editSet(id, patch), deleteSet(id) -> deleted record, restoreSet(record),
//     getSetsForExercise(exerciseId), getTodaySets(exerciseId),
//     getPreviousSession(exerciseId), getDaySets(day), getTodayDay()
//   Settings: getSettings(), updateSettings(patch)
//   Diagnostics: unreadableCount() — malformed records seen by reads (plan §12)

import { workoutDay, compareSets } from './stats.js';

export class ValidationError extends Error {
  constructor(message, field = null) { super(message); this.field = field; }
}

const FUTURE_SLACK_MS = 10 * 60000; // §8.2: reject timestamps > now + 10 min
const BATCH_MAX = 30;               // §8.4 limit
const DEFAULT_SETTINGS = { id: 'app', coarseIncrementKg: 2.5, exerciseSort: 'recent', lastExportAtMs: null, lastDataChangeAtMs: null, firstDataChangeAtMs: null, backupBannerSnoozedAtMs: null };

function normName(name) { return String(name ?? '').trim(); }
function nameKey(name) { return normName(name).toLowerCase(); }

export function validateWeight(w) {
  if (typeof w !== 'number' || !Number.isFinite(w)) throw new ValidationError('Weight must be a number', 'weightKg');
  if (w < 0 || w > 999) throw new ValidationError('Weight must be between 0 and 999 kg', 'weightKg');
  if (Math.abs(w * 100 - Math.round(w * 100)) > 1e-9) {
    throw new ValidationError('Weight can have at most 2 decimals', 'weightKg');
  }
}

export function validateReps(r) {
  if (!Number.isInteger(r) || r < 1 || r > 200) {
    throw new ValidationError('Reps must be a whole number between 1 and 200', 'reps');
  }
}

// Curated taxonomy (D8). A fixed list keeps grouping consistent despite
// informal exercise names; `null` means Ungrouped (never assigned), which is
// deliberately distinct from an explicitly chosen "Other".
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body', 'Other'];

export function isValidExercise(x) {
  return x && typeof x.id === 'string' && typeof x.name === 'string'
    && Number.isInteger(x.sortOrder) && typeof x.createdAtMs === 'number';
}

export function isValidSet(s) {
  return s && typeof s.id === 'string' && typeof s.exerciseId === 'string'
    && typeof s.weightKg === 'number' && Number.isInteger(s.reps)
    && typeof s.performedAtMs === 'number' && typeof s.tzOffsetMin === 'number'
    && typeof s.workoutDay === 'string' && typeof s.createdAtMs === 'number';
}

// v2 fields are normalised on read rather than validated into existence. A
// record that somehow escaped the migration must never become "unreadable" and
// vanish from the owner's history over a cosmetic field; writes are always
// canonical (see buildSet / addExercise), reads are forgiving.
export function normalizeExercise(x) {
  return { ...x, muscleGroup: MUSCLE_GROUPS.includes(x.muscleGroup) ? x.muscleGroup : null };
}

export function normalizeSet(s) {
  return { ...s, addOn: s.addOn === true };
}

export function createStore({ dbHandle, platform }) {
  let unreadable = 0;

  function readAllValid(records, validator, normalize = (r) => r) {
    const good = records.filter(validator);
    unreadable += records.length - good.length; // excluded from queries, never deleted (§12)
    return good.map(normalize);
  }

  function validateMuscleGroup(group) {
    if (group === null || group === undefined) return null;
    if (!MUSCLE_GROUPS.includes(group)) throw new ValidationError('Unknown muscle group', 'muscleGroup');
    return group;
  }

  function validateName(name) {
    const n = normName(name);
    if (n.length < 1) throw new ValidationError('Give the exercise a name', 'name');
    if (n.length > 60) throw new ValidationError('Name is too long (max 60 characters)', 'name');
    return n;
  }

  function assertNameFree(exercises, name, exceptId = null) {
    const key = nameKey(name);
    const clash = exercises.find((x) => isValidExercise(x) && !x.archivedAtMs && x.id !== exceptId && nameKey(x.name) === key);
    if (clash) throw new ValidationError(`You already have an exercise called “${clash.name}”`, 'name');
  }

  function validatePerformedAt(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) throw new ValidationError('Invalid date/time', 'performedAtMs');
    if (ms > platform.now() + FUTURE_SLACK_MS) throw new ValidationError('That time is in the future', 'performedAtMs');
  }

  function buildSet(exerciseId, { weightKg, reps, performedAtMs, addOn = false }) {
    validateWeight(weightKg);
    validateReps(reps);
    validatePerformedAt(performedAtMs);
    const tz = platform.tzOffsetMin(performedAtMs);
    return {
      id: platform.uuid(),
      exerciseId,
      weightKg,
      reps,
      addOn: addOn === true,
      performedAtMs,
      tzOffsetMin: tz,
      workoutDay: workoutDay(performedAtMs, tz),
      createdAtMs: platform.now(),
      updatedAtMs: platform.now(),
    };
  }

  async function touchDataChange(stores) {
    const settings = (await stores.settings.get('app')) ?? { ...DEFAULT_SETTINGS };
    // firstDataChangeAtMs is the baseline the backup reminder counts 30 days
    // from when the owner has never exported; without it the reminder fires the
    // moment anything is saved (plan §6.1 asks for 30 days, not immediately).
    settings.firstDataChangeAtMs ??= platform.now();
    settings.lastDataChangeAtMs = platform.now();
    await stores.settings.put(settings);
  }

  const store = {
    // ---------- exercises ----------

    async listExercises({ includeArchived = false, order = 'manual' } = {}) {
      const all = readAllValid(await dbHandle.run('exercises', 'readonly', (s) => s.exercises.getAll()), isValidExercise, normalizeExercise);
      let list = includeArchived ? all : all.filter((x) => !x.archivedAtMs);
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      if (order === 'recent') {
        const last = await this.lastPerformedByExercise();
        list = [...list].sort((a, b) => (last[b.id] ?? -1) - (last[a.id] ?? -1) || a.sortOrder - b.sortOrder);
      }
      return list;
    },

    async lastPerformedByExercise() {
      const sets = readAllValid(await dbHandle.run('sets', 'readonly', (s) => s.sets.getAll()), isValidSet, normalizeSet);
      const out = {};
      for (const s of sets) out[s.exerciseId] = Math.max(out[s.exerciseId] ?? 0, s.performedAtMs);
      return out;
    },

    async getExercise(id) {
      const x = await dbHandle.run('exercises', 'readonly', (s) => s.exercises.get(id));
      return isValidExercise(x) ? normalizeExercise(x) : null;
    },

    async addExercise(name, { muscleGroup = null } = {}) {
      const n = validateName(name);
      const group = validateMuscleGroup(muscleGroup);
      return dbHandle.run(['exercises', 'settings'], 'readwrite', async (s) => {
        const all = await s.exercises.getAll();
        assertNameFree(all, n);
        const maxOrder = Math.max(-1, ...all.filter(isValidExercise).map((x) => x.sortOrder));
        const ex = { id: platform.uuid(), name: n, muscleGroup: group, sortOrder: maxOrder + 1, archivedAtMs: null, createdAtMs: platform.now(), updatedAtMs: platform.now() };
        await s.exercises.put(ex);
        await touchDataChange(s);
        return ex;
      });
    },

    async renameExercise(id, name) {
      const n = validateName(name);
      return dbHandle.run(['exercises', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(id);
        if (!ex) throw new ValidationError('Exercise not found');
        assertNameFree(await s.exercises.getAll(), n, id);
        ex.name = n;
        ex.updatedAtMs = platform.now();
        await s.exercises.put(ex);
        await touchDataChange(s);
        return ex;
      });
    },

    // Muscle group is edited from Manage (D8); null clears it back to Ungrouped.
    async setMuscleGroup(id, muscleGroup) {
      const group = validateMuscleGroup(muscleGroup);
      return dbHandle.run(['exercises', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(id);
        if (!ex) throw new ValidationError('Exercise not found');
        ex.muscleGroup = group;
        ex.updatedAtMs = platform.now();
        await s.exercises.put(ex);
        await touchDataChange(s);
        return normalizeExercise(ex);
      });
    },

    async archiveExercise(id) {
      return dbHandle.run(['exercises', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(id);
        if (!ex) throw new ValidationError('Exercise not found');
        ex.archivedAtMs = platform.now();
        ex.updatedAtMs = platform.now();
        await s.exercises.put(ex);
        await touchDataChange(s);
        return ex;
      });
    },

    // Unarchiving into an active name clash requires a new name (plan §6.5).
    async unarchiveExercise(id, { newName = null } = {}) {
      return dbHandle.run(['exercises', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(id);
        if (!ex) throw new ValidationError('Exercise not found');
        const name = newName != null ? validateName(newName) : ex.name;
        assertNameFree(await s.exercises.getAll(), name, id);
        ex.name = name;
        ex.archivedAtMs = null;
        ex.updatedAtMs = platform.now();
        await s.exercises.put(ex);
        await touchDataChange(s);
        return ex;
      });
    },

    // Permanent delete: exercise + every one of its sets, one transaction (plan §6.5).
    async deleteExercise(id) {
      return dbHandle.run(['exercises', 'sets', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(id);
        if (!ex) throw new ValidationError('Exercise not found');
        const keys = await s.sets.index('byExercise').getAllKeys(id);
        for (const k of keys) await s.sets.delete(k);
        await s.exercises.delete(id);
        await touchDataChange(s);
        return { deletedSets: keys.length };
      });
    },

    async countSets(exerciseId) {
      const keys = await dbHandle.run('sets', 'readonly', (s) => s.sets.index('byExercise').getAllKeys(exerciseId));
      return keys.length;
    },

    // Move up/down among active exercises; rewrites sortOrder 0…n−1 (plan §6.5).
    async moveExercise(id, direction) {
      if (direction !== 1 && direction !== -1) throw new ValidationError('direction must be +1 or -1');
      return dbHandle.run(['exercises', 'settings'], 'readwrite', async (s) => {
        const active = (await s.exercises.getAll()).filter((x) => isValidExercise(x) && !x.archivedAtMs)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const i = active.findIndex((x) => x.id === id);
        if (i === -1) throw new ValidationError('Exercise not found');
        const j = i + direction;
        if (j < 0 || j >= active.length) return; // already at the edge
        [active[i], active[j]] = [active[j], active[i]];
        for (let k = 0; k < active.length; k++) {
          if (active[k].sortOrder !== k) {
            active[k].sortOrder = k;
            active[k].updatedAtMs = platform.now();
            await s.exercises.put(active[k]);
          }
        }
        await touchDataChange(s);
      });
    },

    // ---------- sets ----------

    async addSet({ exerciseId, weightKg, reps, performedAtMs = platform.now(), addOn = false }) {
      const rec = buildSet(exerciseId, { weightKg, reps, performedAtMs, addOn });
      return dbHandle.run(['exercises', 'sets', 'settings'], 'readwrite', async (s) => {
        // FK check inside the same transaction that writes (plan §8.2).
        const ex = await s.exercises.get(exerciseId);
        if (!ex || ex.archivedAtMs) throw new ValidationError('That exercise no longer exists');
        await s.sets.put(rec);
        await touchDataChange(s);
        return rec;
      });
    },

    // Quick-entry batch: one transaction; performedAtMs = now + index (plan §8.2).
    async addSets(exerciseId, sets) {
      if (!Array.isArray(sets) || sets.length === 0) throw new ValidationError('Nothing to save');
      if (sets.length > BATCH_MAX) throw new ValidationError(`At most ${BATCH_MAX} sets at once`);
      const base = platform.now();
      const records = sets.map((x, i) => buildSet(exerciseId, { ...x, performedAtMs: base + i }));
      return dbHandle.run(['exercises', 'sets', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(exerciseId);
        if (!ex || ex.archivedAtMs) throw new ValidationError('That exercise no longer exists');
        for (const r of records) await s.sets.put(r);
        await touchDataChange(s);
        return records;
      });
    },

    async editSet(id, patch) {
      return dbHandle.run(['sets', 'settings'], 'readwrite', async (s) => {
        const rec = await s.sets.get(id);
        if (!isValidSet(rec)) throw new ValidationError('Set not found');
        const next = { ...rec, ...patch };
        validateWeight(next.weightKg);
        validateReps(next.reps);
        next.addOn = next.addOn === true; // correctable from the edit sheet (D7)
        if (next.performedAtMs !== rec.performedAtMs) {
          validatePerformedAt(next.performedAtMs);
          // §11.1: a timestamp edit re-derives the offset from the phone's
          // current zone at the chosen moment; other edits leave both untouched.
          next.tzOffsetMin = platform.tzOffsetMin(next.performedAtMs);
          next.workoutDay = workoutDay(next.performedAtMs, next.tzOffsetMin);
        }
        next.updatedAtMs = platform.now();
        await s.sets.put(next);
        await touchDataChange(s);
        return next;
      });
    },

    // Returns the deleted record so the UI can offer Undo (plan §12).
    async deleteSet(id) {
      return dbHandle.run(['sets', 'settings'], 'readwrite', async (s) => {
        const rec = await s.sets.get(id);
        if (!rec) throw new ValidationError('Set not found');
        await s.sets.delete(id);
        await touchDataChange(s);
        return rec;
      });
    },

    // Undo: re-insert the identical record (same id) if its exercise still exists.
    async restoreSet(record) {
      return dbHandle.run(['exercises', 'sets', 'settings'], 'readwrite', async (s) => {
        const ex = await s.exercises.get(record.exerciseId);
        if (!ex) throw new ValidationError('That exercise no longer exists');
        await s.sets.put(record);
        await touchDataChange(s);
        return record;
      });
    },

    async getSetsForExercise(exerciseId) {
      const sets = readAllValid(await dbHandle.run('sets', 'readonly', (s) => s.sets.index('byExercise').getAll(exerciseId)), isValidSet, normalizeSet);
      return sets.sort(compareSets);
    },

    getTodayDay() {
      return workoutDay(platform.now(), platform.tzOffsetMin(platform.now()));
    },

    async getTodaySets(exerciseId) {
      const sets = await this.getSetsForExercise(exerciseId);
      const today = this.getTodayDay();
      return sets.filter((s) => s.workoutDay === today);
    },

    // "Previous session" = most recent workout day strictly before today's (§6.2).
    async getPreviousSession(exerciseId) {
      const sessions = await this.getRecentSessions(exerciseId, 1);
      return sessions[0] ?? null;
    },

    // Up to `limit` sessions strictly before today, most recent first (§6.2 Earlier line).
    async getRecentSessions(exerciseId, limit = 3) {
      const sets = await this.getSetsForExercise(exerciseId);
      const today = this.getTodayDay();
      const days = [...new Set(sets.map((s) => s.workoutDay))].filter((d) => d < today).sort().reverse().slice(0, limit);
      return days.map((day) => ({ day, sets: sets.filter((s) => s.workoutDay === day) }));
    },

    // Most recent session per exercise INCLUDING today (Home row summaries, §6.1).
    async getLastSessionsByExercise() {
      const sets = readAllValid(await dbHandle.run('sets', 'readonly', (s) => s.sets.getAll()), isValidSet, normalizeSet);
      const byEx = {};
      for (const s of sets) {
        const cur = byEx[s.exerciseId];
        if (!cur || s.workoutDay > cur.day) byEx[s.exerciseId] = { day: s.workoutDay, sets: [s] };
        else if (s.workoutDay === cur.day) cur.sets.push(s);
      }
      for (const v of Object.values(byEx)) v.sets.sort(compareSets);
      return byEx;
    },

    async getDaySets(day) {
      const sets = readAllValid(await dbHandle.run('sets', 'readonly', (s) => s.sets.index('byDay').getAll(day)), isValidSet, normalizeSet);
      return sets.sort(compareSets);
    },

    // ---------- settings ----------

    async getSettings() {
      const s = await dbHandle.run('settings', 'readonly', (st) => st.settings.get('app'));
      return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
    },

    async updateSettings(patch) {
      return dbHandle.run('settings', 'readwrite', async (st) => {
        const current = (await st.settings.get('app')) ?? { ...DEFAULT_SETTINGS };
        const next = { ...current, ...patch, id: 'app' };
        await st.settings.put(next);
        return next;
      });
    },

    async snapshotForBackup() {
      return dbHandle.run(['exercises', 'sets', 'settings'], 'readonly', async (st) => {
        const rawExercises = await st.exercises.getAll();
        const rawSets = await st.sets.getAll();
        const rawSettings = await st.settings.get('app');
        const unreadable = [];
        const exercises = rawExercises.filter((record) => {
          const valid = isValidExercise(record);
          if (!valid) unreadable.push({ store: 'exercises', record });
          return valid;
        });
        const sets = rawSets.filter((record) => {
          const valid = isValidSet(record);
          if (!valid) unreadable.push({ store: 'sets', record });
          return valid;
        });
        if (rawSettings && typeof rawSettings !== 'object') unreadable.push({ store: 'settings', record: rawSettings });
        return { exercises, sets, settings: { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {}) }, unreadable };
      });
    },

    async replaceFromBackup(data) {
      return dbHandle.run(['exercises', 'sets', 'settings'], 'readwrite', async (st) => {
        await st.sets.clear(); await st.exercises.clear(); await st.settings.clear();
        for (const exercise of data.exercises) await st.exercises.put(exercise);
        for (const set of data.sets) await st.sets.put(set);
        await st.settings.put({ ...DEFAULT_SETTINGS, ...data.settings, id: 'app' });
      });
    },

    unreadableCount() { return unreadable; },
  };

  return store;
}

// Backup reminder (plan §6.1): nag only when there are unexported changes AND
// 30 days have passed — counted from the last export, or from the first-ever
// data change when the owner has never exported. Without that baseline the
// reminder fired the instant anything was saved, so it showed permanently.
export function isBackupOverdue(settings, nowMs) {
  const DAY_MS = 86400000;
  const lastChange = settings?.lastDataChangeAtMs;
  if (!lastChange) return false;
  const lastExport = settings.lastExportAtMs;
  if (lastExport && lastChange <= lastExport) return false; // nothing new since the last export
  const baseline = lastExport ?? settings.firstDataChangeAtMs ?? lastChange;
  if (nowMs - baseline <= 30 * DAY_MS) return false;
  const snoozed = settings.backupBannerSnoozedAtMs;
  if (snoozed && nowMs - snoozed <= 7 * DAY_MS) return false;
  return true;
}
