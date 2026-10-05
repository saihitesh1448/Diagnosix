import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, Upload, Phone, Brain, Heart } from 'lucide-react';
import { BlackholeHeroSection } from './blackhole-hero-section';

interface MedicalHologramHeroProps {
  hotColor?: string;
  midColor?: string;
  coolColor?: string;
  onSpeak?: () => void;
  onUpload?: () => void;
  onEmergency?: () => void;
}

export function MedicalHologramHero({
  hotColor = '#06b6d4',
  midColor = '#3b82f6',
  coolColor = '#0f172a',
  onSpeak,
  onUpload,
  onEmergency,
}: MedicalHologramHeroProps = {}) {
  const [ready, setReady] = useState(false);
  const [glowPulse, setGlowPulse] = useState(0);
  const pulseRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      pulseRef.current = (pulseRef.current + 1) % 60;
      setGlowPulse(pulseRef.current / 60);
    }, 32);
    return () => clearInterval(id);
  }, []);

  const scrollToSpeak = useCallback(() => {
    onSpeak?.();
    const target = document.getElementById('symptom-input-anchor');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [onSpeak]);

  const openUpload = useCallback(() => {
    onUpload?.();
    const target = document.getElementById('report-ingestion-anchor');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [onUpload]);

  const openEmergency = useCallback(() => {
    onEmergency?.();
  }, [onEmergency]);

  return (
    <section
      className="relative relative overflow-hidden border-b border-slate-800/60"
      style={{ backgroundColor: coolColor, minHeight: '420px' }}
    >
      {/* Optimized WebGL2 holographic accretion background */}
      <div
        className="absolute inset-0 w-full h-full overflow-hidden"
        aria-hidden="true"
      >
        <BlackholeHeroSection
          hotColor={hotColor}
          midColor={midColor}
          coolColor={coolColor}
          steps={140}
          maxDpr={1.25}
          resolution={0.6}
          onReady={() => setReady(true)}
        />
        {/* Extra cyan bloom so the hero reads even if the shader no-ops on weak GPUs */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              `radial-gradient(120% 120% at 50% 40%, rgba(6,182,212,${0.10 + glowPulse * 0.06}) 0%, transparent 60%)`,
          }}
        />
      </div>

      {/* Floating holographic anatomical cranium + biosignal insignia */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 pt-16 pb-10 text-center">
        <div className="relative flex items-center justify-center mb-5">
          {/* Holographic cranium insignia */}
          <div
            className="relative w-24 h-24 sm:w-28 sm:h-28"
            style={{
              filter: 'drop-shadow(0 0 18px rgba(6,182,212,0.55))',
            }}
          >
            {/* Orbiting ring */}
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 w-full h-full animate-spin-slow"
              style={{ animationDuration: '18s', willChange: 'transform' }}
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke={hotColor}
                strokeWidth="1"
                opacity="0.55"
              />
              <ellipse
                cx="50"
                cy="50"
                rx="46"
                ry="18"
                fill="none"
                stroke={midColor}
                strokeWidth="1"
                opacity="0.45"
                transform="rotate(20 50 50)"
              />
            </svg>

            {/* Cranium */}
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 w-full h-full"
              aria-hidden="true"
            >
              {/* Brain silhouette */}
              <path
                d="M50 22
                   C33 22, 20 34, 20 49
                   C20 63, 31 73, 50 73
                   C69 73, 80 63, 80 49
                   C80 34, 67 22, 50 22 Z
                   M50 30
                   C40 30, 33 37, 33 46
                   C33 54, 40 60, 50 60
                   C60 60, 67 54, 67 46
                   C67 37, 60 30, 50 30 Z"
                fill={hotColor}
                opacity="0.9"
              />
              {/* Sulcus hints */}
              <path
                d="M50 32 L50 58 M38 42 Q50 46 62 42 M38 50 Q50 54 62 50"
                stroke={coolColor}
                strokeWidth="1.2"
                fill="none"
                opacity="0.7"
              />
              {/* Eyes */}
              <circle cx="39" cy="42" r="2.4" fill={coolColor} />
              <circle cx="61" cy="42" r="2.4" fill={coolColor} />
            </svg>

            {/* Floating biosignal pulse dots */}
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse"
                style={{ animationDelay: '120ms' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse"
                style={{ animationDelay: '240ms' }}
              />
            </div>

            {/* Scanning line */}
            <div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
              style={{
                top: '32%',
                boxShadow: `0 0 6px ${hotColor}`,
                animation: 'scan 3.2s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        <div className="max-w-xl">
          <p
            className="text-xs font-mono tracking-widest uppercase text-cyan-200/80 mb-2"
            style={{ letterSpacing: '0.2em' }}
          >
            Clinical Companion
          </p>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white leading-tight"
            style={{ textShadow: '0 0 18px rgba(6,182,212,0.4)' }}
          >
            Diagnosix
          </h1>
          <p className="mt-3 text-sm text-slate-300/90 leading-relaxed max-w-lg mx-auto">
            60 FPS 3D anatomical twin for the whole family — voice symptoms,
            dual-unit lab scans, and emergency dispatch when it matters most.
          </p>
        </div>

        {/* Interactive action triggers */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* 🎙️ Speak Symptoms */}
          <button
            type="button"
            onClick={scrollToSpeak}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600/20 border border-cyan-400/50 text-sm font-medium text-cyan-100 hover:bg-cyan-500/30 hover:border-cyan-300/70 transition-colors shadow-[0_0_18px_0_rgba(6,182,212,0.2)]"
          >
            <Mic className="w-4 h-4" />
            Speak Symptoms
          </button>

          {/* 📊 Upload Lab Scan */}
          <button
            type="button"
            onClick={openUpload}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-600/60 text-sm font-medium text-slate-200 hover:bg-slate-700/80 hover:border-slate-500/70 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Lab Scan
          </button>

          {/* 📞 108 Emergency */}
          <button
            type="button"
            onClick={openEmergency}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-900/40 border border-red-700/50 text-sm font-medium text-red-200 hover:bg-red-900/60 hover:border-red-600/70 transition-colors shadow-[0_0_18px_0_rgba(220,38,38,0.25)]"
          >
            <Phone className="w-4 h-4" />
            108 Emergency
          </button>
        </div>

        {/* Subtle clinical status line */}
        <div className="mt-6 flex items-center gap-4 text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {ready ? 'hologram live' : 'initializing'}
          </span>
          <span className="flex items-center gap-1.5">
            <Heart className="w-3 h-3 text-cyan-400" />
            dual-unit ready
          </span>
          <span className="flex items-center gap-1.5">
            <Brain className="w-3 h-3 text-slate-400" />
            8-language voice
          </span>
        </div>
      </div>

      {/* Bottom fade into the body of the app */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(15,23,42,0.95) 70%, rgba(15,23,42,1))',
        }}
        aria-hidden="true"
      />

      {/* Prevent FOUC-style paint flicker on very low-RAM devices */}
      {!ready && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(80% 60% at 50% 40%, rgba(6,182,212,0.18), transparent 70%)`,
          }}
          aria-hidden="true"
        />
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { top: 28%; opacity: 0.0; }
          30% { opacity: 1.0; }
          55% { top: 66%; opacity: 1.0; }
          80%, 100% { opacity: 0.0; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow linear infinite;
        }
      `}</style>
    </section>
  );
}
