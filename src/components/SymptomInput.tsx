import { useCallback, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Mic, MicOff, Trash2, Waves } from 'lucide-react';
import { SYMPTOM_BADGES } from '../utils/reportParser';
import { useDiagnostics } from '../providers/DiagnosticsProvider';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useLanguage, LANGUAGES, type LangCode } from '../providers/LanguageProvider';

/** Spoken-word -> symptom-badge mapping. Includes Indian-language cognates. */
const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  chest: [
    'chest', 'heart', 'palpitation', 'palpitations', 'chest pain', 'gunde', 'gundelu',
    'dil', 'seene', 'chhati', 'gundello',
  ],
  dizziness: [
    'dizzy', 'dizziness', 'giddiness', 'faint', 'fainting', 'light headed', 'lightheaded',
    'chakkar', 'tala tirugu', 'tirugu', 'chakkarana',
  ],
  thirst: [
    'thirst', 'thirsty', 'urination', 'urinating', 'urine', 'frequent urine', 'daham', 'daha',
    'pyas', 'peshab', 'mootram', 'bathroom',
  ],
  swelling: [
    'swelling', 'swollen', 'swell', 'edema', 'oedema', 'ankle', 'ankles', 'legs', 'sujan',
    'soojan', 'vuppu', 'kaalu',
  ],
  breath: [
    'breath', 'breathless', 'breathlessness', 'shortness of breath', 'breathing', 'saans', 'sans',
    'vuppiri', 'asvasam',
  ],
};



