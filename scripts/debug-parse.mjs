import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const outDir = mkdtempSync(join(tmpdir(), 'diagnosix-debug-'));
const outFile = join(outDir, 'parser.mjs');
await esbuild.build({
  entryPoints: ['src/utils/reportParser.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: outFile,
  logLevel: 'warning',
});
const { parseReportText } = await import(pathToFileURL(outFile).href);

const text = `LDL Cholesterol 186 mg/dL
HbA1c 9.2 %
Fasting Blood Sugar 268 mg/dL
S. Creatinine 2.6 mg/dL
Platelet Count 38000 /mcL
Blood Pressure 190/125 mmHg`;

for (const reading of parseReportText(text, { sex: 'male' })) {
  console.log(
    `${reading.id.padEnd(18)} value=${String(reading.value).padStart(8)} unit=${reading.unit.padEnd(8)} conf=${reading.confidence.padEnd(10)} :: ${reading.evidence}`,
  );
}

rmSync(outDir, { recursive: true, force: true });
