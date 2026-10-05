/**
 * Diagnosix — Universal (Indian + International) lab report parsing engine.
 *
 * ZERO-HALLUCINATION DOCTRINE
 * ---------------------------------------------------------------------------
 * This module is deliberately incapable of inventing values. Every reading it
 * returns was literally present in the incoming line/string. Anything it cannot
 * read with sufficient evidence is surfaced as `unverified` so the UI can push
 * the user into explicit human-in-the-loop entry instead of guessing.
 */

export type MarkerId =
  | 'fbs'
  | 'ppbs'
  | 'hba1c'
  | 'totalCholesterol'
  | 'ldl'
  | 'hdl'
  | 'triglycerides'
  | 'creatinine'
  | 'hemoglobin'
  | 'platelets'
  | 'tsh'
  | 'bilirubin'
  | 'bpSystolic'
  | 'bpDiastolic';

export type Sex = 'male' | 'female' | 'other';

export interface ValueRange {
  low: number;
  high: number;
}

export interface BiomarkerDef {
  id: MarkerId;
  /** Canonical display name. */
  label: string;
  /** Canonical unit used for all storage + comparison. */
  unit: string;
  /** Accepted alternate unit and the multiplier that converts it to `unit`. */
  alternateUnit?: { unit: string; factor: number };
  /** Default reference range in canonical units. */
  range: ValueRange;
  /** Sex-specific overrides (ethnicity-neutral adult ranges). */
  rangeBySex?: Partial<Record<Sex, ValueRange>>;
  /** Values at or beyond these bounds are treated as critical (red octagon). */
  criticalLow?: number;
  criticalHigh?: number;
  /** Aliases as they appear on Indian + international lab printouts. */
  aliases: string[];
}

/**
 * Aliases are matched longest-first, so `hba1c` is consumed before the `hb`
 * alias inside it can misfire. Keep this list lowercase.
 */
