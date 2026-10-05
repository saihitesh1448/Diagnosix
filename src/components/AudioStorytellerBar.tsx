import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { useLanguage } from '../providers/LanguageProvider';
import { useDiagnostics } from '../providers/DiagnosticsProvider';

// Share the same Window augmentation as useSpeechRecognition so TypeScript sees
// identical modifiers for webkitSpeechRecognition across the app.
import '../hooks/useSpeechRecognition';

type SpeakingState = 'idle' | 'loading' | 'speaking' | 'subtitles-only';

interface StorytellerBarProps {
  /** Compact summary string, e.g. “Fever, Cough + Hemoglobin 12.5 & Platelets 150000”. */
  summary: string;
}

export function AudioStorytellerBar({ summary }: StorytellerBarProps) {
  const { speechLang, t } = useLanguage();
  void summary;
  const { readings, symptoms } = useDiagnostics();

  const [state, setState] = useState<SpeakingState>('idle');
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const langTagRef = useRef('en-IN');
  const voicesReady = useRef(false);  const summaryText =
    useMemo(() => {
      const parts: string[] = [];

      const readingParts: string[] = [];
      for (const reading of readings) {
        if (reading.value === null || reading.value === undefined) continue;
        const val = Number(reading.value);
        if (!Number.isFinite(val)) continue;
        const label = t(`badge.${reading.id}`, reading.label);
        const formatted = Number.isInteger(val)
          ? val.toLocaleString('en-IN')
          : val.toFixed(val < 10 ? 2 : 1);
        readingParts.push(`${label} ${formatted} ${reading.unit}`);
      }
      if (readingParts.length) parts.push(readingParts.join(' · '));

      const symptomParts: string[] = [];
      if (symptoms.length) {
        for (const id of symptoms) {
          symptomParts.push(t(`badge.${id}`, id));
        }
        parts.push(symptomParts.join(', '));
      }

      return parts.length
        ? parts.join(' — ')
        : t('storyteller.healthTitle', 'your health summary');
    }, [readings, symptoms, t]);

  const voices = voicesRef.current;
  const pickVoice = useCallback((tag: string) => {
    // Prefer a voice whose lang starts with the requested tag, otherwise the
    // first voice whose lang includes the tag, otherwise any installed voice.
    const exact = voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const fuzzy = voices.find((v) => v.lang.toLowerCase().startsWith(tag.toLowerCase()));
    if (fuzzy) return fuzzy;
    const anyVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    return anyVoice ?? voices[0] ?? null;
  }, [voices]);

  const speak = useCallback(
    (text: string, tag: string) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        setState('subtitles-only');
        return;
      }
      synth.cancel();
      synthRef.current = synth;

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Wait for voices if needed.
      if (voices.length === 0) {
        setState('loading');
        const onVoices = () => {
          voicesRef.current = synth.getVoices() ?? [];
          voicesReady.current = true;
          const voice = pickVoice(tag);
          if (voice) utterance.voice = voice;
          utterance.lang = tag;
          utterance.onstart = () => setState('speaking');
          utterance.onend = () => {
            setState('idle');
            utteranceRef.current = null;
          };
          utterance.onerror = () => {
            setState('subtitles-only');
            utteranceRef.current = null;
          };
          synth.speak(utterance);
        };
        // If voiceschanged already fired, getVoices may already be populated.
        const existing = synth.getVoices();
        if (existing && existing.length) {
          voicesRef.current = existing;
          onVoices();
        } else {
          synth.onvoiceschanged = onVoices;
        }
        return;
      }

      const voice = pickVoice(tag);
      if (voice) utterance.voice = voice;
      utterance.lang = tag;
      utterance.onstart = () => setState('speaking');
      utterance.onend = () => {
        setState('idle');
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setState('subtitles-only');
        utteranceRef.current = null;
      };
      synth.speak(utterance);
    },
    [pickVoice],
  );

  const storyTexts = useMemo<Record<string, string>>(() => ({
    'en-IN': t('storyteller.enSummary'),
    'hi-IN': t('storyteller.hiSummary'),
    'te-IN': t('storyteller.teSummary'),
    'en-US': t('storyteller.enSummary'),
  }), [t]);

  const handleListen = useCallback(() => {
    // Cancel any ongoing speech first.
    window.speechSynthesis?.cancel();

    const text = storyTexts[speechLang] ?? storyTexts['en-IN'] ?? summaryText;
    speak(text, langTagRef.current);
  }, [speak, summaryText, storyTexts]);

  // Keep lang tag ref in sync so a mid-speech language switch is reflected on
  // the next listen action.
  useEffect(() => {
    langTagRef.current = speechLang;
  }, [speechLang]);

  // Pre-warm voices on mount.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const existing = synth.getVoices();
    if (existing && existing.length) {
      voicesRef.current = existing;
      voicesReady.current = true;
    } else {
      synth.onvoiceschanged = () => {
        voicesRef.current = synth.getVoices() ?? [];
        voicesReady.current = true;
      };
    }
    return () => {
      synth.cancel();
      synth.onvoiceschanged = null;
    };
  }, []);

  const isSpeaking = state === 'speaking' || state === 'loading';
  const showSubtitles = state === 'subtitles-only' || state === 'speaking' || state === 'loading';
  const displayText = showSubtitles ? summaryText : t('storyteller.healthTitle', 'your health summary');

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-4xl bg-slate-900/90 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-4 shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center justify-between gap-4"
      style={{ animation: 'slideUp 0.35s ease-out' }}
    >
      {/* Left: animated waveform icon + title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
          <Mic className="w-5 h-5 text-cyan-300" />
          {isSpeaking && (
            <span className="absolute inset-0 rounded-full bg-red-500/25 animate-ping" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-cyan-200 leading-tight">
            {t('storyteller.title', 'AI Audio Explainer')}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {t('storyteller.healthTitle', 'your health summary')}
          </p>
        </div>
      </div>

      {/* Middle: short summary preview */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 leading-snug truncate">
          {showSubtitles
            ? displayText
            : t('storyteller.healthTitle', 'your health summary')}
        </p>
        {showSubtitles && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {isSpeaking ? t('storyteller.playing', 'Playing…') : t('storyteller.healthTitle', 'your health summary')}
          </p>
        )}
      </div>

      {/* Right: large glowing listen button */}
      <button
        type="button"
        onClick={handleListen}
        disabled={isSpeaking && state !== 'loading'}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
          isSpeaking
            ? 'bg-slate-700/70 text-slate-300 cursor-wait'
            : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_24px_4px_rgba(6,182,212,0.5)] active:scale-[0.97]'
        }`}
        aria-live="polite"
      >
        <Volume2 className="w-4 h-4" />
        <span className="hidden sm:inline">
          {isSpeaking
            ? t('storyteller.playing', 'Playing…')
            : t('storyteller.listen', 'Listen to Full Doctor Summary')}
        </span>
        <span className="sm:hidden">{isSpeaking ? '▶' : '🔊'}</span>
      </button>

      {/* Live subtitles fallback when speech synthesis has no installed voice */}
      {state === 'subtitles-only' && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-2xl bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-xl px-3 py-2 text-[11px] text-slate-200 text-center leading-relaxed">
          {t('storyteller.notSupported', 'Speech synthesis unavailable')}
          <span className="mx-1">·</span>
          {summaryText}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 12px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

