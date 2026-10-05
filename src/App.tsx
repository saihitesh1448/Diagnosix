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
import { useDiagnostics } from './providers/DiagnosticsProvider';
import { useLanguage } from './providers/LanguageProvider';

export default function App() {
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
    <FamilyProvider>
      <DiagnosticsProvider>
        <LanguageProvider>
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
              symptomRef={symptomRef}
              reportRef={reportRef}
            >
              <span id="symptom-input-anchor" aria-hidden="true" />
              <span id="report-ingestion-anchor" aria-hidden="true" />

              <ErrorBoundary label="3D twin">
                <BodyTwinCanvas />
              </ErrorBoundary>
            </Layout>

            <AudioStorytellerBar summary={storySummary} />
          </>
        </LanguageProvider>
      </DiagnosticsProvider>
    </FamilyProvider>
  );
}
