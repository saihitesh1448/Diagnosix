import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, Eye, EyeOff, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';
import { SupabaseAuthError } from '../lib/supabase';

type Step = 'signup' | 'verify' | 'login';
type AuthLang = 'en' | 'hi' | 'te';

/**
 * The auth screen carries its own tiny copy table instead of reusing
 * LanguageProvider: it renders *above* the app's providers, and its whole job is
 * to be readable in the language a first-time user actually speaks.
 */
const COPY: Record<AuthLang, Record<string, string>> = {
  en: {
    tagline: 'Your family’s health records, kept private.',
    signupTitle: 'Create your account',
    signupSubtitle: 'We email a 6-digit code to confirm it is really you.',
    email: 'Email',
    emailPlaceholder: 'you@gmail.com',
    password: 'Password',
    confirmPassword: 'Confirm password',
    passwordHint: 'At least 8 characters. It is never stored in this app.',
    sendCode: 'Email me a code',
    haveAccount: 'Already have an account? Sign in',
    verifyTitle: 'Check your email',
    verifySubtitle: 'Enter the 6-digit code we sent to',
    code: '6-digit code',
    verify: 'Verify and continue',
    resend: 'Send a new code',
    resendIn: 'Send a new code in {s}s',
    noAccount: 'New here? Create an account',
    loginTitle: 'Welcome back',
    loginSubtitle: 'Sign in to open your family’s records.',
    signIn: 'Sign in',
    privacy: 'Passwords are handled by the sign-in server and are never stored on this device.',
    working: 'Please wait…',
    needEmail: 'Please enter your email address.',
    needPassword: 'Your password needs at least 8 characters.',
    needMatch: 'The two passwords do not match.',
    needCode: 'Please enter the 6-digit code from your email.',
  },
  hi: {
    tagline: 'आपके परिवार के स्वास्थ्य रिकॉर्ड, पूरी तरह निजी।',
    signupTitle: 'अपना खाता बनाएं',
    signupSubtitle: 'यह पुष्टि करने के लिए कि यह वाकई आप हैं, हम ईमेल पर 6 अंकों का कोड भेजते हैं।',
    email: 'ईमेल',
    emailPlaceholder: 'you@gmail.com',
    password: 'पासवर्ड',
    confirmPassword: 'पासवर्ड दोबारा',
    passwordHint: 'कम से कम 8 अक्षर। यह इस ऐप में कभी सेव नहीं होता।',
    sendCode: 'मुझे कोड भेजें',
    haveAccount: 'खाता पहले से है? साइन इन करें',
    verifyTitle: 'अपना ईमेल देखें',
    verifySubtitle: 'हमने इस ईमेल पर भेजा 6 अंकों का कोड भरें:',
    code: '6 अंकों का कोड',
    verify: 'सत्यापित करें और आगे बढ़ें',
    resend: 'नया कोड भेजें',
    resendIn: 'नया कोड {s} सेकंड में',
    noAccount: 'नए हैं? खाता बनाएं',
    loginTitle: 'वापसी पर स्वागत है',
    loginSubtitle: 'अपने परिवार के रिकॉर्ड देखने के लिए साइन इन करें।',
    signIn: 'साइन इन',
    privacy: 'पासवर्ड साइन-इन सर्वर संभालता है; यह इस डिवाइस पर कभी सेव नहीं होता।',
    working: 'कृपया प्रतीक्षा करें…',
    needEmail: 'कृपया अपना ईमेल भरें।',
    needPassword: 'पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।',
    needMatch: 'दोनों पासवर्ड एक जैसे नहीं हैं।',
    needCode: 'कृपया ईमेल में आए 6 अंकों का कोड भरें।',
  },
  te: {
    tagline: 'మీ కుటుంబ ఆరోగ్య రికార్డులు, పూర్తిగా గోప్యంగా.',
    signupTitle: 'మీ ఖాతా సృష్టించండి',
    signupSubtitle: 'ఇది నిజంగా మీరే అని నిర్ధారించడానికి మేము ఇమెయిల్‌కు 6 అంకెల కోడ్ పంపుతాము.',
    email: 'ఇమెయిల్',
    emailPlaceholder: 'you@gmail.com',
    password: 'పాస్‌వర్డ్',
    confirmPassword: 'పాస్‌వర్డ్ మళ్లీ',
    passwordHint: 'కనీసం 8 అక్షరాలు. ఇది ఈ యాప్‌లో ఎప్పుడూ నిల్వ ఉండదు.',
    sendCode: 'నాకు కోడ్ పంపండి',
    haveAccount: 'ఖాతా ఉందా? సైన్ ఇన్ చేయండి',
    verifyTitle: 'మీ ఇమెయిల్ చూడండి',
    verifySubtitle: 'ఈ ఇమెయిల్‌కు పంపిన 6 అంకెల కోడ్ నమోదు చేయండి:',
    code: '6 అంకెల కోడ్',
    verify: 'ధృవీకరించి కొనసాగండి',
    resend: 'కొత్త కోడ్ పంపండి',
    resendIn: 'కొత్త కోడ్ {s} సెకన్లలో',
    noAccount: 'కొత్తవారా? ఖాతా సృష్టించండి',
    loginTitle: 'మళ్లీ స్వాగతం',
    loginSubtitle: 'మీ కుటుంబ రికార్డులు చూడటానికి సైన్ ఇన్ చేయండి.',
    signIn: 'సైన్ ఇన్',
    privacy: 'పాస్‌వర్డ్‌ను సైన్-ఇన్ సర్వర్ నిర్వహిస్తుంది; ఇది ఈ పరికరంలో ఎప్పుడూ నిల్వ ఉండదు.',
    working: 'దయచేసి వేచి ఉండండి…',
    needEmail: 'దయచేసి మీ ఇమెయిల్ నమోదు చేయండి.',
    needPassword: 'పాస్‌వర్డ్ కనీసం 8 అక్షరాలు ఉండాలి.',
    needMatch: 'రెండు పాస్‌వర్డ్‌లు ఒకటి కావు.',
    needCode: 'దయచేసి ఇమెయిల్‌లో వచ్చిన 6 అంకెల కోడ్ నమోదు చేయండి.',
  },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 30;
const LANGS: { id: AuthLang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'te', label: 'తెలుగు' },
];

