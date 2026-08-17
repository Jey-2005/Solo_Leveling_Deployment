/**
 * Body composition maths.
 *
 * Every formula is named with its source so the numbers can be audited.
 * Nothing here is a diagnosis — these are population-level estimates, and the
 * report says so.
 */

const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const r0 = (n) => (Number.isFinite(n) ? Math.round(n) : null);

export const ACTIVITY_LEVELS = [
  { key: 'SEDENTARY',  label: 'Sedentary',        factor: 1.2,   hint: 'Desk work, little deliberate movement' },
  { key: 'LIGHT',      label: 'Lightly active',   factor: 1.375, hint: 'Light exercise 1–3 days a week' },
  { key: 'MODERATE',   label: 'Moderately active',factor: 1.55,  hint: 'Moderate exercise 3–5 days a week' },
  { key: 'ACTIVE',     label: 'Very active',      factor: 1.725, hint: 'Hard exercise 6–7 days a week' },
  { key: 'ATHLETE',    label: 'Athlete',          factor: 1.9,   hint: 'Twice-daily training or physical job' },
];

/** WHO BMI bands, plus the lower Asian cut-offs (WHO 2004 expert consultation). */
export function bmiBand(bmi, useAsianCutoffs = true) {
  if (!Number.isFinite(bmi)) return null;
  const bands = useAsianCutoffs
    ? [[18.5, 'Underweight'], [23, 'Healthy'], [25, 'Overweight'], [30, 'Obese I'], [Infinity, 'Obese II']]
    : [[18.5, 'Underweight'], [25, 'Healthy'], [30, 'Overweight'], [35, 'Obese I'], [Infinity, 'Obese II']];
  for (const [cut, label] of bands) if (bmi < cut) return label;
  return 'Obese II';
}

/**
 * US Navy circumference method.
 * Men need neck + waist; women additionally need hip.
 * Returns null when the inputs cannot support it.
 */
export function navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm }) {
  if (!heightCm || !neckCm || !waistCm) return null;
  if (sex === 'MALE') {
    const d = waistCm - neckCm;
    if (d <= 0) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(heightCm)) - 450;
    return bf > 2 && bf < 70 ? r1(bf) : null;
  }
  if (!hipCm) return null;
  const d = waistCm + hipCm - neckCm;
  if (d <= 0) return null;
  const bf = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.22100 * Math.log10(heightCm)) - 450;
  return bf > 2 && bf < 70 ? r1(bf) : null;
}

/** Deurenberg (1991) — a fallback estimate from BMI, age and sex. Less accurate. */
export function deurenbergBodyFat({ bmi, age, sex }) {
  if (!bmi || !age) return null;
  const s = sex === 'MALE' ? 1 : 0;
  const bf = 1.20 * bmi + 0.23 * age - 10.8 * s - 5.4;
  return bf > 2 && bf < 70 ? r1(bf) : null;
}

/** Mifflin-St Jeor (1990) — the current default for BMR from weight/height/age. */
export function bmrMifflin({ weightKg, heightCm, age, sex }) {
  if (!weightKg || !heightCm || !age) return null;
  return r0(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'MALE' ? 5 : -161));
}

/** Katch-McArdle — more accurate when lean mass is actually known. */
export function bmrKatch(leanMassKg) {
  if (!leanMassKg) return null;
  return r0(370 + 21.6 * leanMassKg);
}

/** Body fat reference bands (American Council on Exercise). */
export function bodyFatBand(bf, sex) {
  if (!Number.isFinite(bf)) return null;
  const bands = sex === 'MALE'
    ? [[6, 'Essential'], [14, 'Athletic'], [18, 'Fitness'], [25, 'Average'], [Infinity, 'Above average']]
    : [[14, 'Essential'], [21, 'Athletic'], [25, 'Fitness'], [32, 'Average'], [Infinity, 'Above average']];
  for (const [cut, label] of bands) if (bf < cut) return label;
  return 'Above average';
}

/**
 * Waist-to-height ratio. Predicts cardiometabolic risk better than BMI in most
 * populations, and needs no equipment beyond a tape measure.
 */
export function whtrBand(ratio) {
  if (!Number.isFinite(ratio)) return null;
  if (ratio < 0.40) return 'Below range';
  if (ratio < 0.50) return 'Healthy';
  if (ratio < 0.60) return 'Increased risk';
  return 'High risk';
}

