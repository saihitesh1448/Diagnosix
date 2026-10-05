/**
 * Parser smoke test.
 *
 * Bundles the real `src/utils/reportParser.ts` with esbuild and drives it the
 * way `ReportIngestion` does — the point is to prove behaviour through the
 * public interface, not to re-implement it.
 *
 *   node scripts/parser-smoke.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 'diagnosix-parser-'));
const outFile = join(outDir, 'parser.mjs');

await esbuild.build({
  entryPoints: ['src/utils/reportParser.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: outFile,
  logLevel: 'warning',
});

const parser = await import(pathToFileURL(outFile).href);
const { parseReportText, computeStatus, deriveOrganAlerts, MARKER_BY_ID } = parser;

let failures = 0;
let checks = 0;

/** Key order is meaningless here, so compare deep-normalised values. */
function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalise(value[key])]),
    );
  }
  return value;
}

function check(name, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(normalise(actual)) === JSON.stringify(normalise(expected));
  if (!ok) {
    failures += 1;
    console.log(`  ✗ ${name}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function values(readings) {
  return Object.fromEntries(
    readings.filter((r) => r.value !== null).map((r) => [r.id, r.value]),
  );
}

function statuses(readings, sex = 'other') {
  return Object.fromEntries(
    readings.filter((r) => r.value !== null).map((r) => [r.id, computeStatus(r, sex)]),
  );
}

const INDIAN_REPORT = `SRL DIAGNOSTICS PVT LTD
Patient: Self                    Sample: Serum
S.No  Test Name                 Result      Unit        Biological Ref. Interval
1     Fasting Blood Sugar       142         mg/dl       70 - 99
2     PPBS                      218         mg/dl       < 140
3     HbA1c                     7.8         %           4.0 - 5.7
4     S. Creatinine             1.6         mg/dl       0.7 - 1.3
5     Total Cholesterol         232         mg/dl       < 200
6     LDL Cholesterol (Direct)  158         mg/dl       < 100
7     HDL Cholesterol           32          mg/dl       40 - 60
8     Triglycerides (TGL)       210         mg/dl       < 150
9     Hemoglobin                10.2        g/dl        13.0 - 17.0
10    Platelet Count            1.4         lakh        1.5 - 4.5
11    TSH                       6.2         uIU/mL      0.4 - 4.0
12    S. Bilirubin              1.0         mg/dl       0.2 - 1.2
B.P. : 150/95 mmHg`;

console.log('\n[1] Indian multi-panel report');
const indian = parseReportText(INDIAN_REPORT, { sex: 'male' });
check('extracted values (canonical units)', values(indian), {
  fbs: 142,
  ppbs: 218,
  hba1c: 7.8,
  creatinine: 1.6,
  totalCholesterol: 232,
  ldl: 158,
  hdl: 32,
  triglycerides: 210,
  hemoglobin: 10.2,
  platelets: 140000, // 1.4 lakh normalised to absolute cells/mcL
  tsh: 6.2,
  bilirubin: 1,
  bpSystolic: 150,
  bpDiastolic: 95,
});
check('all 14 markers found', indian.length, 14);
check('statuses', statuses(indian, 'male'), {
  fbs: 'borderline',
  ppbs: 'borderline',
  hba1c: 'borderline',
  creatinine: 'borderline',
  totalCholesterol: 'borderline',
  ldl: 'borderline',
  hdl: 'borderline',
  triglycerides: 'borderline',
  hemoglobin: 'borderline',
  platelets: 'borderline',
  tsh: 'borderline',
  bilirubin: 'optimal',
  bpSystolic: 'borderline',
  bpDiastolic: 'borderline',
});

console.log('\n[2] International report — healthy ranges');
const INTERNATIONAL = `CITY LABS INTERNATIONAL
Fasting Glucose                    92     mg/dL     70-99
Glycated Hemoglobin (HbA1c)        5.4    %         4.0-5.6
Total Cholesterol                  180    mg/dL     <200
LDL-C (Bad Cholesterol)            96     mg/dL     <100
HDL-C (Good Cholesterol)           58     mg/dL     >40
Triglycerides                      120    mg/dL     <150
Serum Creatinine                   0.9    mg/dL     0.7-1.3
Hemoglobin                         14.1   g/dL      13.0-17.0
Platelet Count                     250,000 /mcL     150,000-450,000
TSH Ultra Sensitive                2.1    uIU/mL    0.4-4.0
Total Bilirubin                    0.6    mg/dL     0.2-1.2`;
const intl = parseReportText(INTERNATIONAL, { sex: 'male' });
check('extracted values', values(intl), {
  fbs: 92,
  hba1c: 5.4,
  totalCholesterol: 180,
  ldl: 96,
  hdl: 58,
  triglycerides: 120,
  creatinine: 0.9,
  hemoglobin: 14.1,
  platelets: 250000,
  tsh: 2.1,
  bilirubin: 0.6,
});
check('every marker optimal', statuses(intl, 'male'), {
  fbs: 'optimal',
  hba1c: 'optimal',
  totalCholesterol: 'optimal',
  ldl: 'optimal',
  hdl: 'optimal',
  triglycerides: 'optimal',
  creatinine: 'optimal',
  hemoglobin: 'optimal',
  platelets: 'optimal',
  tsh: 'optimal',
  bilirubin: 'optimal',
});

console.log('\n[3] Dual-unit conversion (mmol/L, umol/L, mIU/L)');
const SI = `Fasting Blood Sugar   7.8 mmol/L   (3.9-5.5)
Triglycerides         1.7 mmol/L
Creatinine            88  umol/L
TSH                   2.1 mIU/L`;
const si = parseReportText(SI, { sex: 'other' });
check('converted to canonical', values(si), {
  // 7.8 mmol/L x 18 = 140.4, reported the way a lab prints it (whole units >= 100).
  fbs: 140,
  // 1.7 mmol/L x 88.57 = 150.6 -> 151
  triglycerides: 151,
  // 88 umol/L x 0.0113 = 0.994 mg/dL -> 2dp
  creatinine: 0.99,
  tsh: 2.1,
});

console.log('\n[4] Critical thresholds escalate to red');
const CRITICAL = `LDL Cholesterol 186 mg/dL
HbA1c 9.2 %
Fasting Blood Sugar 268 mg/dL
S. Creatinine 2.6 mg/dL
Platelet Count 38000 /mcL
Blood Pressure 190/125 mmHg`;
const critical = parseReportText(CRITICAL, { sex: 'male' });
check('critical statuses', statuses(critical, 'male'), {
  ldl: 'critical',
  hba1c: 'critical',
  fbs: 'critical',
  creatinine: 'critical',
  platelets: 'critical',
  bpSystolic: 'critical',
  bpDiastolic: 'critical',
});
const criticalAlerts = deriveOrganAlerts(critical, [], 'male');
check('heart node flagged from LDL', criticalAlerts.some((a) => a.organ === 'heart' && a.severity === 'critical'), true);
check('kidney node flagged from creatinine', criticalAlerts.some((a) => a.organ === 'kidneys' && a.severity === 'critical'), true);

console.log('\n[5] Zero-hallucination: unreadable text yields NO invented values');
const GARBAGE = `Fasting Blood Sugar
HbA1c
Total Cholesterol
~~ unreadable smudge ~~`;
const garbage = parseReportText(GARBAGE, { sex: 'male' });
check('no numeric values fabricated', garbage.filter((r) => r.value !== null).length, 0);
check('markers surfaced as unverified instead', garbage.map((r) => [r.id, r.confidence]), [
  ['fbs', 'unverified'],
  ['hba1c', 'unverified'],
  ['totalCholesterol', 'unverified'],
]);
check('empty-ish OCR noise produces nothing', parseReportText('~ ~ ~ ### 12 34', {}).length, 0);

console.log('\n[6] Implausible OCR digits are rejected, not trusted');
const TYPO = `Fasting Blood Sugar 14200 mg/dL
Hemoglobin 999 g/dL`;
const typo = parseReportText(TYPO, { sex: 'male' });
check('rejected as unverified', typo.filter((r) => r.value !== null).length, 0);

console.log('\n[7] Symptom -> organ mapping');
check('chest pain flags the heart', deriveOrganAlerts([], ['chest'], 'male'), [
  { organ: 'heart', severity: 'critical', reason: 'Reported chest discomfort / palpitations' },
]);
check('polyuria/thirst flags pancreas', deriveOrganAlerts([], ['thirst'], 'male')[0].organ, 'pancreas');
check('swollen legs flags legs', deriveOrganAlerts([], ['swelling'], 'male')[0].organ, 'legs');

console.log('\n[8] Sex-specific reference ranges');
check(
  'female HDL uses the 50 floor',
  MARKER_BY_ID.hdl.rangeBySex.female.low,
  50,
);
const hdl45 = parseReportText('HDL Cholesterol 45 mg/dL', { sex: 'female' });
check('45 mg/dL is borderline for a woman', computeStatus(hdl45[0], 'female'), 'borderline');
check('45 mg/dL is optimal for a man', computeStatus(hdl45[0], 'male'), 'optimal');

console.log(`\n${checks - failures}/${checks} checks passed`);
rmSync(outDir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
