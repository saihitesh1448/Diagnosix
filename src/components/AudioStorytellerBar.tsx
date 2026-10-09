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
  const { currentLang, t } = useLanguage();
  void summary;
  const { readings, symptoms } = useDiagnostics();
  const speechLang: string = currentLang ?? 'en-IN';

  const [state, setState] = useState<SpeakingState>('idle');
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  /**
   * Installed voices are state, not a ref: the browser installs them
   * asynchronously, and a ref read during render left `pickVoice` holding an
   * empty list forever — which is why every language played in the same default
   * voice.
   */
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const langTagRef = useRef(speechLang);
  const summaryText =
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

  /** Region code -> words a vendor is likely to use in the voice name. */
  const REGION_HINTS: Record<string, string> = {
    in: 'india',
    us: 'us',
    gb: 'uk',
    au: 'australia',
  };

  const pickVoice = useCallback(
    (tag: string): SpeechSynthesisVoice | null => {
      const wanted = tag.toLowerCase().replace('_', '-');
      const [lang, region] = wanted.split('-');
      const sameLang = voices.filter(
        (v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === lang,
      );
      if (!sameLang.length) return null;

      // 1. Exact tag, e.g. hi-IN or en-US.
      const exact = sameLang.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted);
      if (exact) return exact;

      // 2. Same region by tag, then by the vendor's own naming (…India, …US).
      if (region) {
        const hint = REGION_HINTS[region];
        const byTag = sameLang.find((v) => v.lang.toLowerCase().includes(region));
        if (byTag) return byTag;
        if (hint) {
          const byName = sameLang.find((v) => v.name.toLowerCase().includes(hint));
          if (byName) return byName;
        }
        // 3. A different region of the same language still beats a foreign one.
        const anyRegion = sameLang.find((v) => v.lang.toLowerCase().includes('-'));
        if (anyRegion) return anyRegion;
      }

      return sameLang[0];
    },
    [voices],
  );

  /**
   * Last-resort voice when the device has no voice for the selected language.
   *
   * English is preferred deliberately: the English summary is the text we fall
   * back to, and an English voice can actually pronounce it. Picking "whatever
   * the browser defaults to" is what made Hindi/Telugu playback sound broken.
   */
  const pickFallbackVoice = useCallback((): SpeechSynthesisVoice | null => {
    const english = voices.filter(
      (voice) => voice.lang.toLowerCase().replace('_', '-').split('-')[0] === 'en',
    );
    return english[0] ?? voices[0] ?? null;
  }, [voices]);

  /**
   * The voice the selected language will really be spoken with, and whether it
   * genuinely speaks that language. Both are needed: the text must be chosen to
   * match the voice, otherwise Telugu script goes to an English voice and the
   * user hears nothing at all.
   */
  const activeVoice = useMemo(
    () => pickVoice(speechLang) ?? pickFallbackVoice(),
    [pickVoice, pickFallbackVoice, speechLang],
  );
  const hasNativeVoice = useMemo(
    () => Boolean(pickVoice(speechLang)),
    [pickVoice, speechLang],
  );

  /**
   * True when a voice genuinely speaks the requested locale rather than merely
   * sharing its language. `pickVoice` deliberately degrades to another region of
   * the same language when the exact locale is missing (en-IN -> David/US on a
   * machine with only US voices), and that degradation has to be visible: it is
   * the difference between "the voice changes" and "the voice looks stuck".
   */
  const voiceMatches = useCallback(
    (tag: string, voice: SpeechSynthesisVoice | null): boolean => {
      if (!voice) return false;
      const want = tag.toLowerCase().replace('_', '-');
      const have = voice.lang.toLowerCase().replace('_', '-');
      if (have === want) return true;
      const region = want.split('-')[1];
      // A bare language tag ("en") is satisfied by any variant of it.
      if (!region) return true;
      if (have.includes(region)) return true;
      const hint = REGION_HINTS[region];
      return Boolean(hint && voice.name.toLowerCase().includes(hint));
    },
    [],
  );

  const speak = useCallback(
    (
      text: string,
      tag: string,
      voice: SpeechSynthesisVoice | null,
      /** True when `text` is really in `tag`'s language and `voice` speaks it. */
      nativeSpeech: boolean,
    ) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        setState('subtitles-only');
        return;
      }
      synth.cancel();
      synthRef.current = synth;

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      if (voice) utterance.voice = voice;
      // Never claim te-IN/hi-IN while an English voice speaks English text: a
      // language tag the voice cannot satisfy is exactly what makes Chrome drop
      // the utterance or read it as gibberish.
      utterance.lang = nativeSpeech ? tag : (voice?.lang ?? tag);
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

    const requested = speechLang;
    const nativeVoice = pickVoice(requested);
    const voice = nativeVoice ?? pickFallbackVoice();
    // Telugu/Hindi script only when a voice that speaks it exists. Without the
    // language pack an English voice cannot read it, so the explainer plays the
    // English summary instead of going silent — the reported "switching to
    // Telugu, audio explainer not working".
    const text = nativeVoice
      ? (storyTexts[requested] ?? storyTexts['en-IN'])
      : storyTexts['en-IN'];
    speak(text, requested, voice, Boolean(nativeVoice));
  }, [pickFallbackVoice, pickVoice, speak, storyTexts]);

  // Keep lang tag ref in sync so a mid-speech language switch is reflected on
  // the next listen action.
  useEffect(() => {
    langTagRef.current = speechLang;
  }, [speechLang]);

  // Voices arrive asynchronously (and again if the OS installs more), so keep
  // them in state and re-render whenever the list changes.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => setVoices(synth.getVoices() ?? []);
    load();
    synth.addEventListener?.('voiceschanged', load);
    synth.onvoiceschanged = load;
    return () => {
      synth.cancel();
      synth.removeEventListener?.('voiceschanged', load);
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
        {/* Which voice this language will actually use — makes a missing voice
            obvious instead of looking like "the voice never changes". */}
        <p className="text-[10px] font-mono text-slate-500 mt-0.5 truncate">
          {speechLang} ·{' '}
          {activeVoice
            ? voiceMatches(speechLang, activeVoice)
              ? `${activeVoice.name} (${activeVoice.lang})`
              : `fallback: ${activeVoice.name} (${activeVoice.lang}) — no ${speechLang} voice installed`
            : voices.length
              ? `no ${speechLang} voice installed — browser default`
              : 'loading voices…'}
          {!hasNativeVoice && activeVoice ? ' · reads the English summary here' : ''}
        </p>
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