export const SymptomInput = forwardRef(function SymptomInput(_props, ref) {
  const { symptoms, toggleSymptom } = useDiagnostics();
  const [text, setText] = useState('');
  const [detected, setDetected] = useState<string[]>([]);
  const textRef = useRef('');

  const applyText = useCallback((value: string) => {
    textRef.current = value;
    setText(value);
  }, []);

  const detectFrom = useCallback(
    (value: string) => {
      const haystack = value.toLowerCase();
      const hits: string[] = [];
      for (const [id, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
        if (keywords.some((keyword) => haystack.includes(keyword))) hits.push(id);
      }
      setDetected((previous) => {
        const fresh = hits.filter((id) => !previous.includes(id));
        return fresh.length ? [...previous, ...fresh] : previous;
      });
      for (const id of hits) {
        if (!symptoms.includes(id)) toggleSymptom(id);
      }
      return hits;
    },
    [symptoms, toggleSymptom],
  );

  const handleFinalTranscript = useCallback(
    (transcript: string) => {
      const separator = textRef.current.trim().length ? ' ' : '';
      const next = `${textRef.current}${separator}${transcript}`.trim();
      applyText(next);
      detectFrom(next);
    },
    [applyText, detectFrom],
  );

  const { currentLang, setCurrentLang, t, speechLang } = useLanguage();
  const activeCount = useMemo(
    () => SYMPTOM_BADGES.filter((badge) => symptoms.includes(badge.id)).length,
    [symptoms],
  );
  const { supported, listening, interim, error, start, stop } =
    useSpeechRecognition({ lang: speechLang, onFinalTranscript: handleFinalTranscript });

  const startListening = useCallback(() => {
    if (!supported) {
      return;
    }
    if (listening) return;
    start();
  }, [supported, listening, start]);

  useImperativeHandle(ref, () => ({
    startListening,
  }));

  const displayValue = interim ? `${text}${text ? ' ' : ''}${interim}` : text;

  const handleMicToggle = () => {
    if (listening) {
      stop();
      return;
    }
    start();
  };

  const clearAll = () => {
    applyText('');
    setDetected([]);
    for (const id of symptoms) toggleSymptom(id);
  };

  return (
    <section className="glass p-4 flex flex-col gap-4" aria-label="Symptom input">
      <header className="flex items-start justify-between gap-3">
        <div>            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-400" />
            {t('symptomInput.header', 'Symptoms — Speak or Tap')}
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t('symptomInput.subtitle', 'Voice is transcribed live. Tip badges are coloured by what you report.')}
          </p>
        </div>
        <select
          value={currentLang}
          onChange={(event) => setCurrentLang(event.target.value as LangCode)}
          className="text-[11px] bg-slate-800/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          aria-label="Speech recognition language"
        >
          {LANGUAGES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
        </select>
      </header>

      <div className="flex items-center gap-4">
        <div className="relative flex items-center justify-center w-16 h-16 shrink-0">
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
              <span
                className="absolute inset-0 rounded-full bg-red-500/20 animate-ping"
                style={{ animationDelay: '320ms' }}
              />
              <span
                className="absolute inset-0 rounded-full bg-red-500/10 animate-ping"
                style={{ animationDelay: '640ms' }}
              />
            </>
          )}
          <button
            type="button"
            onClick={handleMicToggle}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            className={`relative z-10 flex items-center justify-center w-14 h-14 rounded-full border transition-all ${
              listening
                ? 'bg-red-500/90 border-red-300 shadow-[0_0_28px_6px_rgba(239,68,68,0.45)]'
                : 'bg-cyan-500/15 border-cyan-400/50 hover:bg-cyan-500/25 shadow-[0_0_18px_2px_rgba(6,182,212,0.25)]'
            }`}
          >
            {listening ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-cyan-300" />
            )}
          </button>
        </div>

        <div className="flex-1">
          {listening ? (
            <div className="flex items-end gap-1 h-8" aria-hidden>
              {[0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6, 0.3].map((scale, index) => (
                <span
                  key={index}
                  className="w-1.5 rounded-full bg-red-400/80 animate-pulse"
                  style={{
                    height: `${Math.round(scale * 100)}%`,
                    animationDelay: `${index * 90}ms`,
                    animationDuration: '900ms',
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 leading-snug">
              {supported
                ? t('symptomInput.micPrompt', 'Tap the mic and describe how you feel — “chest pain since morning”.')
                : t('symptomInput.noEngine', 'This browser has no speech engine. Type below or tap a symptom badge.')}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p role="status" className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          {error}
        </p>
      ) : null}

      <div className="flex items-start gap-2">
        <textarea
          value={displayValue}
          onChange={(event) => {
            applyText(event.target.value);
            detectFrom(event.target.value);
          }}
          rows={3}
          placeholder={t('symptomInput.placeholder', 'Type or speak the symptoms in your own words…')}
          className="flex-1 resize-none px-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700/80 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />          <button
            type="button"
            onClick={clearAll}
            title={t('symptomInput.clearTitle', 'Clear symptoms')}
            className="mt-1 p-2 rounded-xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-500/70 transition-colors"
          >
          <Trash2 className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            {t('symptomInput.quickSelect', 'Quick select')}
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {t('symptomInput.active', `{n} active`, { n: String(activeCount) })}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SYMPTOM_BADGES.map((badge) => {
            const active = symptoms.includes(badge.id);
            return (
              <button
                key={badge.id}
                type="button"
                onClick={() => toggleSymptom(badge.id)}
                aria-pressed={active}
                className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                  active
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-100 shadow-[0_0_18px_0_rgba(6,182,212,0.25)]'
                    : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:border-slate-500/70'
                }`}
              >
                <span className="text-lg leading-none">{badge.emoji}</span>
                <span className="leading-snug">{t(`badge.${badge.id}`, badge.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {detected.length > 0 && (
        <p className="text-[11px] text-slate-500">
          {t('symptomInput.autoDetected', 'Auto-detected from your words:')}{' '}
          <span className="text-cyan-300">
            {detected
              .map((id) => t(`badge.${id}`, SYMPTOM_BADGES.find((badge) => badge.id === id)?.label ?? id))
              .join(', ')}
          </span>{' '}
          {t('symptomInput.removeHint', '— tap a badge again to remove it.')}
        </p>
      )}
    </section>
  );
});
