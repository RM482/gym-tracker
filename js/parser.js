// parser.js — deterministic, offline quick-entry grammar (plan §8.4).
// Returns { sets, errors } and never throws. If any fragment is invalid, sets
// is empty so callers cannot accidentally save a partial sentence.

const NUMBER_WORDS = new Map([
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6],
  ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10], ['eleven', 11], ['twelve', 12],
  ['een', 1], ['twee', 2], ['drie', 3], ['vier', 4], ['vijf', 5], ['zes', 6],
  ['zeven', 7], ['acht', 8], ['negen', 9], ['tien', 10], ['elf', 11], ['twaalf', 12],
]);

const WEIGHT_UNIT = '(?:kg|kilo|kilos)';
const AT = '(?:@|at|op)';
const REPS = '(?:reps?|keer)';

function replaceNumberWords(value) {
  return value.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf)\b/gi,
    (word) => String(NUMBER_WORDS.get(word.toLowerCase())));
}

function reason(message) {
  return { error: message };
}

function validWeight(value) {
  return Number.isFinite(value) && value >= 0 && value <= 999
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

function validateAndExpand(count, reps, weightKg) {
  if (!Number.isInteger(count) || count < 1 || count > 20) return reason('use between 1 and 20 sets');
  if (!Number.isInteger(reps) || reps < 1 || reps > 200) return reason('reps must be between 1 and 200');
  if (!validWeight(weightKg)) return reason('weight must be between 0 and 999 kg, with at most 2 decimals');
  return { sets: Array.from({ length: count }, () => ({ weightKg, reps })), weightKg };
}

function parseFragment(raw, inheritedWeight) {
  let text = replaceNumberWords(raw.toLowerCase())
    .replace(/[×]/g, 'x')
    .replace(/^\s*(?:i\s+did|ik\s+deed|deed)\s+/, '')
    .trim();
  let match;

  // Bodyweight must be explicit and always means zero added weight.
  match = text.match(new RegExp(`^(?:bw|body\\s*weight)\\s*x\\s*(\\d+)\\s*${REPS}?$`, 'i'));
  if (match) return validateAndExpand(1, Number(match[1]), 0);

  // 2x8 @ 10kg
  match = text.match(new RegExp(`^(\\d+)\\s*x\\s*(\\d+)\\s*${AT}\\s*(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_UNIT}?$`, 'i'));
  if (match) return validateAndExpand(Number(match[1]), Number(match[2]), Number(match[3]));

  // 2 sets of 8 reps at 10kg (also accepts Dutch "van" / "op").
  match = text.match(new RegExp(`^(\\d+)\\s*sets?\\s*(?:of|van)?\\s*(\\d+)\\s*${REPS}?\\s*${AT}\\s*(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_UNIT}?$`, 'i'));
  if (match) return validateAndExpand(Number(match[1]), Number(match[2]), Number(match[3]));

  // 8 reps @ 9kg
  match = text.match(new RegExp(`^(\\d+)\\s*${REPS}?\\s*${AT}\\s*(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_UNIT}?$`, 'i'));
  if (match) return validateAndExpand(1, Number(match[1]), Number(match[2]));

  // 10kg x 8 — the unit is required so this cannot look like sets × reps.
  match = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${WEIGHT_UNIT}\\s*x\\s*(\\d+)\\s*${REPS}?$`, 'i'));
  if (match) return validateAndExpand(1, Number(match[2]), Number(match[1]));

  // 2x8 or "2 sets of 8" uses the last weight in this sentence, otherwise
  // the value pre-filled in the manual controls. A > 6 is deliberately rejected.
  match = text.match(/^(\d+)\s*x\s*(\d+)$/i)
    || text.match(new RegExp(`^(\\d+)\\s*sets?\\s*(?:of|van)?\\s*(\\d+)\\s*${REPS}?$`, 'i'));
  if (match) {
    const count = Number(match[1]);
    if (count > 6) return reason('add kg or @ to make this unambiguous');
    if (!validWeight(inheritedWeight)) return reason('add a weight, kg, or @');
    return validateAndExpand(count, Number(match[2]), inheritedWeight);
  }

  // Bare reps inherit the last weight mentioned, then the pre-filled weight.
  match = text.match(new RegExp(`^(\\d+)\\s*${REPS}?$`, 'i'));
  if (match) {
    if (!validWeight(inheritedWeight)) return reason('add a weight, kg, or @');
    return validateAndExpand(1, Number(match[1]), inheritedWeight);
  }

  return reason('could not understand this part');
}

export function parseQuickEntry(input, { fallbackWeightKg = null } = {}) {
  if (typeof input !== 'string' || !input.trim()) {
    return { sets: [], errors: [{ fragment: '', reason: 'enter the sets you did' }] };
  }

  // Decimal commas are protected first. A separator comma followed by a space
  // remains a separator: "22,5" is decimal, while "10, 1x8" is two fragments.
  const normalized = input.replace(/(\d),(?=\d)/g, '$1.');
  const fragments = normalized.split(/\s*(?:[,;\n]|\bthen\b|\band\b|\ben\b|\bdaarna\b)\s*/i)
    .map((value) => value.trim())
    .filter(Boolean);
  if (fragments.length === 0) {
    return { sets: [], errors: [{ fragment: input, reason: 'enter the sets you did' }] };
  }

  const sets = [];
  const errors = [];
  let lastWeight = validWeight(fallbackWeightKg) ? fallbackWeightKg : null;
  for (const fragment of fragments) {
    const result = parseFragment(fragment, lastWeight);
    if (result.error) {
      errors.push({ fragment, reason: result.error });
      continue;
    }
    sets.push(...result.sets);
    lastWeight = result.weightKg;
    if (sets.length > 30) errors.push({ fragment, reason: 'a sentence can add at most 30 sets' });
  }
  return errors.length ? { sets: [], errors } : { sets, errors: [] };
}
