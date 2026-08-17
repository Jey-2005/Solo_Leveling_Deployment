/**
 * Body report PDF.
 *
 * Hand-drawn vector output rather than a canvas screenshot: text stays
 * selectable, the file is ~40 KB instead of ~2 MB, and it prints cleanly.
 * jsPDF is loaded on demand so it never touches the initial bundle.
 */

const C = {
  void: [5, 6, 11],
  panel: [10, 14, 26],
  line: [30, 39, 57],
  mana: [62, 198, 255],
  monarch: [167, 139, 250],
  gold: [245, 197, 66],
  danger: [255, 59, 92],
  jade: [52, 211, 153],
  bone: [233, 239, 248],
  ash: [147, 161, 184],
  dim: [92, 104, 128],
};

const PAGE = { w: 210, h: 297, m: 16 };

export async function downloadBodyReport(report, hunter, aiBlock) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

  let y = 0;
  const inner = PAGE.w - PAGE.m * 2;

  const setFill = (c) => doc.setFillColor(...c);
  const setText = (c) => doc.setTextColor(...c);
  const setDraw = (c) => doc.setDrawColor(...c);

  const paintBackground = () => {
    setFill(C.void);
    doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
  };

  const newPage = () => { doc.addPage(); paintBackground(); y = PAGE.m; };
  const ensure = (needed) => { if (y + needed > PAGE.h - 18) newPage(); };

  /* ---- corner brackets, the same registration marks as the app ---- */
  const brackets = (x, yy, w, h, col = C.mana) => {
    setDraw(col); doc.setLineWidth(0.5);
    const s = 3.2;
    doc.line(x, yy, x + s, yy);           doc.line(x, yy, x, yy + s);
    doc.line(x + w - s, yy, x + w, yy);   doc.line(x + w, yy, x + w, yy + s);
    doc.line(x, yy + h - s, x, yy + h);   doc.line(x, yy + h, x + s, yy + h);
    doc.line(x + w - s, yy + h, x + w, yy + h); doc.line(x + w, yy + h - s, x + w, yy + h);
  };

  const eyebrow = (text, col = C.mana) => {
    setText(col);
    doc.setFont('courier', 'normal').setFontSize(7);
    doc.text(text.toUpperCase().split('').join(' '), PAGE.m, y);
    y += 5;
  };

  const heading = (text) => {
    ensure(14);
    setText(C.bone);
    doc.setFont('helvetica', 'bold').setFontSize(13);
    doc.text(text, PAGE.m, y);
    y += 2.5;
    setDraw(C.line); doc.setLineWidth(0.3);
    doc.line(PAGE.m, y, PAGE.w - PAGE.m, y);
    y += 6;
  };

  const body = (text, col = C.ash, size = 9) => {
    setText(col);
    doc.setFont('helvetica', 'normal').setFontSize(size);
    const lines = doc.splitTextToSize(text, inner);
    for (const ln of lines) { ensure(5); doc.text(ln, PAGE.m, y); y += size * 0.48 + 1.2; }
  };

  /** A row of stat tiles. `cols` per row, auto-wrapping. */
  const tiles = (items, cols = 3) => {
    const gap = 3;
    const w = (inner - gap * (cols - 1)) / cols;
    const h = 19;
    for (let i = 0; i < items.length; i += cols) {
      ensure(h + 4);
      const row = items.slice(i, i + cols);
      row.forEach((it, j) => {
        const x = PAGE.m + j * (w + gap);
        setFill(C.panel); doc.rect(x, y, w, h, 'F');
        setDraw(C.line); doc.setLineWidth(0.25); doc.rect(x, y, w, h, 'S');
        if (it.accent) {
          setFill(it.accent); doc.rect(x, y, 1.1, h, 'F');
        }
        setText(C.dim);
        doc.setFont('courier', 'normal').setFontSize(6);
        doc.text(String(it.label).toUpperCase(), x + 4, y + 5.5);
        setText(it.accent || C.bone);
        doc.setFont('helvetica', 'bold').setFontSize(14);
        doc.text(it.value == null ? '—' : String(it.value), x + 4, y + 12.5);
        if (it.unit) {
          setText(C.dim); doc.setFont('helvetica', 'normal').setFontSize(7);
          doc.text(it.unit, x + 4 + doc.getTextWidth(String(it.value ?? '—')) * 1.42 + 1.5, y + 12.5);
        }
        if (it.note) {
          setText(C.ash); doc.setFont('helvetica', 'normal').setFontSize(6.5);
          doc.text(doc.splitTextToSize(String(it.note), w - 8)[0], x + 4, y + 16.5);
        }
      });
      y += h + gap;
    }
    y += 2;
  };

  /** Two-column key/value list. */
  const kv = (pairs) => {
    pairs.forEach(([k, v]) => {
      ensure(6);
      setText(C.dim); doc.setFont('helvetica', 'normal').setFontSize(8.5);
      doc.text(String(k), PAGE.m + 1, y);
      setText(C.bone); doc.setFont('helvetica', 'bold').setFontSize(8.5);
      doc.text(String(v ?? '—'), PAGE.w - PAGE.m - 1, y, { align: 'right' });
      y += 2;
      setDraw(C.line); doc.setLineWidth(0.15);
      doc.line(PAGE.m, y, PAGE.w - PAGE.m, y);
      y += 3.8;
    });
    y += 2;
  };

  /* ================= PAGE 1 ================= */
  paintBackground();

  // Header band
  setFill(C.panel); doc.rect(0, 0, PAGE.w, 42, 'F');
  setFill(C.mana);  doc.rect(0, 0, PAGE.w, 0.8, 'F');
  brackets(PAGE.m - 4, 6, PAGE.w - (PAGE.m - 4) * 2, 30);

  y = 14;
  setText(C.mana);
  doc.setFont('courier', 'normal').setFontSize(7);
  doc.text('S Y S T E M   ·   B O D Y   A N A L Y S I S', PAGE.m, y);

  y += 9;
  setText(C.bone);
  doc.setFont('helvetica', 'bold').setFontSize(21);
  doc.text('Status Report', PAGE.m, y);

  y += 7;
  setText(C.dim);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  const when = new Date(report.generatedAt || Date.now());
  doc.text(
    `${hunter?.display_name || 'Hunter'}  ·  Level ${hunter?.level ?? '—'}  ·  ${hunter?.rank ?? 'E'}-Rank  ·  ` +
    `${when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    PAGE.m, y);

  y = 52;

  /* --- Inputs --- */
  eyebrow('Measurements provided');
  const i = report.inputs || {};
  kv([
    ['Sex', i.sex === 'MALE' ? 'Male' : i.sex === 'FEMALE' ? 'Female' : '—'],
    ['Age', i.age ? `${i.age} years` : '—'],
    ['Height', i.heightCm ? `${i.heightCm} cm` : '—'],
    ['Weight', i.weightKg ? `${i.weightKg} kg` : '—'],
    ['Neck', i.neckCm ? `${i.neckCm} cm` : 'not measured'],
    ['Waist', i.waistCm ? `${i.waistCm} cm` : 'not measured'],
    ['Hip', i.hipCm ? `${i.hipCm} cm` : 'not measured'],
    ['Activity level', i.activity || '—'],
    ['Stated goal', i.goal || '—'],
  ]);

  /* --- Headline --- */
  heading('Composition');
  tiles([
    { label: 'BMI', value: report.bmi, note: report.bmiBand, accent: C.mana },
    { label: 'Body fat', value: report.bodyFatPct, unit: '%', note: report.bodyFatBand, accent: C.monarch },
    { label: 'Lean mass', value: report.leanMassKg, unit: 'kg', accent: C.jade },
    { label: 'Fat mass', value: report.fatMassKg, unit: 'kg' },
    { label: 'Waist / height', value: report.whtr, note: report.whtrBand,
      accent: report.whtrBand === 'Healthy' ? C.jade : C.gold },
    { label: 'Waist / hip', value: report.whr, note: report.whrBand || 'hip not measured' },
  ]);
  if (report.bodyFatSource) {
    body(`Body fat derived via: ${report.bodyFatSource}. BMI classified against ${report.bmiStandard}.`, C.dim, 7.5);
  }

  /* --- Energy --- */
  heading('Energy');
  tiles([
    { label: 'BMR', value: report.bmr, unit: 'kcal', note: report.bmrMethod, accent: C.gold },
    { label: 'TDEE', value: report.tdee, unit: 'kcal', note: `×${report.activityFactor} activity`, accent: C.gold },
    { label: 'Target', value: report.kcalTarget, unit: 'kcal', note: report.goal, accent: C.mana },
  ], 3);

  const t = report.tdeeByActivity || {};
  kv([
    ['Sedentary · desk work', t.SEDENTARY ? `${t.SEDENTARY} kcal` : '—'],
    ['Lightly active · 1–3 sessions/week', t.LIGHT ? `${t.LIGHT} kcal` : '—'],
    ['Moderately active · 3–5 sessions/week', t.MODERATE ? `${t.MODERATE} kcal` : '—'],
    ['Very active · 6–7 sessions/week', t.ACTIVE ? `${t.ACTIVE} kcal` : '—'],
    ['Athlete · twice daily', t.ATHLETE ? `${t.ATHLETE} kcal` : '—'],
  ]);

  /* ================= PAGE 2 ================= */
  newPage();

  heading('Daily targets');
  tiles([
    { label: 'Calories', value: report.kcalTarget, unit: 'kcal', accent: C.mana },
    { label: 'Protein',  value: report.proteinTargetG, unit: 'g', accent: C.danger },
    { label: 'Carbs',    value: report.carbTargetG, unit: 'g', accent: C.gold },
    { label: 'Fat',      value: report.fatTargetG, unit: 'g', accent: C.monarch },
    { label: 'Fibre',    value: report.fibreTargetG, unit: 'g', accent: C.jade },
    { label: 'Water',    value: report.waterMl ? (report.waterMl / 1000).toFixed(1) : null, unit: 'L', accent: C.mana },
  ]);

  heading('Muscular potential');
  if (report.ffmi) {
    tiles([
      { label: 'FFMI', value: report.ffmi.value, accent: C.monarch },
      { label: 'Normalised', value: report.ffmi.normalised, note: report.ffmi.band, accent: C.monarch },
      { label: 'Of ceiling', value: report.ffmi.pctOfCeiling, unit: '%',
        note: `ceiling ≈ ${report.ffmi.ceiling}`, accent: C.gold },
    ], 3);
    body(
      'Fat-free mass index normalised to 1.80 m. An FFMI around ' + report.ffmi.ceiling +
      ' is widely treated as the practical natural ceiling. It is a reference point, not a limit on your training.',
      C.dim, 7.5);
  } else {
    body('Not available — body fat could not be estimated from the measurements given.', C.dim, 8);
  }

  heading('Reference weights');
  const id = report.ideal || {};
  kv([
    ['Healthy BMI range', id.bmiRange ? `${id.bmiRange[0]} – ${id.bmiRange[1]} kg` : '—'],
    ['Devine formula', id.devine ? `${id.devine} kg` : '—'],
    ['Robinson formula', id.robinson ? `${id.robinson} kg` : '—'],
    ['Miller formula', id.miller ? `${id.miller} kg` : '—'],
    ['Hamwi formula', id.hamwi ? `${id.hamwi} kg` : '—'],
    ['Metabolic age estimate', report.metabolicAge
      ? `${report.metabolicAge.value} years (${report.metabolicAge.delta > 0 ? '+' : ''}${report.metabolicAge.delta} vs actual)`
      : '—'],
  ]);

  if (report.projection) {
    heading('Projection');
    body(
      `At a ${report.projection.dailyDeficit} kcal daily deficit, reaching the top of the healthy ` +
      `BMI range means losing ${report.projection.kgToLose} kg — roughly ${report.projection.weeks} weeks ` +
      `of consistent adherence. Real progress is rarely linear.`,
      C.ash, 9);
  }

  /* --- AI reading --- */
  if (aiBlock?.summary) {
    ensure(40);
    heading("The System's reading");
    setFill(C.panel);
    const boxTop = y - 3;
    const est = 8 + Math.ceil(aiBlock.summary.length / 95) * 4.6 +
      (aiBlock.actions?.length || 0) * 5.4 + 10;
    doc.rect(PAGE.m, boxTop, inner, Math.min(est, PAGE.h - boxTop - 24), 'F');
    setDraw(C.mana); doc.setLineWidth(0.3);
    doc.rect(PAGE.m, boxTop, inner, Math.min(est, PAGE.h - boxTop - 24), 'S');
    y += 3;

    const pad = 4;
    const save = PAGE.m;
    setText(C.bone); doc.setFont('helvetica', 'normal').setFontSize(9);
    doc.splitTextToSize(aiBlock.summary, inner - pad * 2).forEach((ln) => {
      ensure(5); doc.text(ln, save + pad, y); y += 4.6;
    });

    if (aiBlock.actions?.length) {
      y += 3;
      setText(C.mana); doc.setFont('courier', 'normal').setFontSize(6.5);
      doc.text('D I R E C T I V E S', save + pad, y); y += 5;
      aiBlock.actions.forEach((a, n) => {
        ensure(6);
        setText(C.mana); doc.setFont('helvetica', 'bold').setFontSize(8);
        doc.text(`${n + 1}`, save + pad, y);
        setText(C.ash); doc.setFont('helvetica', 'normal').setFontSize(8.5);
        doc.splitTextToSize(a, inner - pad * 2 - 6).forEach((ln, k) => {
          if (k) ensure(5);
          doc.text(ln, save + pad + 6, y); y += 4.3;
        });
        y += 1;
      });
    }
    y += 4;
  }

  /* --- Disclaimer --- */
  const { DISCLAIMER } = await import('./formulas.js');
  ensure(46);
  y += 4;
  setFill([18, 8, 12]); doc.rect(PAGE.m, y - 3, inner, 42, 'F');
  setDraw(C.danger); doc.setLineWidth(0.4);
  doc.line(PAGE.m, y - 3, PAGE.m, y + 39);
  setText(C.danger);
  doc.setFont('courier', 'normal').setFontSize(6.5);
  doc.text('I M P O R T A N T', PAGE.m + 4, y + 2);
  y += 6;
  setText(C.ash); doc.setFont('helvetica', 'normal').setFontSize(6.8);
  doc.splitTextToSize(DISCLAIMER, inner - 9).forEach((ln) => {
    doc.text(ln, PAGE.m + 4, y); y += 3.1;
  });

  /* --- Footer on every page --- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    setDraw(C.line); doc.setLineWidth(0.2);
    doc.line(PAGE.m, PAGE.h - 12, PAGE.w - PAGE.m, PAGE.h - 12);
    setText(C.dim); doc.setFont('courier', 'normal').setFontSize(6.5);
    doc.text('THE SYSTEM · BODY ANALYSIS', PAGE.m, PAGE.h - 8);
    doc.text(`${p} / ${pages}`, PAGE.w - PAGE.m, PAGE.h - 8, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const who = (hunter?.display_name || 'hunter').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`body-report-${who}-${stamp}.pdf`);
}
