/**
 * Zero-dependency image legibility gate.
 *
 * Everything here is measured from the actual uploaded pixels — nothing is
 * inferred or assumed. The numbers feed `ReportIngestion`'s decision to either
 * attempt OCR or push the user straight to manual entry.
 */

export interface ImageQuality {
  /** Mean luminance, 0 (black) to 1 (white). */
  brightness: number;
  /** Normalised luminance spread, 0 (flat) to 1 (full dynamic range). */
  contrast: number;
  /** Normalised Laplacian variance — drops sharply on motion blur / defocus. */
  sharpness: number;
  /**
   * Share of pixels that are deep-shadow or blown-out. A faded thermal print or
   * a watermarked scan pushes this up.
   */
  clippedRatio: number;
  /** Weighted 0-1 legibility score. */
  score: number;
  verdict: 'clear' | 'unclear';
  /** Human-readable reasons, used verbatim in the tri-lingual alert modal. */
  issues: string[];
}

export const QUALITY_THRESHOLD = 0.6;

const MAX_SAMPLE_EDGE = 700;

interface LumaSample {
  data: Float32Array;
  width: number;
  height: number;
}

async function decodeToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  return canvas;
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image decode failed'));
      element.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toLuma(canvas: HTMLCanvasElement): LumaSample {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    luma[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  }
  return { data: luma, width, height };
}

/** Variance of the 4-neighbour Laplacian — the classic blur metric. */
function laplacianVariance(sample: LumaSample): number {
  const { data, width, height } = sample;
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const lap =
        4 * data[idx] -
        data[idx - 1] -
        data[idx + 1] -
        data[idx - width] -
        data[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return Math.max(0, sumSq / count - mean * mean);
}

export async function analyseImageQuality(file: File): Promise<ImageQuality> {
  const canvas = await decodeToCanvas(file);
  const sample = toLuma(canvas);
  const { data } = sample;

  let sum = 0;
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    sum += value;
    sumSq += value * value;
    if (value < 0.06 || value > 0.96) clipped += 1;
  }
  const count = data.length || 1;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const stdDev = Math.sqrt(variance);
  const clippedRatio = clipped / count;

  const lapVar = laplacianVariance(sample);

  const brightness = clamp01(mean);
  const contrast = clamp01(stdDev / 0.28);
  const sharpness = clamp01(lapVar / 0.012);
  const toneBalance = 1 - clamp01(Math.abs(mean - 0.62) / 0.5);

  const score = clamp01(
    0.32 * sharpness + 0.32 * contrast + 0.21 * brightness + 0.15 * toneBalance,
  );

  const issues: string[] = [];
  if (sharpness < 0.35) issues.push('The photo looks blurry or out of focus.');
  if (contrast < 0.35) issues.push('The paper has very low contrast (faded print).');
  if (brightness < 0.22) issues.push('The photo is too dark / poorly lit.');
  if (brightness > 0.94) issues.push('The photo is over-exposed (glare or flash wash-out).');
  if (clippedRatio > 0.55) issues.push('A large part of the page is unreadable shadow or glare.');

  return {
    brightness,
    contrast,
    sharpness,
    clippedRatio,
    score,
    verdict: score >= QUALITY_THRESHOLD ? 'clear' : 'unclear',
    issues,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