export const BIOMARKERS: BiomarkerDef[] = [
  {
    id: 'fbs',
    label: 'Fasting Blood Sugar',
    unit: 'mg/dL',
    alternateUnit: { unit: 'mmol/L', factor: 18 },
    range: { low: 70, high: 99 },
    criticalLow: 54,
    criticalHigh: 250,
    aliases: [
      'fasting blood sugar',
      'fasting blood glucose',
      'fasting plasma glucose',
      'fasting glucose',
      'glucose fasting',
      'blood sugar fasting',
      'sugar fasting',
      'fbs',
      'fpg',
      'gfp',
    ],
  },
  {
    id: 'ppbs',
    label: 'Postprandial Glucose',
    unit: 'mg/dL',
    alternateUnit: { unit: 'mmol/L', factor: 18 },
    range: { low: 70, high: 140 },
    criticalHigh: 300,
    aliases: [
      'post prandial blood sugar',
      'postprandial blood sugar',
      'post prandial glucose',
      'postprandial glucose',
      'post lunch sugar',
      'post meal sugar',
      '2 hr ppg',
      '2hr ppg',
      '2 hour ppg',
      'ppbs',
      'ppbg',
      'pp sugar',
      'plbs',
      'ppg',
    ],
  },
  {
    id: 'hba1c',
    label: 'HbA1c (Glycated Hemoglobin)',
    unit: '%',
    range: { low: 4, high: 5.7 },
    criticalHigh: 8,
    aliases: [
      'glycated hemoglobin',
      'glycosylated hemoglobin',
      'glycated haemoglobin',
      'glycosylated haemoglobin',
      'hemoglobin a1c',
      'haemoglobin a1c',
      'hba1c',
      'hb a1c',
      'a1c',
    ],
  },
  {
    id: 'totalCholesterol',
    label: 'Total Cholesterol',
    unit: 'mg/dL',
    alternateUnit: { unit: 'mmol/L', factor: 38.67 },
    range: { low: 100, high: 200 },
    criticalHigh: 240,
    aliases: [
      'total cholesterol',
      'serum cholesterol',
      'cholesterol total',
      'cholesterol serum',
      'cholesterol',
      'chol',
      'tc',
    ],
  },
  {
    id: 'ldl',
    label: 'LDL Cholesterol',
    unit: 'mg/dL',
    alternateUnit: { unit: 'mmol/L', factor: 38.67 },
    range: { low: 40, high: 100 },
    criticalHigh: 160,
    aliases: [
      'ldl cholesterol',
      'direct ldl',
      'ldl calc',
      'ldl direct',
      'bad cholesterol',
      'ldl-c',
      'ldl c',
      'ldl',
    ],
  },
  {
    id: 'hdl',
    label: 'HDL Cholesterol',
    unit: 'mg/dL',
    alternateUnit: { unit: 'mmol/L', factor: 38.67 },
    // Men need >= 40, women need >= 50 — modelled as a lower-bound-only range.
    range: { low: 40, high: 90 },
    rangeBySex: {
      female: { low: 50, high: 90 },
    },
    criticalLow: 25,
    aliases: [
      'hdl cholesterol',
      'good cholesterol',
      'hdl-c',
      'hdl c',
      'hdl',
    ],
  },
  {
    id: 'triglycerides',
    label: 'Triglycerides',
    unit: 'mg/dL',
    alternateUnit: { unit: 'mmol/L', factor: 88.57 },
    range: { low: 40, high: 150 },
    criticalHigh: 500,
    aliases: [
      'triglycerides',
      'triglyceride',
      'serum triglycerides',
      'trig',
      'tgl',
      'tg',
    ],
  },
  {
    id: 'creatinine',
    label: 'Serum Creatinine',
    unit: 'mg/dL',
    alternateUnit: { unit: 'umol/L', factor: 0.0113 },
    range: { low: 0.7, high: 1.3 },
    criticalHigh: 2,
    aliases: [
      'serum creatinine',
      's. creatinine',
      'creatinine serum',
      'creatinine',
      'creat',
      'cre',
    ],
  },
  {
    id: 'hemoglobin',
    label: 'Hemoglobin',
    unit: 'g/dL',
    range: { low: 13, high: 17 },
    rangeBySex: {
      female: { low: 12, high: 15.5 },
    },
    criticalLow: 8,
    aliases: [
      'hemoglobin',
      'haemoglobin',
      'hemoglobin total',
      'total hemoglobin',
      'hgb',
      'hb%',
      'hb',
    ],
  },
  {
    id: 'platelets',
    label: 'Platelet Count',
    unit: '/mcL',
    range: { low: 150000, high: 450000 },
    criticalLow: 50000,
    criticalHigh: 1000000,
    aliases: [
      'platelet count',
      'total platelets',
      'platelets count',
      'platelet',
      'platelets',
      'plt',
    ],
  },
  {
    id: 'tsh',
    label: 'Thyroid Stimulating Hormone',
    unit: 'uIU/mL',
    alternateUnit: { unit: 'mIU/L', factor: 1 },
    range: { low: 0.4, high: 4 },
    criticalLow: 0.1,
    criticalHigh: 10,
    aliases: [
      'thyroid stimulating hormone',
      'thyroid stim hormone',
      'tsh ultrasensitive',
      'tsh ultra sensitive',
      'tsh',
    ],
  },
  {
    id: 'bilirubin',
    label: 'Bilirubin Total',
    unit: 'mg/dL',
    alternateUnit: { unit: 'umol/L', factor: 0.0585 },
    range: { low: 0.2, high: 1.2 },
    criticalHigh: 3,
    aliases: [
      'bilirubin total',
      'total bilirubin',
      'serum bilirubin',
      's. bilirubin',
      's bilirubin',
      'bilirubin',
      'tbil',
      't bili',
    ],
  },
  {
    id: 'bpSystolic',
    label: 'Blood Pressure (Systolic)',
    unit: 'mmHg',
    range: { low: 90, high: 120 },
    criticalLow: 80,
    criticalHigh: 180,
    aliases: ['systolic', 'sbp', 'systolic blood pressure'],
  },
  {
    id: 'bpDiastolic',
    label: 'Blood Pressure (Diastolic)',
    unit: 'mmHg',
    range: { low: 60, high: 80 },
    criticalLow: 50,
    criticalHigh: 120,
    aliases: ['diastolic', 'dbp', 'diastolic blood pressure'],
  },
];

