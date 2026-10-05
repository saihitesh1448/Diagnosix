import { useEffect, useRef, useCallback } from 'react';

interface BlackholeHeroSectionProps {
  hotColor?: string;
  midColor?: string;
  coolColor?: string;
  steps?: number;
  maxDpr?: number;
  resolution?: number;
  onReady?: () => void;
}

/**
 * Standalone WebGL2 "accretion/holographic" shader canvas.
 *
 * Kept intentionally simple so the hero runs at a stable 60 FPS on 4 GB RAM
 * devices: fixed step count, capped pixel ratio, and a runtime resolution
 * scalar that downscales the draw buffer on weak hardware.
 */
export function BlackholeHeroSection({
  hotColor = '#06b6d4',
  midColor = '#3b82f6',
  coolColor = '#0f172a',
  steps = 140,
  maxDpr = 1.25,
  resolution = 0.6,
  onReady,
}: BlackholeHeroSectionProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const runningRef = useRef(false);

  const color = useCallback(
    (hex: string) => {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      const full = h.padStart(6, '0');
      const r = parseInt(full.slice(0, 2), 16) / 255;
      const g = parseInt(full.slice(2, 4), 16) / 255;
      const b = parseInt(full.slice(4, 6), 16) / 255;
      return [r, g, b];
    },
    [],
  );

  const start = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, maxDpr);
    const w = Math.max(1, Math.floor(canvas.clientWidth * resolution * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * resolution * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = `${canvas.clientWidth}px`;
    canvas.style.height = `${canvas.clientHeight}px`;

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    const [hr, hg, hb] = color(hotColor);
    const [mr, mg, mb] = color(midColor);
    const [cr, cg, cb] = color(coolColor);

    const vs = `
          attribute vec2 a_pos;
          varying vec2 v_uv;
          void main(void) {
            v_uv = a_pos * 0.5 + 0.5;
            gl_Position = vec4(a_pos, 0.0, 1.0);
          }
        `;
    const fs = `
          precision highp float;
          varying vec2 v_uv;
          uniform vec3 u_hot;
          uniform vec3 u_mid;
          uniform vec3 u_cool;
          uniform float u_time;
          uniform float u_steps;

          vec3 palette(float t) {
            vec3 a = u_cool;
            vec3 b = u_mid;
            vec3 c = u_hot;
            vec3 d = vec3(0.5, 0.5, 0.5);
            return a + b * cos(6.28318 * (c * t + d));
          }

          void main(void) {
            vec2 uv = v_uv * 2.0 - 1.0;
            float aspect = max(1.0, float(${Math.round(w) / Math.round(h)}));
            vec2 p = uv * vec2(aspect, 1.0);

            float r = length(p);
            float angle = atan(p.y, p.x);

            float swirl = sin(r * 6.0 - u_time * 0.8) * 0.5 + 0.5;
            float rings = sin(r * u_steps * 0.15 - u_time * 1.2) * 0.5 + 0.5;
            float glow = exp(-r * 1.4) * 0.9 + 0.1;

            float t = angle * 0.15 + u_time * 0.05 + r * 0.4 + swirl * 0.5;
            vec3 col = palette(t);

            col = mix(col, u_hot, glow * 0.6);
            col += vec3(0.6, 0.8, 1.0) * rings * 0.25 * glow;
            col += u_hot * pow(glow, 2.0) * 0.5;

            float vignette = 1.0 - r * 0.55;
            col *= vignette;

            float alpha = smoothstep(0.0, 1.0, glow * 0.9 + rings * 0.2);
            gl_FragColor = vec4(col, alpha);
          }
        `;

    const vsSrc = gl.createShader(gl.VERTEX_SHADER);
    const fsSrc = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vsSrc || !fsSrc) return;

    gl.shaderSource(vsSrc, vs);
    gl.shaderSource(fsSrc, fs);
    gl.compileShader(vsSrc);
    gl.compileShader(fsSrc);

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vsSrc);
    gl.attachShader(program, fsSrc);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      // Silently no-op on unsupported hardware; parent renders the 2D fallback card.
      return;
    }

    programRef.current = program;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uHot = gl.getUniformLocation(program, 'u_hot');
    const uMid = gl.getUniformLocation(program, 'u_mid');
    const uCool = gl.getUniformLocation(program, 'u_cool');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uSteps = gl.getUniformLocation(program, 'u_steps');

    gl.uniform3f(uHot, hr, hg, hb);
    gl.uniform3f(uMid, mr, mg, mb);
    gl.uniform3f(uCool, cr, cg, cb);
    gl.uniform1f(uSteps, steps);

    const resize = () => {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw === 0 || ch === 0) return;
      const nw = Math.max(1, Math.floor(cw * resolution * dpr));
      const nh = Math.max(1, Math.floor(ch * resolution * dpr));
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
        gl.viewport(0, 0, nw, nh);
      }
    };

    const loop = (now: number) => {
      if (!runningRef.current) return;
      rafRef.current = requestAnimationFrame(loop);
      timeRef.current = now * 0.001;
      if (!programRef.current) return;
      gl.useProgram(programRef.current);
      if (uTime) gl.uniform1f(uTime, timeRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    resize();
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(loop);
    onReady?.();

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            resize();
          })
        : null;
    observer?.observe(canvas);
    window.addEventListener('resize', resize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [color, hotColor, midColor, coolColor, steps, maxDpr, resolution, onReady]);

  useEffect(() => {
    let teardown: (() => void) | undefined;

    // WebGL setup is synchronous, but we keep the shape async so callers can
    // await a stable "ready" signal from the parent if they want it.
    const cleanup = start();
    if (cleanup && typeof cleanup === 'function') teardown = cleanup;

    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (programRef.current) {
        try {
          const gl = canvasRef.current?.getContext('webgl2');
          if (gl) gl.deleteProgram(programRef.current);
        } catch {
          /* best-effort */
        }
        programRef.current = null;
      }
      if (teardown && typeof teardown === 'function') teardown();
    };
  }, [start]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
      aria-hidden="true"
    />
  );
}
