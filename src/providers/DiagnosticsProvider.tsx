import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  BIOMARKERS,
  MARKER_BY_ID,
  deriveOrganAlerts,
  rangeFor,
  type MarkerId,
  type OrganAlert,
  type OrganKey,
  type ParsedReading,
  type Sex,
} from '../utils/reportParser';

interface DiagnosticsContextValue {
  readings: ParsedReading[];
  symptoms: string[];
  alerts: OrganAlert[];
  focusOrgan: OrganKey | null;
  sex: Sex;
  criticalCount: number;
  /** Merge newly parsed/verified readings, replacing earlier rows for the same marker. */
  mergeReadings: (incoming: ParsedReading[]) => void;
  /** Human-in-the-loop correction. Any edited value is flagged `humanVerified`. */
  updateReading: (id: MarkerId, value: number) => void;
  /** Seed an editable, empty row for every biomarker so nothing is auto-filled. */
  seedManualEntry: () => void;
  toggleSymptom: (id: string) => void;
  setFocusOrgan: (organ: OrganKey | null) => void;
  setSex: (sex: Sex) => void;
  clearAll: () => void;
}

const DiagnosticsContext = createContext<DiagnosticsContextValue | undefined>(undefined);

export function DiagnosticsProvider({ children }: { children: ReactNode }) {
  const [readings, setReadings] = useState<ParsedReading[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [focusOrgan, setFocusOrgan] = useState<OrganKey | null>(null);
  const [sex, setSex] = useState<Sex>('other');

  const mergeReadings = useCallback((incoming: ParsedReading[]) => {
    setReadings((previous) => {
      const next = [...previous];
      for (const reading of incoming) {
        const index = next.findIndex((entry) => entry.id === reading.id);
        if (index === -1) {
          next.push(reading);
          continue;
        }
        const existing = next[index];
        // Never let a machine guess overwrite a value a human confirmed.
        if (existing.humanVerified && !reading.humanVerified) continue;
        next[index] = reading;
      }
      return next;
    });
  }, []);

  const updateReading = useCallback((id: MarkerId, value: number) => {
    setReadings((previous) => {
      const def = MARKER_BY_ID[id];
      const range = rangeFor(def, 'other');
      const next: ParsedReading = {
        id,
        label: def.label,
        value,
        unit: def.unit,
        rawValue: String(value),
        rawUnit: def.unit,
        reportRange: null,
        range,
        confidence: 'high',
        evidence: 'Entered and confirmed by the user (human-in-the-loop).',
        humanVerified: true,
        source: 'manual',
      };
      const index = previous.findIndex((entry) => entry.id === id);
      if (index === -1) return [...previous, next];
      const copy = [...previous];
      copy[index] = next;
      return copy;
    });
  }, []);

  const seedManualEntry = useCallback(() => {
    setReadings((previous) => {
      const next = [...previous];
      for (const def of BIOMARKERS) {
        if (next.some((entry) => entry.id === def.id)) continue;
        next.push({
          id: def.id,
          label: def.label,
          value: null,
          unit: def.unit,
          rawValue: null,
          rawUnit: null,
          reportRange: null,
          range: rangeFor(def, 'other'),
          confidence: 'unverified',
          evidence: 'Awaiting manual entry — no reliable value could be read.',
          humanVerified: false,
          source: 'manual',
        });
      }
      return next;
    });
  }, []);

  const toggleSymptom = useCallback((id: string) => {
    setSymptoms((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    );
  }, []);

  const clearAll = useCallback(() => {
    setReadings([]);
    setSymptoms([]);
    setFocusOrgan(null);
  }, []);

  const alerts = useMemo(
    () => deriveOrganAlerts(readings, symptoms, sex),
    [readings, symptoms, sex],
  );

  const criticalCount = useMemo(
    () => alerts.filter((alert) => alert.severity === 'critical').length,
    [alerts],
  );

  const value = useMemo<DiagnosticsContextValue>(
    () => ({
      readings,
      symptoms,
      alerts,
      focusOrgan,
      sex,
      criticalCount,
      mergeReadings,
      updateReading,
      seedManualEntry,
      toggleSymptom,
      setFocusOrgan,
      setSex,
      clearAll,
    }),
    [
      readings,
      symptoms,
      alerts,
      focusOrgan,
      sex,
      criticalCount,
      mergeReadings,
      updateReading,
      seedManualEntry,
      toggleSymptom,
      clearAll,
    ],
  );

  return <DiagnosticsContext.Provider value={value}>{children}</DiagnosticsContext.Provider>;
}

export function useDiagnostics(): DiagnosticsContextValue {
  const ctx = useContext(DiagnosticsContext);
  if (!ctx) throw new Error('useDiagnostics must be used inside <DiagnosticsProvider>');
  return ctx;
}
