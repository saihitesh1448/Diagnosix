import { useCallback, useState, useRef } from 'react';
import { FamilyProvider } from './providers/FamilyProvider';
import { DiagnosticsProvider } from './providers/DiagnosticsProvider';
import { Layout } from './components/Layout';
import { BodyTwinCanvas } from './components/BodyTwinCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MedicalHologramHero } from './components/ui/medical-hologram-hero';
import { EmergencyEscalation } from './components/EmergencyEscalation';

export default function App() {
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const symptomRef = useRef<{ startListening?: () => void }>({});
  const reportRef = useRef<{
    openFilePicker?: () => void;
    openCamera?: () => void;
  }>({});

  const handleSpeak = useCallback(() => {
    // Smooth-scroll to the symptom section, then resume live voice dictation.
    const target = document.getElementById('symptom-input-anchor');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Defer the imperative start until after the scroll completes and the input
    // is on-screen.
    setTimeout(() => symptomRef.current?.startListening?.(), 450);
  }, []);

  const handleUpload = useCallback(() => {
    // Smooth-scroll to the report section, then open the file picker.
    const target = document.getElementById('report-ingestion-anchor');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => reportRef.current?.openFilePicker?.(), 450);
  }, []);

  const handleEmergency = useCallback(() => {
    setEmergencyOpen(true);
  }, []);

  return (
    <FamilyProvider>
      <DiagnosticsProvider>
        <>
          {/* Medical hologram hero — top of the main landing view */}
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
            {/* Anchor targets for the hero's smooth-scroll triggers */}
            <span id="symptom-input-anchor" aria-hidden="true" />
            <span id="report-ingestion-anchor" aria-hidden="true" />

            <ErrorBoundary label="3D twin">
              <BodyTwinCanvas />
            </ErrorBoundary>
          </Layout>
        </>
      </DiagnosticsProvider>
    </FamilyProvider>
  );
}
