import { FamilyProvider } from './providers/FamilyProvider';
import { DiagnosticsProvider } from './providers/DiagnosticsProvider';
import { Layout } from './components/Layout';
import { BodyTwinCanvas } from './components/BodyTwinCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <FamilyProvider>
      <DiagnosticsProvider>
        <Layout>
          <ErrorBoundary label="3D twin">
            <BodyTwinCanvas />
          </ErrorBoundary>
        </Layout>
      </DiagnosticsProvider>
    </FamilyProvider>
  );
}
