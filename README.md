# Diagnosix

**Diagnosix — 60 FPS Clinical Companion & Multilingual 3D Anatomical Twin**

A clinical companion for low/middle-income families: voice symptom dictation, dual-unit (mg/dL & mmol/L) Indian + global lab report OCR, a human-in-the-loop manual verification table, offline-first IndexedDB history, and emergency 108 dispatch — all rendered around a real-time 3D anatomical twin.

## Repository

- **https://github.com/saihitesh1448/Diagnosix.git**

## Live URL

- **https://diagnosix.vercel.app**

## Features

- **Voice dictation** — real-time Web Speech recognition in 8 languages (English India/US, Telugu, Hindi, and more), with symptom auto-detection from spoken keywords.
- **Dual-unit lab OCR** — parses Indian and global report formats (FBS, PPBS, S. Creatinine, PLT, HbA1c, lipid panel, TSH, bilirubin, BP, and more), converting mg/dL ↔ mmol/L automatically.
- **Human-in-the-loop verification table** — every reading is surfaced for explicit human confirmation before it is trusted; nothing is hallucinated.
- **Offline-first IndexedDB history** — symptom and lab data persists locally so the app remains usable without a connection.
- **Emergency 108 dispatch** — one-tap direct dialing (`tel:108`) and a printable 1-page doctor preparation summary.
- **3D anatomical twin** — 60 FPS Three.js twin with WebGL crash guards and a 2D canvas fallback, plus a medical hologram hero section with an optimized WebGL2 shader engine for low-RAM hardware.

## Team

- **Kamma Hitesh Rao** — Lead
- **Sri Harshith K**
- **Harsha Devarakonda**
- **Hemanth Reddy G**
- CMR Institute of Technology