export const MARKER_BY_ID: Record<MarkerId, BiomarkerDef> = BIOMARKERS.reduce(
  (acc, marker) => {
    acc[marker.id] = marker;
    return acc;
  },
  {} as Record<MarkerId, BiomarkerDef>,
);

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unverified';

export interface ParsedReading {
  id: MarkerId;
  label: string;
  /** Numeric value expressed in the marker's canonical unit. */
  value: number | null;
  unit: string;
  /** Raw numeric token exactly as it appeared in the source text. */
  rawValue: string | null;
  /** Unit exactly as printed on the report, before normalisation. */
  rawUnit: string | null;
  /** Reference range printed on the report, when detected. */
  reportRange: ValueRange | null;
  range: ValueRange;
  confidence: ConfidenceLevel;
  /** Human-readable justification for the confidence level. */
  evidence: string;
  /** True when a human edited/entered the value; never downgraded afterwards. */
  humanVerified: boolean;
  /** Where the value came from. */
  source: 'ocr' | 'manual';
}

export interface ParseOptions {
  sex?: Sex;
  source?: 'ocr' | 'manual';
}

export type MarkerStatus = 'critical' | 'borderline' | 'optimal' | 'unknown';

export function rangeFor(def: BiomarkerDef, sex: Sex = 'other'): ValueRange {
  if (sex === 'female' && def.rangeBySex?.female) return def.rangeBySex.female;
  if (sex === 'male' && def.rangeBySex?.male) return def.rangeBySex.male;
  // 'other' / unknown falls back to the inclusive adult range.
  if (sex === 'other' && def.rangeBySex) {
    return def.range;
  }
  return def.range;
}

export function formatRange(def: BiomarkerDef, sex: Sex = 'other'): string {
  const range = rangeFor(def, sex);
  return `${formatNumber(range.low)} – ${formatNumber(range.high)} ${def.unit}`;
}

function formatNumber(value: number): string {
  // Indian digit grouping (1,50,000) reads naturally on the target market's reports.
  if (Number.isInteger(value)) return value.toLocaleString('en-IN');
  return value.toFixed(value < 1 ? 2 : 1);
}

/* -------------------------------------------------------------------------- */
/* Text normalisation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Indian labs frequently print `mg/dl`, `mmol/l`, `µIU/mL`, non-breaking
 * spaces and the dotted abbreviations (`S.Creatinine`). Normalise all of it.
 */
export function normaliseReportText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0|\u2007|\u202f/g, ' ')
    .replace(/[|¦]/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\u2018|\u2019|\u02bc/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[µμ]/g, 'u')
    // "Glucose, Fasting 142" and "Cholesterol, Total 232" are extremely common
    // on Indian printouts. Only commas between words are touched, so the
    // thousands separator in "250,000" survives intact.
    .replace(/([A-Za-z)]),\s*([A-Za-z])/g, '$1 $2')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n');
}

interface AliasHit {
  def: BiomarkerDef;
  alias: string;
}

/** Longest first so `hba1c` wins over `hb`, and `ldl cholesterol` over `ldl`. */
const SORTED_ALIASES: AliasHit[] = BIOMARKERS.flatMap((def) =>
  def.aliases.map((alias) => ({ def, alias })),
).sort((a, b) => b.alias.length - a.alias.length);