const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-slate-900/70 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-60';

export function AuthScreen() {
  const { signUp, verifySignupOtp, resendSignupOtp, signIn } = useAuth();

  const [lang, setLang] = useState<AuthLang>('en');
  const [step, setStep] = useState<Step>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const t = useCallback((key: string, params?: Record<string, string>) => {
    const raw = COPY[lang][key] ?? COPY.en[key] ?? key;
    if (!params) return raw;
    return Object.entries(params).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), raw);
  }, [lang]);

  // Supabase rate-limits confirmation emails, so mirror that locally.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'verify') codeRef.current?.focus();
  }, [step]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof SupabaseAuthError ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSignup = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const address = email.trim();
      if (!EMAIL_PATTERN.test(address)) {
        setError(t('needEmail'));
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(t('needPassword'));
        return;
      }
      if (password !== confirm) {
        setError(t('needMatch'));
        return;
      }
      void run(async () => {
        const { needsVerification } = await signUp(address, password);
        setPassword('');
        setConfirm('');
        if (needsVerification) {
          setCode('');
          setStep('verify');
          setCooldown(RESEND_COOLDOWN_SECONDS);
        }
        // Otherwise email confirmation is disabled server-side and the new
        // session has already closed this screen.
      });
    },
    [confirm, email, password, run, signUp, t],
  );

  const handleVerify = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const token = code.replace(/\D/g, '');
      if (token.length !== 6) {
        setError(t('needCode'));
        return;
      }
      void run(async () => {
        await verifySignupOtp(email.trim(), token);
      });
    },
    [code, email, run, t, verifySignupOtp],
  );

  const handleResend = useCallback(() => {
    if (cooldown > 0) return;
    void run(async () => {
      await resendSignupOtp(email.trim());
      setCooldown(RESEND_COOLDOWN_SECONDS);
    });
  }, [cooldown, email, resendSignupOtp, run]);

  const handleLogin = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const address = email.trim();
      if (!EMAIL_PATTERN.test(address)) {
        setError(t('needEmail'));
        return;
      }
      if (password.length === 0) {
        setError(t('needPassword'));
        return;
      }
      void run(async () => {
        await signIn(address, password);
        setPassword('');
      });
    },
    [email, password, run, signIn, t],
  );

  const heading = useMemo(() => {
    if (step === 'verify') return t('verifyTitle');
    if (step === 'login') return t('loginTitle');
    return t('signupTitle');
  }, [step, t]);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#050811]">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="glass w-full max-w-md p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30">
                <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              </span>
              <div>
                <p className="text-base font-semibold text-slate-100 leading-tight">Diagnosix</p>
                <p className="text-[11px] text-slate-500">{t('tagline')}</p>
              </div>
            </div>
            <div className="flex gap-1" role="group" aria-label="Language">
              {LANGS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLang(option.id)}
                  aria-pressed={lang === option.id}
                  className={`px-2 py-1 rounded-lg text-[10px] transition-colors ${
                    lang === option.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-500 border border-transparent hover:text-slate-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <h1 className="text-lg font-semibold text-slate-100">{heading}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {step === 'verify' ? `${t('verifySubtitle')} ` : step === 'login' ? t('loginSubtitle') : t('signupSubtitle')}
              {step === 'verify' && <span className="text-slate-300 break-all">{email.trim()}</span>}
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-4 px-3 py-2 rounded-xl text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30">
              {error}
            </p>
          )}

          {step === 'signup' && (
            <form className="mt-4 flex flex-col gap-3" onSubmit={handleSignup} noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">{t('email')}</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className={inputClass}
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">{t('password')}</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${inputClass} pr-10`}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-500">{t('passwordHint')}</span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">{t('confirmPassword')}</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className={inputClass}
                  disabled={busy}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-600/90 hover:bg-cyan-500 text-white transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Mail className="w-4 h-4" aria-hidden="true" />}
                {busy ? t('working') : t('sendCode')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('login');
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 self-center"
              >
                {t('haveAccount')}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form className="mt-4 flex flex-col gap-3" onSubmit={handleVerify} noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">{t('code')}</span>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`${inputClass} tracking-[0.4em] text-center text-base`}
                  disabled={busy}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-600/90 hover:bg-cyan-500 text-white transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {busy ? t('working') : t('verify')}
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={busy || cooldown > 0}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 disabled:text-slate-600 self-center"
              >
                {cooldown > 0 ? t('resendIn', { s: String(cooldown) }) : t('resend')}
              </button>
            </form>
          )}

          {step === 'login' && (
            <form className="mt-4 flex flex-col gap-3" onSubmit={handleLogin} noValidate>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">{t('email')}</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className={inputClass}
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">{t('password')}</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${inputClass} pr-10`}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-600/90 hover:bg-cyan-500 text-white transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {busy ? t('working') : t('signIn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('signup');
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 self-center"
              >
                {t('noAccount')}
              </button>
            </form>
          )}

          <p className="mt-5 flex items-start gap-2 text-[10px] text-slate-500 border-t border-slate-800/80 pt-3">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/80 shrink-0 mt-px" aria-hidden="true" />
            {t('privacy')}
          </p>
        </div>
      </div>
    </div>
  );
}
