import { useMemo, useState } from 'react';
import { Check, ClipboardList, Pencil, X } from 'lucide-react';
import { useDiagnostics } from '../providers/DiagnosticsProvider';
import {
  MARKER_BY_ID,
  STATUS_META,
  computeStatus,
  formatRange,
  type MarkerId,
  type ParsedReading,
} from '../utils/reportParser';

export function BiomarkerReviewTable() {
  const { readings, updateReading, seedManualEntry, sex, clearAll } = useDiagnostics();
  const [editing, setEditing] = useState<MarkerId | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...readings].sort((a, b) => a.label.localeCompare(b.label)),
    [readings],
  );

  const verifiedCount = readings.filter((reading) => reading.value !== null).length;

  const beginEdit = (reading: ParsedReading) => {
    setEditing(reading.id);
    setDraft(reading.value !== null ? String(reading.value) : '');
    setError(null);
  };

  const commit = (id: MarkerId) => {
    const parsed = Number(draft.replace(/,/g, '').trim());
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < 0) {
      setError('Enter a valid number, or press ✕ to cancel.');
      return;
    }
    const def = MARKER_BY_ID[id];
    const ceiling = def.range.high * 50;
    const floor = Math.max(def.range.low / 50, 0.01);
    if (parsed < floor || parsed > ceiling) {
      setError(
        `That looks like a typo — ${parsed} is far outside the possible range for ${def.label}.`,
      );
      return;
    }
    // Platelet counts are entered in absolute cells/mcL; lakhs are converted here.
    const normalised = def.id === 'platelets' && parsed > 0 && parsed < 1000 ? parsed * 1000 : parsed;
    updateReading(id, normalised);
    setEditing(null);
    setError(null);
  };

  return (
    <section className="glass p-4" aria-label="Biomarker verification table">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-cyan-400" />
            Verify Every Value
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Faded or misread print? Tap a row and type the correct number from your paper report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-500">
            {verifiedCount}/{readings.length} with values
          </span>
          <button
            type="button"
            onClick={seedManualEntry}
            className="px-3 py-1.5 rounded-xl text-[11px] bg-slate-800/80 border border-slate-700/80 hover:border-cyan-400/60 transition-colors"
          >
            Add missing markers
          </button>
          {readings.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="px-3 py-1.5 rounded-xl text-[11px] bg-slate-800/80 border border-slate-700/80 hover:border-red-500/60 transition-colors text-slate-400"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-2 text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          No values yet. Upload a report, or press “Add missing markers” to key in numbers from the
          paper printout.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500 text-left">
                <th className="font-semibold px-2 py-1">Biomarker</th>
                <th className="font-semibold px-2 py-1">Detected Value</th>
                <th className="font-semibold px-2 py-1">Reference Range</th>
                <th className="font-semibold px-2 py-1">Status</th>
                <th className="font-semibold px-2 py-1 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((reading) => {
                const status = computeStatus(reading, sex);
                const meta = STATUS_META[status];
                const def = MARKER_BY_ID[reading.id];
                const isEditing = editing === reading.id;
                return (
                  <tr key={reading.id} className="bg-slate-800/50">
                    <td className="px-2 py-2 rounded-l-xl">
                      <div className="font-medium text-slate-200">{reading.label}</div>
                      <div className="text-[10px] text-slate-500">
                        {reading.humanVerified
                          ? 'entered by you'
                          : reading.source === 'ocr'
                            ? `read from report · ${reading.confidence}`
                            : reading.confidence}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commit(reading.id);
                              if (event.key === 'Escape') setEditing(null);
                            }}
                            className="w-24 px-2 py-1 rounded-lg bg-slate-900/80 border border-cyan-500/50 text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                            aria-label={`${reading.label} value`}
                          />
                          <button
                            type="button"
                            onClick={() => commit(reading.id)}
                            title="Save"
                            className="p-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500"
                          >
                            <Check className="w-3.5 h-3.5 text-white" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            title="Cancel"
                            className="p-1 rounded-lg bg-slate-700/80 hover:bg-slate-700"
                          >
                            <X className="w-3.5 h-3.5 text-slate-300" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-slate-100">
                          {reading.value !== null ? (
                            <>
                              {formatValue(reading.value)} <span className="text-slate-500">{reading.unit}</span>
                            </>
                          ) : (
                            <span className="text-slate-500">— not entered —</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-400 font-mono">
                      {formatRange(def, sex)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] whitespace-nowrap ${meta.tone}`}
                        title={meta.description}
                      >
                        <span aria-hidden>{meta.icon}</span>
                        {meta.description}
                      </span>
                    </td>
                    <td className="px-2 py-2 rounded-r-xl text-right">
                      <button
                        type="button"
                        onClick={() => beginEdit(reading)}
                        title={`Edit ${reading.label}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-slate-700/70 hover:bg-cyan-600/70 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-600">
        Ranges are adult reference intervals. Values are converted to a single canonical unit
        (mg/dL, %, g/dL, /mcL, uIU/mL, mmHg) so Indian and international printouts stay comparable.
      </p>
    </section>
  );
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-IN');
  return value.toFixed(value < 10 ? 2 : 1);
}
