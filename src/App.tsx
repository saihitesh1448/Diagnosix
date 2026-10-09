import { useCallback, useState, useRef, useMemo } from 'react';
import { FamilyProvider } from './providers/FamilyProvider';
import { DiagnosticsProvider } from './providers/DiagnosticsProvider';
import { LanguageProvider } from './providers/LanguageProvider';
import { Layout } from './components/Layout';
import { BodyTwinCanvas } from './components/BodyTwinCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MedicalHologramHero } from './components/ui/medical-hologram-hero';
import { EmergencyEscalation } from './components/EmergencyEscalation';
import { AudioStorytellerBar } from './components/AudioStorytellerBar';
import type { ReactNode, RefObject } from 'react';
import { useDiagnostics } from './providers/DiagnosticsProvider';
import { useLanguage } from './providers/LanguageProvider';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { AuthScreen } from './components/AuthScreen';

function AppInner() {
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const { readings, symptoms } = useDiagnostics();
  const { currentLang } = useLanguage();

  const storySummary = useMemo(() => {
    const parts: string[] = [];
    for (const r of readings) {
      if (r.value == null) continue;
      const label = r.label;
      const val = Number(r.value);
      if (!Number.isFinite(val)) continue;
      const formatted = Number.isInteger(val)
        ? val.toLocaleString('en-IN')
        : val.toFixed(val < 10 ? 2 : 1);
      parts.push(`${label} ${formatted} ${r.unit}`);
    }
    if (symptoms.length) {
      parts.push(symptoms.map((id) => id).join(', '));
    }
    return parts.join(' — ') || `${currentLang === 'hi-IN' ? 'स्वास्थ्य सारांश' : currentLang === 'te-IN' ? 'ఆరోగ్య సారాంశం' : 'Health summary'}`;
  }, [readings, symptoms, currentLang]);

  const symptomRef = useRef<{ startListening?: () => void }>({});
  const reportRef = useRef<{
    openFilePicker?: () => void;
    openCamera?: () => void;
  }>({});

  const handleSpeak = useCallback(() => {
    const target = document.getElementById('symptom-input-anchor');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => symptomRef.current?.startListening?.(), 450);
  }, []);

  const handleUpload = useCallback(() => {
    const target = document.getElementById('report-ingestion-anchor');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => reportRef.current?.openFilePicker?.(), 450);
  }, []);

  const handleEmergency = useCallback(() => setEmergencyOpen(true), []);

  return (
    <>
      <MedicalHologramHero
        hotColor="#06b6d4"
        midColor="#3b82f6"
        coolColor="#0f172a"
        onSpeak={handleSpeak}
        onUpload={handleUpload}
        onEmergency={handleEmergency}
      />

      <EmergencyEscalation open={emergencyOpen} onClose={() => setEmergencyOpen(false)} />

      <Layout
        symptomRef={symptomRef as RefObject<{
          startListening?: () => void;
        }>}
        reportRef={reportRef as RefObject<{
          openFilePicker?: () => void;
          openCamera?: () => void;
        }>}
      >
        <span id="symptom-input-anchor" aria-hidden="true" />
        <span id="report-ingestion-anchor" aria-hidden="true" />

        <ErrorBoundary label="3D twin">
          <BodyTwinCanvas />
        </ErrorBoundary>
      </Layout>

      <AudioStorytellerBar summary={storySummary} />
    </>
  );
}

/**
 * Sign-in stands in front of the whole app — but only once it is configured.
 * On a build without VITE_SUPABASE_* variables the gate is transparent, so the
 * app keeps behaving exactly as it did before. That is deliberate: nobody
 * should be locked out of a health app by a half-finished deployment.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { configured, ready, session } = useAuth();

  if (!configured) return <>{children}</>;
  if (!ready) {
    return (
      <div className="h-full w-full grid place-items-center bg-[#050811] text-slate-500 text-sm">
        Loading…
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <FamilyProvider>
          <DiagnosticsProvider>
            <LanguageProvider>
              <AppInner />
            </LanguageProvider>
          </DiagnosticsProvider>
        </FamilyProvider>
      </AuthGate>
    </AuthProvider>
  );
}
