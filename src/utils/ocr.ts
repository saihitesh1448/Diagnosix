/**
 * Text extraction adapters.
 *
 * - Images  -> lazily loaded tesseract.js worker (kept out of the initial
 *              bundle so low-RAM phones never pay for OCR unless they use it).
 * - PDFs    -> the embedded text layer is decoded with the platform's own
 *              `DecompressionStream`, so no PDF library and no extra RAM.
 *
 * A scanned PDF with no text layer legitimately returns `no-text`; the UI then
 * routes the user to manual entry rather than inventing values.
 */

export type ExtractionFailure =
  | 'engine-unavailable'
  | 'no-text'
  | 'failed'
  | 'unsupported-type';

export interface ExtractionResult {
  ok: boolean;
  text: string;
  /** tesseract mean confidence 0-100; null for PDF text layers. */
  confidence: number | null;
  reason?: ExtractionFailure;
  detail?: string;
}

export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.webp', '.bmp'];

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return true;
  if (file.type === 'application/pdf') return true;
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function extractTextFromFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ExtractionResult> {
  if (!isAcceptedFile(file)) {
    return { ok: false, text: '', confidence: null, reason: 'unsupported-type' };
  }
  if (isPdf(file)) return extractTextFromPdf(file);
  return extractTextFromImage(file, onProgress);
}

/* -------------------------------------------------------------------------- */
/* Images — tesseract.js, loaded on demand                                     */
/* -------------------------------------------------------------------------- */

export async function extractTextFromImage(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<ExtractionResult> {
  let worker: { recognize: (input: unknown) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> } | null = null;
  try {
    const mod = await import('tesseract.js');
    const createWorker = (mod as { createWorker?: unknown }).createWorker;
    if (typeof createWorker !== 'function') {
      return { ok: false, text: '', confidence: null, reason: 'engine-unavailable' };
    }
    const create = createWorker as (
      langs: string,
      oem?: number,
      options?: Record<string, unknown>,
    ) => Promise<typeof worker>;

    worker = await create('eng', 1, {
      logger: (message: { status?: string; progress?: number }) => {
        if (onProgress && message.progress !== undefined) {
          onProgress(Math.min(1, Math.max(0, message.progress)));
        }
      },
    });
    if (!worker) {
      return { ok: false, text: '', confidence: null, reason: 'engine-unavailable' };
    }

    const result = await worker.recognize(file);
    const text = (result?.data?.text ?? '').trim();
    const confidence = typeof result?.data?.confidence === 'number' ? result.data.confidence : null;

    if (!text) {
      return { ok: false, text: '', confidence, reason: 'no-text' };
    }
    if (onProgress) onProgress(1);
    return { ok: true, text, confidence };
  } catch (error) {
    return {
      ok: false,
      text: '',
      confidence: null,
      reason: 'engine-unavailable',
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* worker teardown is best-effort */
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* PDFs — text layer only, decoded with DecompressionStream                    */
/* -------------------------------------------------------------------------- */

export async function extractTextFromPdf(file: File): Promise<ExtractionResult> {
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const text = await readPdfText(buffer);
    const cleaned = text.trim();
    if (!cleaned) {
      return { ok: false, text: '', confidence: null, reason: 'no-text' };
    }
    return { ok: true, text: cleaned, confidence: null };
  } catch (error) {
    return {
      ok: false,
      text: '',
      confidence: null,
      reason: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readPdfText(buffer: Uint8Array): Promise<string> {
  const latin = latin1(buffer);
  const chunks: string[] = [];

  // Uncompressed content streams are usable as-is.
  for (const match of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = match[1];
    if (/BT[\s\S]*?Tj|BT[\s\S]*?TJ/.test(raw)) chunks.push(raw);
  }

  // Flate-compressed streams: inflate with the platform's own decoder.
  const flate = await inflateFlateStreams(buffer);
  for (const stream of flate) {
    if (/BT[\s\S]*?Tj|BT[\s\S]*?TJ/.test(stream)) chunks.push(stream);
  }

  const textParts: string[] = [];
  for (const chunk of chunks) {
    for (const literal of chunk.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) {
      textParts.push(decodePdfLiteral(literal[0].replace(/\s*Tj$/, '')));
    }
    for (const array of chunk.matchAll(/\[((?:[^\][]|\\.)*)\]\s*TJ/g)) {
      const inner = array[1];
      let line = '';
      for (const piece of inner.matchAll(/\((?:\\.|[^\\()])*\)|-?\d+(?:\.\d+)?/g)) {
        if (piece[0].startsWith('(')) {
          line += decodePdfLiteral(piece[0]);
        } else if (Number(piece[0]) <= -180) {
          line += ' ';
        }
      }
      if (line.trim()) textParts.push(line);
    }
    if (/'|"|T\*/.test(chunk)) textParts.push('\n');
  }

  return textParts
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ');
}

async function inflateFlateStreams(buffer: Uint8Array): Promise<string[]> {
  if (typeof DecompressionStream !== 'function') return [];
  const latin = latin1(buffer);
  const results: string[] = [];
  const streamStarts: number[] = [];

  for (const match of latin.matchAll(/stream\r?\n/g)) {
    if (match.index !== undefined) streamStarts.push(match.index + match[0].length);
  }

  for (const start of streamStarts) {
    const end = latin.indexOf('endstream', start);
    if (end < 0) continue;
    let sliceEnd = end;
    while (sliceEnd > start && (buffer[sliceEnd - 1] === 0x0a || buffer[sliceEnd - 1] === 0x0d)) {
      sliceEnd -= 1;
    }
    const compressed = buffer.slice(start, sliceEnd);
    if (compressed.length < 8 || compressed[0] !== 0x78) continue; // zlib magic
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
      const infl = latin1(new Uint8Array(await new Response(stream).arrayBuffer()));
      results.push(infl);
    } catch {
      /* not a readable flate stream — skip silently, never guess */
    }
  }
  return results;
}

function decodePdfLiteral(token: string): string {
  const body = token.startsWith('(') ? token.slice(1, -1) : token;
  return body
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, code: string) => String.fromCharCode(parseInt(code, 8)));
}

function latin1(buffer: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    out += String.fromCharCode(...buffer.subarray(i, Math.min(i + CHUNK, buffer.length)));
  }
  return out;
}
