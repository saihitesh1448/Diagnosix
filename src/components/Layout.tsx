import type { ReactNode } from 'react';
import { Activity, AlertTriangle, HeartPulse } from 'lucide-react';
import { useFamily } from '../providers/FamilyProvider';
import { useDiagnostics } from '../providers/DiagnosticsProvider';
import { ProfileSwitcher } from './ProfileSwitcher';
import { BiomarkerReviewTable } from './BiomarkerReviewTable';
import { ReportIngestion } from './ReportIngestion';
import { SymptomInput } from './SymptomInput';
import type { OrganKey, MarkerStatus } from '../utils/reportParser';

const ORGAN_LABELS: { organ: OrganKey; label: string; swatch: string }[] = [
  { organ: 'heart', label: 'Heart / Arteries', swatch: 'bg-red-400' },
  { organ: 'pancreas', label: 'Pancreas / Blood Sugar', swatch: 'bg-amber-400' },
  { organ: 'kidneys', label: 'Kidneys / Renal', swatch: 'bg-emerald-400' },
  { organ: 'lungs', label: 'Lungs', swatch: 'bg-cyan-400' },
  { organ: 'brain', label: 'Brain', swatch: 'bg-sky-300' },
  { organ: 'legs', label: 'Legs / Ankles', swatch: 'bg-teal-300' },
];

const SEVERITY_RING: Record<MarkerStatus, string> = {
  critical: 'ring-2 ring-red-500/70',
  borderline: 'ring-2 ring-amber-400/60',
  optimal: 'ring-1 ring-emerald-400/40',
  unknown: 'ring-1 ring-slate-600/40',
};

export function Layout({ children }: { children: ReactNode }) {
  const { sessionId, member } = useFamily();
  const { alerts, criticalCount, focusOrgan, setFocusOrgan } = useDiagnostics();

  return (
    <div className="h-full w-full flex flex-col bg-[#050811]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/60 glass rounded-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-600/20 border border-cyan-500/40">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">Diagnosix</h1>
            <p className="text-[11px] text-slate-500 font-mono">
              60 FPS twin · dual-unit lab parsing
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {member && (
            <span className="text-[11px] text-slate-400">
              {member.name}
              {member.age ? ` · ${member.age}y` : ''}
            </span>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/70 border border-slate-700/70 text-xs font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-500">Session</span>
            <span className="text-slate-300 font-medium">{sessionId}</span>
          </div>
          <ProfileSwitcher />
        </div>
      </header>

      {criticalCount > 0 && (
        <div
          role="alert"
          className="flex items-center gap-2 px-4 py-2 bg-red-500/15 border-b border-red-500/40 text-red-200 text-xs"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {criticalCount} critical flag{criticalCount > 1 ? 's' : ''} —{' '}
            {alerts
              .filter((alert) => alert.severity === 'critical')
              .map((alert) => alert.organ)
              .join(', ')}
            . Please consult a doctor; this is not a diagnosis.
          </span>
        </div>
      )}

      <main className="flex-1 p-3 md:p-4 overflow-auto space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 glass p-3 md:p-4 flex flex-col min-h-[380px]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-cyan-400" />
                3D Anatomical Twin
              </h2>
              <span className="text-[11px] text-slate-500 font-mono">
                {focusOrgan ? 'orbiting to flagged organ' : 'low-RAM · inline geometry'}
              </span>
            </div>
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-[#050811] border border-slate-800/60">
              {children}
            </div>
          </div>

          <aside className="glass p-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Organ Nodes
              </h3>
              <ul className="space-y-2">
                {ORGAN_LABELS.map((entry) => {
                  const alert = alerts.find((item) => item.organ === entry.organ);
                  const severity: MarkerStatus = alert?.severity ?? 'unknown';
                  const active = focusOrgan === entry.organ;
                  return (
                    <li key={entry.organ}>
                      <button
                        type="button"
                        onClick={() => setFocusOrgan(active ? null : entry.organ)}
                        className={`w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-xl transition-colors ${
                          active ? 'bg-cyan-500/15' : 'hover:bg-slate-800/60'
                        }`}
                      >
                        <span
                          className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${entry.swatch} ${SEVERITY_RING[severity]}`}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-300">{entry.label}</span>
                          <span
                            className={`block text-[11px] truncate ${
                              severity === 'critical'
                                ? 'text-red-300'
                                : severity === 'borderline'
                                  ? 'text-amber-300'
                                  : 'text-slate-500'
                            }`}
                          >
                            {alert ? alert.reason : 'no flags'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-800/60">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Render Budget
              </h3>
              <dl className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Renderer</dt>
                  <dd className="text-slate-300 font-mono">WebGL</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Pixel ratio cap</dt>
                  <dd className="text-slate-300 font-mono">
                    {Math.min(window.devicePixelRatio, 1.5).toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Particle budget</dt>
                  <dd className="text-slate-300 font-mono">1,200 max</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Hidden tab</dt>
                  <dd className="text-slate-300 font-mono">loop halted</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SymptomInput />
          <ReportIngestion />
        </div>

        <BiomarkerReviewTable />
      </main>
    </div>
  );
}
