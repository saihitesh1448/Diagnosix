import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSpeechRecognitionOptions {
  /** BCP-47 tag, e.g. `en-IN`, `te-IN`, `hi-IN`. */
  lang?: string;
  /** Called every time the recogniser finalises a phrase. */
  onFinalTranscript?: (transcript: string) => void;
}

export interface UseSpeechRecognitionApi {
  supported: boolean;
  listening: boolean;
  /** Words being recognised right now, streamed live into the text box. */
  interim: string;
  error: string | null;
  lang: string;
  setLang: (lang: string) => void;
  start: () => void;
  stop: () => void;
}

const RECOVERABLE_ERRORS = new Set(['no-speech', 'aborted', 'network']);

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionApi {
  const { onFinalTranscript } = options;
  const [lang, setLang] = useState(options.lang ?? 'en-IN');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const finalHandlerRef = useRef(onFinalTranscript);
  const langRef = useRef(lang);
  const supported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  finalHandlerRef.current = onFinalTranscript;
  langRef.current = lang;

  const destroy = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
    try {
      recognition.abort();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
  }, []);

  const build = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;

    // Dynamically match language to the current app language.
    recognition.lang = langRef.current;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let pending = '';
      const transcripts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        transcripts.push(transcript);
        if (result.isFinal) {
          pending = transcripts.join(' ');
        } else {
          pending = transcripts.join(' ');
        }
      }
      setInterim(pending.trim());
      if (transcripts.length) {
        // Emit final transcript each time results arrive so the caller can
        // detect symptoms live.
        finalHandlerRef.current?.(transcripts.join(' '));
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setError(describeError(event.error));
      if (!RECOVERABLE_ERRORS.has(event.error)) {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
      // Chromium stops after a short silence; resume while the user still wants it.
      if (wantListeningRef.current) {
        window.setTimeout(() => {
          if (!wantListeningRef.current) return;
          try {
            recognitionRef.current?.start();
          } catch {
            /* start() throws if already running — safe to ignore */
          }
        }, 350);
      }
    };

    return recognition;
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError('Speech recognition is not available in this browser. Please type the symptoms.');
      return;
    }
    wantListeningRef.current = true;
    if (!recognitionRef.current) recognitionRef.current = build();
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.lang = langRef.current;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // Already started — treat as success.
      setListening(true);
    }
  }, [build, supported]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterim('');
    try {
      recognitionRef.current?.stop();
    } catch {
      /* not running */
    }
  }, []);

  useEffect(() => destroy, [destroy]);

  // Re-target the recogniser language without dropping the session.
  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.lang = lang;
    if (wantListeningRef.current) {
      try {
        recognition.stop();
      } catch {
        /* not running */
      }
    }
  }, [lang]);

  return { supported, listening, interim, error, lang, setLang, start, stop };
}

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was blocked. Allow mic access, or type the symptoms below.';
    case 'no-speech':
      return 'No speech detected — move closer to the mic and try again.';
    case 'audio-capture':
      return 'No microphone found on this device. You can still tap a symptom badge below.';
    case 'network':
      return 'Speech service unreachable (offline). Please type or tap a symptom badge.';
    case 'aborted':
      return '';
    default:
      return `Speech recognition error: ${code}`;
  }
}