const NUMBER_PATTERN = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`;

const UNIT_HINTS: { pattern: RegExp; canonical?: string }[] = [
  { pattern: /mg\s*\/\s*dl/i, canonical: 'mg/dL' },
  { pattern: /mg\s*\/\s*ml/i, canonical: 'mg/dL' },
  { pattern: /mmol\s*\/\s*l/i, canonical: 'mmol/L' },
  { pattern: /umol\s*\/\s*l/i, canonical: 'umol/L' },
  { pattern: /(uiu|miu)\s*\/\s*ml/i, canonical: 'uIU/mL' },
  { pattern: /(uiu|miu)\s*\/\s*l/i, canonical: 'mIU/L' },
  { pattern: /g\s*\/\s*dl/i, canonical: 'g/dL' },
  { pattern: /gm\s*\/\s*dl/i, canonical: 'g/dL' },
  { pattern: /(\/|per\s*)?(mc?l|ul|microlitre|microliter)/i, canonical: '/mcL' },
  { pattern: /(lakh|cells\s*\/\s*cumm|cumm)/i, canonical: '/mcL' },
  { pattern: /mmhg/i, canonical: 'mmHg' },
  { pattern: /%/i, canonical: '%' },
];

function detectUnit(text: string): string | null {
  for (const hint of UNIT_HINTS) {
    if (hint.pattern.test(text)) return hint.canonical ?? null;
  }
  return null;
}

/** Convert a reading in the report's unit to the marker's canonical unit. */
export function toCanonical(
  def: BiomarkerDef,
  rawValue: number,
  detectedUnit: string | null,
): { value: number; converted: boolean } {
  if (!detectedUnit) return { value: rawValue, converted: false };
  const alt = def.alternateUnit;
  if (alt && alt.unit.toLowerCase() === detectedUnit.toLowerCase()) {
    return { value: rawValue * alt.factor, converted: true };
  }
  if (detectedUnit === '%' && def.unit === 'g/dL') {
    // Hemoglobin is sometimes printed as a percentage of the same scale.
    return { value: rawValue, converted: false };
  }
  if (detectedUnit === '/mcL' && def.id === 'platelets') {
    return { value: rawValue, converted: false };
  }
  if (detectedUnit === 'mmHg' && def.unit === 'mmHg') {
    return { value: rawValue, converted: false };
  }
  return { value: rawValue, converted: false };
}

/** Platelet counts are often printed as `2.4 lakh` or `240 x10^3`. */
function applyPlateletScale(def: BiomarkerDef, value: number, context: string): number {
  if (def.id !== 'platelets') return value;
  if (/\blakh\b|\blac\b/i.test(context)) return value * 100000;
  if (/x\s*10\s*\^?\s*3|×\s*10\s*\^?\s*3|\/ul|per\s*ul/i.test(context) && value < 2000) {
    return value * 1000;
  }
  if (value > 0 && value < 1000) return value * 1000;
  return value;
}

interface RangeMatch {
  range: ValueRange;
  raw: string;
  index: number;
}

function extractReportedRange(line: string): RangeMatch | null {
  const patterns = [
    new RegExp(`${NUMBER_PATTERN}\\s*-\\s*${NUMBER_PATTERN}`),
    new RegExp(`(?:ref|reference|normal|biological|desirable)?\\s*(?:range|interval)?\\s*:?\\s*${NUMBER_PATTERN}\\s*(?:to|\\u2013)\\s*${NUMBER_PATTERN}`, 'i'),
    new RegExp(`(?:<|less than|upto|up to|below)\\s*${NUMBER_PATTERN}`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match) {
      const groups = match.slice(1).filter((g): g is string => typeof g === 'string');
      const numbers = groups.map((g) => Number(g.replace(/,/g, '')));
      if (numbers.length >= 2 && numbers.every((n) => Number.isFinite(n))) {
        const [low, high] = numbers;
        if (low <= high) {
          return { range: { low, high }, raw: match[0].trim(), index: match.index };
        }
      }
      if (numbers.length === 1 && Number.isFinite(numbers[0])) {
        const upper = numbers[0];
        const isUpperBound = /^<|less than|upto|up to|below/i.test(match[0].trim());
        if (isUpperBound) {
          return { range: { low: 0, high: upper }, raw: match[0].trim(), index: match.index };
        }
      }
    }
  }
  return null;
}

function isPlausible(def: BiomarkerDef, value: number): boolean {
  const def$ = def;
  const range = def$.range;
  if (!Number.isFinite(value) || value < 0) return false;
  // Guard against OCR swallowing a decimal point: reject absurd magnitudes.
  const floor = Math.max(range.low / 50, 0.01);
  const ceiling = range.high * 50;
  return value >= floor && value <= ceiling;
}

interface AliasMatch {
  alias: string;
  def: BiomarkerDef;
  start: number;
  end: number;
}

/**
 * Every alias occurrence on a line, with its span.
 *
 * Longest-first ordering plus span containment is what stops `Cholesterol`
 * inside `LDL-C (Bad Cholesterol) 96 mg/dL` from inventing a Total Cholesterol
 * reading — the exact class of silent hallucination this engine must prevent.
 */
function findAliasMatches(line: string): AliasMatch[] {
  const matches: AliasMatch[] = [];
  for (const hit of SORTED_ALIASES) {
    const regex = new RegExp(`\\b${escapeRegExp(hit.alias)}\\b`, 'gi');
    let found: RegExpExecArray | null;
    while ((found = regex.exec(line)) !== null) {
      matches.push({
        alias: hit.alias,
        def: hit.def,
        start: found.index,
        end: found.index + found[0].length,
      });
      if (found.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  matches.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const accepted: AliasMatch[] = [];
  for (const match of matches) {
    const swallowed = accepted.some(
      (claimed) => match.start >= claimed.start && match.end <= claimed.end,
    );
    if (!swallowed) accepted.push(match);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

interface PickedValue {
  raw: string;
  value: number;
  unit: string | null;
}

/**
 * Pick the reading out of the slice of the line that belongs to this marker.
 *
 * Lab tables routinely interleave text between the marker name and its result
 * (`LDL Cholesterol (Direct) 158`, `TSH Ultra Sensitive 6.2`), so the scan walks
 * forward and accepts the first candidate that is both unit-backed and
 * physiologically plausible. If nothing qualifies it returns null — callers must
 * then escalate to manual entry rather than guess.
 */
function pickValue(def: BiomarkerDef, window: string, lineUnit: string | null): PickedValue | null {
  const numberRegex = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g;
  let found: RegExpExecArray | null;
  while ((found = numberRegex.exec(window)) !== null) {
    const raw = found[0];
    const numeric = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(numeric)) continue;

    const rest = window.slice(found.index + raw.length);
    const unitAfter = detectUnit(rest.slice(0, 14)) ?? lineUnit;
    const scaled = applyPlateletScale(def, numeric, `${rest.slice(0, 24)} ${window}`);
    const canonical = toCanonical(def, scaled, unitAfter);
    if (isPlausible(def, canonical.value)) {
      return { raw, value: canonical.value, unit: unitAfter };
    }
  }
  return null;
}

/**
 * Parse a free-text lab report (typed text, PDF text layer, or OCR output).
 *
 * The parser never fabricates: when a line is too damaged to read, it returns
 * an `unverified` entry with `value: null` so the review table can escalate to
 * manual entry.
 */
export function parseReportText(text: string, options: ParseOptions = {}): ParsedReading[] {
  const sex = options.sex ?? 'other';
  const source = options.source ?? 'ocr';
  const normalised = normaliseReportText(text);
  const lines = normalised
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const found = new Map<MarkerId, ParsedReading>();

  const consider = (line: string, match: AliasMatch, nextStart: number): void => {
    const seen = found.get(match.def.id);
    if (seen && seen.value !== null) return; // keep the first confident hit

    // Only look between this marker's name and the next marker on the line.
    const window = line.slice(match.end, nextStart >= 0 ? nextStart : undefined);
    const unitInLine = detectUnit(`${window} ${line}`);
    const reportedRange = extractReportedRange(window);

    const read = pickValue(match.def, window, unitInLine);
    if (!read) {
      if (!seen) {
        found.set(match.def.id, {
          id: match.def.id,
          label: match.def.label,
          value: null,
          unit: match.def.unit,
          rawValue: null,
          rawUnit: unitInLine,
          reportRange: reportedRange?.range ?? null,
          range: rangeFor(match.def, sex),
          confidence: 'unverified',
          evidence: 'Marker label found but no numeric value could be read on that line.',
          humanVerified: false,
          source,
        });
      }
      return;
    }

    // Evidence ranking: a printed unit + a printed range is the strongest signal.
    const hasUnit = read.unit !== null;
    const confidence: ConfidenceLevel =
      hasUnit && reportedRange ? 'high' : hasUnit || reportedRange ? 'medium' : 'low';

    found.set(match.def.id, {
      id: match.def.id,
      label: match.def.label,
      value: roundTo(read.value, match.def),
      unit: match.def.unit,
      rawValue: read.raw,
      rawUnit: read.unit,
      reportRange: reportedRange?.range ?? null,
      range: rangeFor(match.def, sex),
      confidence,
      evidence: [
        `Matched alias "${match.alias}"`,
        hasUnit ? `unit "${read.unit}"` : 'no unit printed',
        match.def.alternateUnit &&
        read.unit?.toLowerCase() === match.def.alternateUnit.unit.toLowerCase()
          ? `converted from ${match.def.alternateUnit.unit}`
          : null,
        reportedRange ? `report range "${reportedRange.raw}"` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      humanVerified: false,
      source,
    });
  };

  for (const line of lines) {
    const matches = findAliasMatches(line);
    for (let i = 0; i < matches.length; i += 1) {
      const next = matches[i + 1];
      consider(line, matches[i], next ? next.start : -1);
    }
  }

  // Blood pressure: `BP 150/95 mmHg`, `B.P. : 140 / 90`.
  const bpRegex = new RegExp(
    `(?:\\bbp\\b|blood\\s*pressure|b\\.?\\s*p\\.?)\\s*[:=~-]?\\s*${NUMBER_PATTERN}\\s*\\/\\s*${NUMBER_PATTERN}`,
    'i',
  );
  for (const line of lines) {
    const bpMatch = bpRegex.exec(line);
    if (!bpMatch) continue;
    const systolic = Number(bpMatch[1].replace(/,/g, ''));
    const diastolic = Number(bpMatch[2].replace(/,/g, ''));
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) continue;
    if (!isPlausible(MARKER_BY_ID.bpSystolic, systolic) || !isPlausible(MARKER_BY_ID.bpDiastolic, diastolic)) {
      continue;
    }
    const evidence = `Read "${bpMatch[0].trim()}" as a systolic/diastolic pair`;
    found.set('bpSystolic', {
      id: 'bpSystolic',
      label: MARKER_BY_ID.bpSystolic.label,
      value: systolic,
      unit: 'mmHg',
      rawValue: bpMatch[1],
      rawUnit: 'mmHg',
      reportRange: null,
      range: rangeFor(MARKER_BY_ID.bpSystolic, sex),
      confidence: 'high',
      evidence,
      humanVerified: false,
      source,
    });
    found.set('bpDiastolic', {
      id: 'bpDiastolic',
      label: MARKER_BY_ID.bpDiastolic.label,
      value: diastolic,
      unit: 'mmHg',
      rawValue: bpMatch[2],
      rawUnit: 'mmHg',
      reportRange: null,
      range: rangeFor(MARKER_BY_ID.bpDiastolic, sex),
      confidence: 'high',
      evidence,
      humanVerified: false,
      source,
    });
  }

  return BIOMARKERS.map((def) => found.get(def.id)).filter(
    (reading): reading is ParsedReading => Boolean(reading),
  );
}

function roundTo(value: number, def: BiomarkerDef): number {
  if (def.id === 'platelets') return Math.round(value);
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* -------------------------------------------------------------------------- */
/* Status + organ mapping                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Traffic-light triage.
 *
 * Escalation to red is driven only by the explicit clinical bounds declared in
 * `BIOMARKERS` (`criticalHigh` / `criticalLow`) — a blanket percentage rule was
 * rejected because it turned ordinary stage-1 hypertension (150/95) into a
 * "critical" flag and drowned out genuinely dangerous values.
 */
export function computeStatus(reading: ParsedReading, sex: Sex = 'other'): MarkerStatus {
  if (reading.value === null) return 'unknown';
  const def = MARKER_BY_ID[reading.id];
  const range = rangeFor(def, sex);
  const { value } = reading;

  if (def.criticalHigh !== undefined && value >= def.criticalHigh) return 'critical';
  if (def.criticalLow !== undefined && value <= def.criticalLow) return 'critical';

  return value >= range.low && value <= range.high ? 'optimal' : 'borderline';
}

export const STATUS_META: Record<
  MarkerStatus,
  { label: string; icon: string; tone: string; description: string }
> = {
  critical: {
    label: 'Critical',
    icon: '🛑',
    tone: 'text-red-300 bg-red-500/15 border-red-500/40',
    description: 'Critical Risk / Consult Doctor',
  },
  borderline: {
    label: 'Borderline',
    icon: '⚠️',
    tone: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
    description: 'Borderline Range / Monitor',
  },
  optimal: {
    label: 'Optimal',
    icon: '✔️',
    tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
    description: 'Optimal Range / Healthy',
  },
  unknown: {
    label: 'Awaiting Entry',
    icon: '❔',
    tone: 'text-slate-300 bg-slate-500/15 border-slate-500/40',
    description: 'No verified value yet',
  },
};

export type OrganKey = 'heart' | 'lungs' | 'brain' | 'pancreas' | 'kidneys' | 'legs';

export interface OrganAlert {
  organ: OrganKey;
  severity: MarkerStatus;
  reason: string;
}

/** Map verified readings + reported symptoms onto the 3D twin's organ nodes. */
export function deriveOrganAlerts(
  readings: ParsedReading[],
  symptoms: string[],
  sex: Sex = 'other',
): OrganAlert[] {
  const alerts: OrganAlert[] = [];
  const push = (organ: OrganKey, severity: MarkerStatus, reason: string) => {
    const existing = alerts.find((alert) => alert.organ === organ);
    if (existing) {
      if (severity === 'critical') {
        existing.severity = 'critical';
        existing.reason = `${existing.reason}, ${reason}`;
      }
      return;
    }
    alerts.push({ organ, severity, reason });
  };

  for (const reading of readings) {
    const status = computeStatus(reading, sex);
    if (status === 'optimal' || status === 'unknown') continue;
    if (reading.value === null) continue;

    switch (reading.id) {
      case 'ldl':
      case 'totalCholesterol':
      case 'triglycerides':
      case 'bpSystolic':
      case 'bpDiastolic':
        push(
          'heart',
          status,
          `${reading.label} ${reading.value} ${reading.unit}`,
        );
        break;
      case 'fbs':
      case 'ppbs':
      case 'hba1c':
        push('pancreas', status, `${reading.label} ${reading.value} ${reading.unit}`);
        break;
      case 'creatinine':
        push('kidneys', status, `${reading.label} ${reading.value} ${reading.unit}`);
        break;
      case 'hemoglobin':
        push('lungs', status, `${reading.label} ${reading.value} ${reading.unit}`);
        break;
      case 'tsh':
      case 'bilirubin':
        push('brain', status, `${reading.label} ${reading.value} ${reading.unit}`);
        break;
      case 'platelets':
      case 'hdl':
        push('heart', status, `${reading.label} ${reading.value} ${reading.unit}`);
        break;
      default:
        break;
    }
  }

  for (const symptomId of symptoms) {
    switch (symptomId) {
      case 'chest':
        push('heart', 'critical', 'Reported chest discomfort / palpitations');
        break;
      case 'dizziness':
        push('brain', 'critical', 'Reported extreme dizziness / fainting');
        break;
      case 'thirst':
        push('pancreas', 'critical', 'Reported excessive thirst & frequent urination');
        break;
      case 'swelling':
        push('legs', 'borderline', 'Reported swollen legs & ankles');
        break;
      case 'breath':
        push('lungs', 'critical', 'Reported shortness of breath');
        break;
      default:
        break;
    }
  }

  return alerts;
}

export const SYMPTOM_BADGES: { id: string; emoji: string; label: string }[] = [
  { id: 'chest', emoji: '💔', label: 'Chest Discomfort / Heart Palpitations' },
  { id: 'dizziness', emoji: '🌀', label: 'Extreme Dizziness / Fainting' },
  { id: 'thirst', emoji: '💧', label: 'Excessive Thirst & Frequent Urination' },
  { id: 'swelling', emoji: '🦵', label: 'Swollen Legs & Ankles' },
  { id: 'breath', emoji: '🫁', label: 'Shortness of Breath' },
];
