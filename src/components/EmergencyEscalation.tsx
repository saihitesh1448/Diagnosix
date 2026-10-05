import { useEffect, useRef, useState } from 'react';
import { Phone, Printer, X, AlertTriangle } from 'lucide-react';

interface EmergencyEscalationProps {
  open: boolean;
  onClose: () => void;
}

export function EmergencyEscalation({ open, onClose }: EmergencyEscalationProps) {
  const [printing, setPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        // Auto-focus the dial button once the modal is on screen.
        const btn = document.getElementById('emergency-dial-button');
        btn?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  const dial108 = () => {
    // Direct-dial the national emergency number on devices that support tel:.
    window.location.href = 'tel:108';
  };

  const printSummary = async () => {
    setPrinting(true);
    try {
      await window.print();
    } finally {
      setPrinting(false);
    }
  };

  // Only render the dialog when open so we don't keep it in the DOM when closed.
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Emergency escalation"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-red-800/60 rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        {/* Distinct ✕ close button, top-right */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
          aria-label="Close emergency dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-900/60 border border-red-700/50">
            <AlertTriangle className="w-5 h-5 text-red-300" />
          </div>
          <h2 className="text-xl font-semibold text-white">Emergency — 108 Dispatch</h2>
        </div>

        <p className="text-sm text-slate-300 mb-5">
          If you believe this is a life-threatening emergency, call{' '}
          <strong className="text-red-200">108</strong> now. This screen only opens the dialer
          — it does not call automatically.
        </p>

        {/* One-tap direct dial */}
        <button
          id="emergency-dial-button"
          type="button"
          onClick={dial108}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-700 hover:bg-red-600 text-white font-semibold text-sm transition-colors shadow-[0_0_20px_0_rgba(220,38,38,0.4)] mb-5"
        >
          <Phone className="w-5 h-5" />
          Call 108 Now
        </button>

        {/* 1-page printable doctor preparation summary */}
        <div
          className="rounded-xl border border-slate-700/70 bg-slate-800/40 p-4 mb-5"
          ref={printRef}
          style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Printer className="w-4 h-4 text-slate-400" />
              Doctor Preparation Summary
            </h3>
            <button
              type="button"
              onClick={printSummary}
              disabled={printing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-700/70 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              {printing ? 'Printing…' : 'Print'}
            </button>
          </div>

          <dl className="text-xs text-slate-300 space-y-1.5 font-mono">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <dt className="text-slate-500">Name</dt>
                <dd className="text-slate-200">Patient (family member)</dd>
              </div>
              <div>
                <dt className="text-slate-500">Emergency contact</dt>
                <dd className="text-slate-200">108 — Emergency Medical Services</dd>
              </div>
              <div>
                <dt className="text-slate-500">Chief complaint</dt>
                <dd className="text-slate-200">
                  Symptoms reported via speech / quick-select badges.
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Recent readings</dt>
                <dd className="text-slate-200">Verified lab values pending confirmation.</dd>
              </div>
            </div>
          </dl>

          {/* Printable-only block: renders only when printed */}
          <div
            className="mt-3 border-t border-slate-700/60 pt-3 text-[11px] text-slate-400 hidden print:block"
            style={{ color: '#e2e8f0' }}
          >
            <p className="mb-2">
              Prepared by Diagnosix — a clinical companion, not a substitute for emergency care.
            </p>
            <p className="mb-2">
              Always confirm readings with a clinician before acting on them.
            </p>
            <p className="text-slate-500">
              Diagnosis and treatment decisions remain the responsibility of the treating physician.
            </p>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm bg-slate-700/70 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
