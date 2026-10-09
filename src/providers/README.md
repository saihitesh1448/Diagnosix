# providers/

React context providers that own Diagnosix runtime state.

## LanguageProvider

Single source of truth for the selected UI language and the BCP-47 tag used by speech recognition + speech synthesis.

Exports:
- `LanguageProvider` — wraps the app; owns `currentLang` state.
- `useLanguage()` — returns `{ currentLang, setCurrentLang, t, speechLang }`.
- `LANGUAGES` / `LANG_DEFS` — the language selector options, including `ttsTag` and a short note about voice-install requirements.
- `speechLangFor(langCode)` — currently the identity function; each `LangCode` already maps to its own BCP-47 tag.

Phrases are stored in `PHRASES` keyed by a dot-path like `symptomInput.header` and looked up by `currentLang`. Fallback chain is `currentLang → en-IN → key`.

 Telugu/Hindi UI is fully wired through this context. The audio storyteller bar uses `speechLang` for recognition and feeds the same tag into `speechSynthesis`; when a native voice for that tag is missing on the device, the bar falls back to an English voice and plays the English summary, with a visible note in the bar itself.

## DiagnosticsProvider

Owns one patient record at a time (the active family member, or the draft record before anyone is selected).

Exports:
- `DiagnosticsProvider`
- `useDiagnostics()` — returns readings, symptoms, alerts, focusOrgan, sex, criticalCount, reports, history, summaries, and the mutation API.

Key behaviors:
- Switching the active family member swaps the whole record; the symptom box, report panel, and verification table remount so a half-typed symptom or a mid-OCR scan cannot leak onto the next patient.
- `mergeReadings` appends trend points and keeps the newest value per marker; a human-verified value is never overwritten by an unverified machine parse.
- Alerts are derived from `deriveOrganAlerts(readings, symptoms, sex)` and are what light up the organ chips and the on-body red glow in the twin.

## FamilyProvider

Owns the family registry and which patient is active.

Exports:
- `FamilyProvider`
- `useFamily()` — returns members, activeId, activeMember, sessionId, addMember, selectMember, removeMember.

## Layout expectations

Layout mounts `LanguageProvider` high in the tree, then the `DiagnosticsProvider` inside it, with the `FamilyProvider` above that (check `src/App.tsx` for the current nesting). Components that care about language import from `LanguageProvider`; components that care about readings/alerts/symptoms import from `DiagnosticsProvider`.

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
