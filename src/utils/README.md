# utils/

Shared helpers consumed by the Diagnosix React app.

## reportParser.ts

Central registry of biomarkers, reference ranges, and the alert-derivation logic.

### Things this module owns

- `BIOMARKERS` — full descriptor list (id, label, unit, sex-specific ranges).
- `MARKER_BY_ID` — id → descriptor lookup.
- `parseReportText(text, opts)` — turns a pasted/OCR'd lab report into `ParsedReading[]`.
- `deriveOrganAlerts(readings, symptoms, sex)` — maps values + symptoms onto `OrganAlert[]`.
- `rangeFor(marker, sex)` — picks the right reference interval for a reading.

### Notes

- Ranges are adult reference intervals; values are normalized to a single canonical unit before being stored.
- The alert layer is what drives the organ chips in Layout and the on-body red glow in the twin.

## storage.ts

Tiny localStorage wrapper used by `FamilyProvider` and `DiagnosticsProvider`.

- `loadJson<T>(key, fallback)` — reads and parses one JSON document.
- `saveJson(key, value)` — writes one JSON document.

Keys used in this app: `members`, `activeId`, `patients`.

## imageQuality.ts

Legibility pre-check for uploaded scans/photos.

- `QUALITY_THRESHOLD` — safety floor; below it, OCR is skipped.
- `analyseImageQuality(file)` → `{ score, contrast, sharpness, brightness, verdict, issues }`.

## ocr.ts

Text extraction from accepted files (JPG/PNG/PDF).

- `ACCEPTED_EXTENSIONS` — file types the drop zone accepts.
- `isAcceptedFile(file)`, `isPdf(file)` — file-type guards.
- `extractTextFromFile(file, progress)` — runs OCR/Tika and returns `{ ok, confidence, text, reason }`.

## reportParser.ts is the module the rest of the app leans on for marker metadata, parsing, and alerting. Read it first if you touch biomarker ranges, parsing, or the organ-alert logic.