/** Ideal weight, four classical formulas plus the healthy-BMI span. */
export function idealWeights({ heightCm, sex }) {
  if (!heightCm) return null;
  const inchesOver5ft = Math.max(0, heightCm / 2.54 - 60);
  const male = sex === 'MALE';
  return {
    devine:   r1((male ? 50   : 45.5) + 2.3 * inchesOver5ft),
    robinson: r1((male ? 52   : 49)   + (male ? 1.9 : 1.7) * inchesOver5ft),
    miller:   r1((male ? 56.2 : 53.1) + (male ? 1.41 : 1.36) * inchesOver5ft),
    hamwi:    r1((male ? 48   : 45.5) + (male ? 2.7 : 2.2) * inchesOver5ft),
    bmiRange: [r1(18.5 * (heightCm / 100) ** 2), r1(24.9 * (heightCm / 100) ** 2)],
  };
}

/**
 * Fat-Free Mass Index. Normalised to 1.8 m. An FFMI near 25 is widely treated
 * as the practical natural ceiling for men (Kouri et al., 1995); ~21 for women.
 */
export function ffmi({ leanMassKg, heightCm, sex }) {
  if (!leanMassKg || !heightCm) return null;
  const h = heightCm / 100;
  const raw = leanMassKg / (h * h);
  const adjusted = raw + 6.1 * (1.8 - h);
  const ceiling = sex === 'MALE' ? 25 : 21;
  return {
    value: r1(raw),
    normalised: r1(adjusted),
    ceiling,
    pctOfCeiling: r0((adjusted / ceiling) * 100),
    band:
      adjusted < (sex === 'MALE' ? 18 : 15) ? 'Below average'
      : adjusted < (sex === 'MALE' ? 20 : 17) ? 'Average'
      : adjusted < (sex === 'MALE' ? 22 : 19) ? 'Above average'
      : adjusted < ceiling ? 'Advanced'
      : 'At or beyond the natural ceiling',
  };
}

/** Rough metabolic-age indicator: the age whose average BMR matches yours. */
export function metabolicAge({ bmr, weightKg, heightCm, sex, age }) {
  if (!bmr || !weightKg || !heightCm) return null;
  // Invert Mifflin-St Jeor for age, holding the other terms fixed.
  const base = 10 * weightKg + 6.25 * heightCm + (sex === 'MALE' ? 5 : -161);
  const implied = (base - bmr) / 5;
  if (!Number.isFinite(implied)) return null;
  return { value: r0(Math.max(15, Math.min(90, implied))), delta: r0(implied - age) };
}

/**
 * The full report. Everything derived in one pass so the PDF, the UI and the
 * AI narrative all read from exactly the same numbers.
 */
