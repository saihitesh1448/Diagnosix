import { useCallback, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, Camera, FileText, Loader2, Upload } from 'lucide-react';
import { useDiagnostics } from '../providers/DiagnosticsProvider';
import { QUALITY_THRESHOLD, analyseImageQuality, type ImageQuality } from '../utils/imageQuality';
import {
  ACCEPTED_EXTENSIONS,
  extractTextFromFile,
  isAcceptedFile,
  isPdf,
} from '../utils/ocr';
import { parseReportText, type ParsedReading } from '../utils/reportParser';

/** Below this OCR mean-confidence the report is treated as unreadable. */
const OCR_CONFIDENCE_FLOOR = 60;
/** Fewer than this many markers means we do not trust the extraction. */
const MIN_MARKERS = 2;

interface PipelineReport {
  fileName: string;
  quality: ImageQuality | null;
  ocrConfidence: number | null;
  matched: ParsedReading[];
  accepted: boolean;
  notes: string[];
}

export function ReportIngestion() {
  const { mergeReadings, seedManualEntry, sex } = useDiagnostics();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIssues, setModalIssues] = useState<string[]>([]);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  /** Surface the tri-lingual gate modal together with the failed pipeline state. */
  const reject = useCallback((issues: string[], report: PipelineReport) => {
    setModalIssues(issues);
    setModalOpen(true);
    setReport({ ...report, accepted: false });
  }, []);

  const runPipeline = useCallback(
    async (file: File) => {
      setBusy(true);
      setProgress(0);
      setReport(null);

      try {
        if (!isAcceptedFile(file)) {
          reject([`Unsupported file "${file.name}". Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}.`], {
            fileName: file.name,
            quality: null,
            ocrConfidence: null,
            matched: [],
            accepted: false,
            notes: [],
          });
          return;
        }

        const notes: string[] = [];
        let quality: ImageQuality | null = null;

        // ---- Gate 1: physical legibility of the scan/photo (images only) ----
        if (!isPdf(file)) {
          quality = await analyseImageQuality(file);
          if (quality.verdict === 'unclear') {
            notes.push(
              `Legibility score ${(quality.score * 100).toFixed(0)}% — below the ${Math.round(
                QUALITY_THRESHOLD * 100,
              )}% safety floor, so OCR was not attempted.`,
            );
            reject(quality.issues.length ? quality.issues : ['The image is too unclear to read.'], {
              fileName: file.name,
              quality,
              ocrConfidence: null,
              matched: [],
              accepted: false,
              notes,
            });
            return;
          }
          notes.push(`Legibility score ${(quality.score * 100).toFixed(0)}% — passed the blur check.`);
        }

        // ---- Gate 2: actually read the text (never invent it) ----
        const extraction = await extractTextFromFile(file, (value) => setProgress(value));
        if (!extraction.ok) {
          const reason =
            extraction.reason === 'engine-unavailable'
              ? 'The OCR engine could not start (offline or blocked).'
              : extraction.reason === 'no-text'
                ? isPdf(file)
                  ? 'This PDF has no selectable text layer (it is a scan).'
                  : 'No text could be read from this photo.'
                : 'Text extraction failed.';
          reject([reason], {
            fileName: file.name,
            quality,
            ocrConfidence: extraction.confidence,
            matched: [],
            accepted: false,
            notes,
          });
          return;
        }

        const parsed = parseReportText(extraction.text, { sex, source: 'ocr' });
        const matched = parsed.filter((reading) => reading.value !== null);
        notes.push(`Read ${matched.length} marker(s) from the document text.`);

        // ---- Gate 3: confidence + minimum marker count ----
        if (extraction.confidence !== null && extraction.confidence < OCR_CONFIDENCE_FLOOR) {
          reject(
            [
              `OCR confidence ${extraction.confidence.toFixed(0)}% is below the ${OCR_CONFIDENCE_FLOOR}% safety floor.`,
            ],
            {
              fileName: file.name,
              quality,
              ocrConfidence: extraction.confidence,
              matched,
              accepted: false,
              notes,
            },
          );
          return;
        }

        if (matched.length < MIN_MARKERS) {
          reject(
            [
              `Only ${matched.length} biomarker(s) matched — at least ${MIN_MARKERS} are required before we trust a reading.`,
            ],
            {
              fileName: file.name,
              quality,
              ocrConfidence: extraction.confidence,
              matched,
              accepted: false,
              notes,
            },
          );
          return;
        }

        // ---- Verified: hand to the human-in-the-loop review table ----
        if (parsed.length) mergeReadings(parsed);
        notes.push('Values were read literally from the report — please confirm each row.');
        setReport({
          fileName: file.name,
          quality,
          ocrConfidence: extraction.confidence,
          matched,
          accepted: true,
          notes,
        });
      } catch (error) {
        reject([error instanceof Error ? error.message : 'Unexpected failure while reading the file.'], {
          fileName: file.name,
          quality: null,
          ocrConfidence: null,
          matched: [],
          accepted: false,
          notes: [],
        });
      } finally {
        setBusy(false);
        setProgress(0);
      }
    },
    [mergeReadings, reject, sex],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void runPipeline(file);
  };

  const handleParsePasted = () => {
    if (!pastedText.trim()) return;
    const parsed = parseReportText(pastedText, { sex, source: 'ocr' });
    const matched = parsed.filter((reading) => reading.value !== null);
    setReport({
      fileName: 'Pasted report text',
      quality: null,
      ocrConfidence: null,
      matched,
      accepted: matched.length >= MIN_MARKERS,
      notes: [
        `Read ${matched.length} marker(s) from pasted text.`,
        matched.length >= MIN_MARKERS
          ? 'Please confirm each row before trusting it.'
          : `Fewer than ${MIN_MARKERS} markers matched — check the text or enter values manually.`,
      ],
    });
    if (matched.length >= MIN_MARKERS) mergeReadings(parsed);
  };

  return (
    <section className="glass p-4 flex flex-col gap-4" aria-label="Lab report ingestion">
      <header>
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          Lab Report — Photo, PDF or Paste
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Indian formats (FBS, PPBS, S. Creatinine, PLT) and international ones are both understood.
          Blurry scans are rejected instead of guessed.
        </p>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-slate-700/70 bg-slate-800/40'
        }`}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-2 text-slate-300">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            <p className="text-xs">
              Reading the report… {progress > 0 ? `${Math.round(progress * 100)}%` : ''}
            </p>
          </div>
        ) : (
          <>
            <Upload className="w-6 h-6 mx-auto text-slate-400" />
            <p className="text-xs text-slate-400 mt-2">
              Drag &amp; drop a JPG / PNG / PDF, or choose a source:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 rounded-xl text-xs bg-slate-800/80 border border-slate-700/80 hover:border-cyan-400/60 transition-colors"
              >
                Choose file
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs bg-cyan-600/80 hover:bg-cyan-500 transition-colors text-white"
              >
                <Camera className="w-3.5 h-3.5" />
                Camera capture
              </button>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void runPipeline(file);
            event.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void runPipeline(file);
            event.target.value = '';
          }}
        />
      </div>

      <details className="rounded-xl bg-slate-800/40 border border-slate-700/60 px-3 py-2">
        <summary className="text-[11px] text-slate-400 cursor-pointer">
          Report text received on WhatsApp / printout? Paste it instead
        </summary>
        <textarea
          value={pastedText}
          onChange={(event) => setPastedText(event.target.value)}
          rows={4}
          placeholder={'Fasting Blood Sugar 142 mg/dL (70-99)\nHbA1c 7.8 %'}
          className="mt-2 w-full resize-y px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-700/80 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
        <button
          type="button"
          onClick={handleParsePasted}
          className="mt-2 px-3 py-1.5 rounded-xl text-xs bg-cyan-600/80 hover:bg-cyan-500 text-white transition-colors"
        >
          Parse pasted text
        </button>
      </details>

      {report && <PipelineSummary report={report} />}

      {modalOpen && (
        <UnclearImageModal
          issues={modalIssues}
          onManualEntry={() => {
            seedManualEntry();
            setModalOpen(false);
          }}
          onRetake={() => {
            setModalOpen(false);
            cameraInputRef.current?.click();
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}

function PipelineSummary({ report }: { report: PipelineReport }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-[11px] space-y-1 ${
        report.accepted
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      }`}
    >
      <p className="font-semibold">
        {report.accepted ? '✔️ Values extracted — please verify' : '⚠️ Not trusted automatically'}
        <span className="font-normal opacity-80"> · {report.fileName}</span>
      </p>
      <ul className="space-y-0.5 opacity-90">
        {report.quality && (
          <li className="font-mono">
            legibility {Math.round(report.quality.score * 100)}% · contrast{' '}
            {Math.round(report.quality.contrast * 100)}% · sharpness{' '}
            {Math.round(report.quality.sharpness * 100)}% · brightness{' '}
            {Math.round(report.quality.brightness * 100)}%
          </li>
        )}
        {report.ocrConfidence !== null && (
          <li className="font-mono">ocr confidence {report.ocrConfidence.toFixed(0)}%</li>
        )}
        <li className="font-mono">markers matched {report.matched.length}</li>
        {report.matched.length > 0 && (
          <li>
            {report.matched
              .map((reading) => `${reading.label} ${reading.value} ${reading.unit}`)
              .join(' · ')}
          </li>
        )}
        {report.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function UnclearImageModal({
  issues,
  onManualEntry,
  onRetake,
  onClose,
}: {
  issues: string[];
  onManualEntry: () => void;
  onRetake: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Unclear report image"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="glass w-full max-w-md p-5 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm leading-snug text-slate-100">
              ⚠️ Image Unclear or Faded — Please retake the photo in bright light, or tap below to
              enter values manually.
            </p>
            <p className="text-sm leading-snug text-slate-300">
              రిపోర్ట్ చిత్రం అస్పష్టంగా ఉంది — ప్రకాశవంతమైన వెలుగులో ఫోటో తీయండి, లేదా విలువలను
              చేతితో నమోదు చేయండి.
            </p>
            <p className="text-sm leading-snug text-slate-300">
              रिपोर्ट स्पष्ट नहीं है — अच्छी रोशनी में दोबारा फोटो लें, या नीचे टैप करके मान खुद भरें।
            </p>
          </div>
        </div>

        {issues.length > 0 && (
          <ul className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 space-y-1 list-disc list-inside">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-slate-500">
          Diagnosix will not guess numbers. Nothing has been added to your record from this upload.
        </p>

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-xs bg-slate-700/70 hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRetake}
            className="px-3 py-2 rounded-xl text-xs bg-slate-800/80 border border-slate-700/80 hover:border-cyan-400/60 transition-colors"
          >
            Retake photo
          </button>
          <button
            type="button"
            onClick={onManualEntry}
            className="px-3 py-2 rounded-xl text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors"
          >
            Enter values manually
          </button>
        </div>
      </div>
    </div>
  );
}