export function buildBodyReport(input) {
  const {
    sex, age, heightCm,
    weightKg, bodyFatPct: bfGiven,
    neckCm, waistCm, hipCm,
    activity = 'MODERATE',
    goal = 'MAINTAIN',
    useAsianCutoffs = true,
  } = input;

  const h = heightCm / 100;
  const bmi = weightKg && heightCm ? r1(weightKg / (h * h)) : null;

  const navy = navyBodyFat({ sex, heightCm, neckCm, waistCm, hipCm });
  const deurenberg = deurenbergBodyFat({ bmi, age, sex });
  const bodyFatPct = bfGiven ?? navy ?? deurenberg;
  const bodyFatSource = bfGiven ? 'Measured / entered'
    : navy ? 'US Navy circumference method'
    : deurenberg ? 'Deurenberg estimate from BMI' : null;

  const fatMassKg  = bodyFatPct && weightKg ? r1((weightKg * bodyFatPct) / 100) : null;
  const leanMassKg = bodyFatPct && weightKg ? r1(weightKg - fatMassKg) : null;

  const bmrMif = bmrMifflin({ weightKg, heightCm, age, sex });
  const bmrKat = bmrKatch(leanMassKg);
  const bmr = bmrKat ?? bmrMif;
  const bmrMethod = bmrKat ? 'Katch-McArdle (uses lean mass)' : 'Mifflin-St Jeor';

  const factor = ACTIVITY_LEVELS.find((a) => a.key === activity)?.factor ?? 1.55;
  const tdee = bmr ? r0(bmr * factor) : null;

  const tdeeByActivity = Object.fromEntries(
    ACTIVITY_LEVELS.map((a) => [a.key, bmr ? r0(bmr * a.factor) : null]));

  const whtr  = waistCm && heightCm ? r2(waistCm / heightCm) : null;
  const whr   = waistCm && hipCm ? r2(waistCm / hipCm) : null;
  const ideal = idealWeights({ heightCm, sex });
  const ffmiData = ffmi({ leanMassKg, heightCm, sex });
  const metAge = metabolicAge({ bmr: bmrMif, weightKg, heightCm, sex, age });

  // Calorie target. Deficits and surpluses are capped at a rate that preserves
  // lean mass; floors follow common clinical minimums.
  const floor = sex === 'MALE' ? 1500 : 1200;
  const deltas = { CUT: -0.20, RECOMP: -0.08, MAINTAIN: 0, BULK: 0.12 };
  const rawTarget = tdee ? tdee * (1 + (deltas[goal] ?? 0)) : null;
  const kcalTarget = rawTarget ? Math.max(floor, r0(rawTarget)) : null;

  // Protein is set on lean mass when known — that is what it actually supports.
  const proteinTargetG = leanMassKg
    ? r0(leanMassKg * (goal === 'CUT' ? 2.4 : 2.0))
    : weightKg ? r0(weightKg * (goal === 'CUT' ? 2.0 : 1.7)) : null;

  const fatTargetG = kcalTarget ? r0((kcalTarget * 0.27) / 9) : null;
  const carbTargetG = kcalTarget && proteinTargetG && fatTargetG
    ? r0(Math.max(50, (kcalTarget - proteinTargetG * 4 - fatTargetG * 9) / 4)) : null;
  const fibreTargetG = kcalTarget ? r0((kcalTarget / 1000) * 14) : null;
  const waterMl = weightKg ? r0(weightKg * 35) : null;

  return {
    inputs: { sex, age, heightCm, weightKg, bodyFatPct: bfGiven, neckCm, waistCm, hipCm, activity, goal },

    bmi,
    bmiBand: bmiBand(bmi, useAsianCutoffs),
    bmiStandard: useAsianCutoffs ? 'WHO Asian cut-offs' : 'WHO international',

    bodyFatPct,
    bodyFatSource,
    bodyFatBand: bodyFatBand(bodyFatPct, sex),
    bodyFatNavy: navy,
    bodyFatDeurenberg: deurenberg,
    fatMassKg,
    leanMassKg,

    bmr, bmrMethod, bmrMifflin: bmrMif, bmrKatch: bmrKat,
    tdee, tdeeByActivity, activityFactor: factor,

    whtr, whtrBand: whtrBand(whtr),
    whr,
    whrBand: whr ? (sex === 'MALE'
      ? (whr < 0.90 ? 'Low risk' : whr < 1.0 ? 'Moderate risk' : 'High risk')
      : (whr < 0.80 ? 'Low risk' : whr < 0.85 ? 'Moderate risk' : 'High risk')) : null,

    ideal,
    ffmi: ffmiData,
    metabolicAge: metAge,

    goal,
    kcalTarget,
    proteinTargetG, carbTargetG, fatTargetG, fibreTargetG,
    waterMl,

    // If the hunter is cutting, how long to a healthy-BMI upper bound
    projection: (() => {
      if (!weightKg || !ideal || goal !== 'CUT' || !tdee || !kcalTarget) return null;
      const target = ideal.bmiRange[1];
      if (weightKg <= target) return null;
      const kgToLose = weightKg - target;
      const dailyDeficit = tdee - kcalTarget;
      if (dailyDeficit < 100) return null;
      const weeks = Math.ceil((kgToLose * 7700) / (dailyDeficit * 7));
      return { kgToLose: r1(kgToLose), weeks, dailyDeficit: r0(dailyDeficit) };
    })(),

    generatedAt: new Date().toISOString(),
  };
}

export const DISCLAIMER =
  'This report is generated from the measurements you entered using published ' +
  'population-level formulas (Mifflin-St Jeor, Katch-McArdle, US Navy circumference ' +
  'method, Deurenberg, WHO BMI bands). Every value is an estimate, not a measurement ' +
  'of your body, and individual variation is substantial. Circumference-based body-fat ' +
  'estimates in particular can be several percentage points off. Nothing here is a ' +
  'medical diagnosis, and it is not a substitute for advice from a qualified doctor or ' +
  'dietitian. Do not use it to self-diagnose or to justify extreme restriction. ' +
  'If you are pregnant, under 18, managing a medical condition, or have any history of ' +
  'disordered eating, speak to a healthcare professional before acting on any of it.';
