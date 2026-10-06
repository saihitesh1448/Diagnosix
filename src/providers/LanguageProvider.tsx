import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export type LangCode = 'en-IN' | 'te-IN' | 'hi-IN' | 'en-US';

export interface LanguageContextValue {
  currentLang: LangCode;
  setCurrentLang: (lang: LangCode) => void;
  t: (key: string, fallback?: string, params?: Record<string, string>) => string;
  /** BCP-47 tag used by the speech recogniser (hi-IN / te-IN / en-IN). */
  speechLang: string;
}

const PHRASES: Record<string, Record<LangCode, string>> = {
  // ---- SymptomInput ----
  'symptomInput.header':
    { 'en-IN': 'Symptoms — Speak or Tap', 'hi-IN': 'लक्षण — बोलें या चुनें', 'te-IN': 'లక్షణాలు — మాట్లాడండి లేదా ఎంచుకోండి', 'en-US': 'Symptoms — Speak or Tap' },
  'symptomInput.subtitle':
    { 'en-IN': 'Voice is transcribed live. Tip badges are coloured by what you report.', 'hi-IN': 'अपनी आवाज से लक्षण बताएं। नीचे दिए गए बटन आपकी रिपोर्ट के अनुसार रंग बदलेंगे।', 'te-IN': 'మీ స్వరం నిజ సమయంలో ట్రాన్స్క్రైబ్ అవుతుంది. మీరు నివేదించినదానికి అనుగుణంగా బેడ్జెస్ రంగులు మారుతాయి.', 'en-US': 'Voice is transcribed live. Tip badges are coloured by what you report.' },
  'symptomInput.placeholder':
    { 'en-IN': 'Type or speak the symptoms in your own words…', 'hi-IN': 'माइक दबाएं और बताएं कि आपको क्या महसूस हो रहा है — जैसे “सुबह से बुखार और खांसी है”…', 'te-IN': 'మైక్ మీద క్లిక్ చేసి మీకు ఏ లక్షణాలు ఉన్నాయో చెప్పండి — ఉదాహరణకు “ఉదయం నుండి జ్వరం, దగ్గు”…', 'en-US': 'Type or speak the symptoms in your own words…' },
  'symptomInput.micPrompt':
    { 'en-IN': 'Tap the mic and describe how you feel — “chest pain since morning”.', 'hi-IN': 'माइक दबाएं और बताएं कि आपको क्या महसूस हो रहा है — जैसे “सुबह से सीने में दर्द”।', 'te-IN': 'మైక్ మీద క్లిక్ చేసి మీకు ఏ లక్షణాలు ఉన్నాయో చెప్పండి — ఉదాహరణకు “ఉదయం నుండి సిరలుగా ఉన్న మీ ఊపిరితిత్తులు”', 'en-US': 'Tap the mic and describe how you feel — “chest pain since morning”.' },
  'symptomInput.noEngine':
    { 'en-IN': 'This browser has no speech engine. Type below or tap a symptom badge.', 'hi-IN': 'इस ब्राउज़र में स्पीच इंजन नहीं है। नीचे टाइप करें या लक्षण बैज चुनें।', 'te-IN': 'ఈ బ్రౌజర్‌లో స్పీచ్ ఇంజన్ లేదు. కింద టైప్ చేయండి లేదా లక్షణ బેડ్జ్‌ను ఎంచుకోండి.', 'en-US': 'This browser has no speech engine. Type below or tap a symptom badge.' },
  'symptomInput.autoDetected':
    { 'en-IN': 'Auto-detected from your words:', 'hi-IN': 'आपकी बातों से स्वतः पहचाना गया:', 'te-IN': 'మీ మాటల నుండి స్వయంచాలకంగా గుర్తించబడింది:', 'en-US': 'Auto-detected from your words:' },
  'symptomInput.removeHint':
    { 'en-IN': '— tap a badge again to remove it.', 'hi-IN': '— हटाने के लिए बैज को फिर से टैप करें।', 'te-IN': '— తొలగించడానికి బேడ్జ్‌ను మళ్లీ ట్యాప్ చేయండి.', 'en-US': '— tap a badge again to remove it.' },
  'symptomInput.quickSelect':
    { 'en-IN': 'Quick select', 'hi-IN': 'त्वरित चयन', 'te-IN': 'త్వరగా ఎంచుకోవడం', 'en-US': 'Quick select' },
  'symptomInput.active':
    { 'en-IN': '{n} active', 'hi-IN': '{n} सक्रिय', 'te-IN': '{n} సక్రియంగా ఉన్నాయి', 'en-US': '{n} active' },
  'symptomInput.clearTitle':
    { 'en-IN': 'Clear symptoms', 'hi-IN': 'लक्षण साफ़ करें', 'te-IN': 'లక్షణాలన్నింటినీ తొలగించు', 'en-US': 'Clear symptoms' },

  // ---- Symptom badges ----
  'badge.chest':
    { 'en-IN': 'Chest Discomfort / Heart Palpitations', 'hi-IN': 'छाती में दर्द / दिल की धड़कन तेज़', 'te-IN': 'వడపోటు లేదా గుండె స్పందన తీవ్రంగా ఉంది', 'en-US': 'Chest Discomfort / Heart Palpitations' },
  'badge.dizziness':
    { 'en-IN': 'Extreme Dizziness / Fainting', 'hi-IN': 'चक्कर आना / बेहोशी', 'te-IN': 'తీవ్ర తలనొప్పి లేదా అస్థి పడటం', 'en-US': 'Extreme Dizziness / Fainting' },
  'badge.thirst':
    { 'en-IN': 'Excessive Thirst & Frequent Urination', 'hi-IN': 'अत्यधिक प्यास और बार-बार पेशाब', 'te-IN': 'ఎక్కువ దాహం మరియు తరచు మూత్రమోచన', 'en-US': 'Excessive Thirst & Frequent Urination' },
  'badge.swelling':
    { 'en-IN': 'Swollen Legs & Ankles', 'hi-IN': 'पैरों और टखनों में सूजन', 'te-IN': 'కాళ్లు మరియు తొండాలు పొడిపోవడం', 'en-US': 'Swollen Legs & Ankles' },
  'badge.breath':
    { 'en-IN': 'Shortness of Breath', 'hi-IN': 'सांस लेने में तकलीफ', 'te-IN': 'ఊపిరితిత్తులు పీల్చుటలో ఇబ్బంది', 'en-US': 'Shortness of Breath' },

  // ---- ReportIngestion ----
  'reportIngestion.header':
    { 'en-IN': 'Lab Report — Photo, PDF or Paste', 'hi-IN': 'लैब रिपोर्ट — फ़ोटो, PDF या पेस्ट करें', 'te-IN': 'ల్యాబ్ రిపోర్ట్ — ఫోటో, PDF లేదా పేస్ట్ చేయండి', 'en-US': 'Lab Report — Photo, PDF or Paste' },
  'reportIngestion.subtitle':
    { 'en-IN': 'Indian formats (FBS, PPBS, S. Creatinine, PLT) and international ones are both understood. Blurry scans are rejected instead of guessed.', 'hi-IN': 'भारतीय प्रारूप (FBS, PPBS, S. Creatinine, PLT) और अंतर्राष्ट्रीय दोनों समझे जाते हैं। धुंधले स्कैन को अनुमान लगाने के बजाय अस्वीकार कर दिया जाता है।', 'te-IN': 'భారతీయ ఫార్మాట్స్ (FBS, PPBS, S. Creatinine, PLT) మరియు అంతర్జాతీయ వాటిలో రెండూ అర్థమయ్యేలా ఉంటాయి. మసకల్ చిత్రాలను అంచనా వేయకుండా నిరోధిస్తారు.', 'en-US': 'Indian formats (FBS, PPBS, S. Creatinine, PLT) and international ones are both understood. Blurry scans are rejected instead of guessed.' },
  'reportIngestion.dropHint':
    { 'en-IN': 'Drag & drop a JPG / PNG / PDF, or choose a source:', 'hi-IN': 'JPG / PNG / PDF को drag करें या स्रोत चुनें:', 'te-IN': 'JPG / PNG / PDF ను drag & drop చేసి లేదా మూలాన్ని ఎంచుకోండి:', 'en-US': 'Drag & drop a JPG / PNG / PDF, or choose a source:' },
  'reportIngestion.chooseFile':
    { 'en-IN': 'Choose file', 'hi-IN': 'फ़ाइल चुनें', 'te-IN': 'ఫైల్ ఎంచుకోండి', 'en-US': 'Choose file' },
  'reportIngestion.cameraCapture':
    { 'en-IN': 'Camera capture', 'hi-IN': 'कैमरा से फोटो लें', 'te-IN': 'క్యామెరా ద్వారా ఫోటో తీసుకోండి', 'en-US': 'Camera capture' },
  'reportIngestion.pasteDisclosure':
    { 'en-IN': 'Report text received on WhatsApp / printout? Paste it instead', 'hi-IN': 'WhatsApp / प्रिंटआउट पर रिपोर्ट टेक्स्ट मिला? इसके बजाय पेस्ट करें', 'te-IN': 'WhatsApp / ప్రింట్‌ఆఉట్‌లో రిపోర్ట్ టెక్స్ట్ అందుబాటులో ఉందా? దానిని పేస్ట్ చేయండి', 'en-US': 'Report text received on WhatsApp / printout? Paste it instead' },
  'reportIngestion.parsePasted':
    { 'en-IN': 'Parse pasted text', 'hi-IN': 'पेस्ट किया टेक्स्ट पार्स करें', 'te-IN': 'పేస్ట్ చేసిన టెక్స్ట్ ను పార్స్ చేయండి', 'en-US': 'Parse pasted text' },

  // ---- Biomarker table ----
  'biomarkerTable.header':
    { 'en-IN': 'Verify Every Value', 'hi-IN': 'हर मान की जांच करें', 'te-IN': 'ప్రతి విలువను నిరీక్షించండి', 'en-US': 'Verify Every Value' },
  'biomarkerTable.subtitle':
    { 'en-IN': 'Faded or misread print? Tap a row and type the correct number from your paper report.', 'hi-IN': 'फीका या गलत प्रिंट? किसी भी पंक्ति को टैप करें और कागज़ की रिपोर्ट से सही संख्या टाइप करें।', 'te-IN': 'ఫీడ్ అయిన లేదా తప్పు ప్రింట్? ఏదైనా వరుసను ట్యాప్ చేసి మీ కాగిత రిపోర్ట్ నుండి సరిగ్గా సంఖ్యను టైప్ చేయండి.', 'en-US': 'Faded or misread print? Tap a row and type the correct number from your paper report.' },
  'biomarkerTable.zeroValues':
    { 'en-IN': 'No values yet. Upload a report, or press “Add missing markers” to key in numbers from the paper printout.', 'hi-IN': 'अभी कोई मान नहीं। रिपोर्ट अपलोड करें, या कागज़ की प्रिन्टआउट से संख्या डालने के लिए “Add missing markers” दबाएं।', 'te-IN': 'ఇప్పటికీ ఏ విలువలు లేవు. రిపోర్ట్ అప్‌లోడ్ చేయండి, లేదా కాగిత రిపోర్ట్ నుండి సంఖ్యలు ఇవ్వడానికి “Add missing markers” క్లిక్ చేయండి.', 'en-US': 'No values yet. Upload a report, or press “Add missing markers” to key in numbers from the paper printout.' },
  'biomarkerTable.withValues':
    { 'en-IN': 'with values', 'hi-IN': 'मानों के साथ', 'te-IN': 'విలువలతో', 'en-US': 'with values' },
  'biomarkerTable.addMissing':
    { 'en-IN': 'Add missing markers', 'hi-IN': 'छूटे हुए मार्कर जोड़ें', 'te-IN': 'లోపించిన మార్కర్లు చేర్చండి', 'en-US': 'Add missing markers' },
  'biomarkerTable.thBiomarker':
    { 'en-IN': 'Biomarker', 'hi-IN': 'बायोमार्कर', 'te-IN': 'బయోమార్కర్', 'en-US': 'Biomarker' },
  'biomarkerTable.thValue':
    { 'en-IN': 'Detected Value', 'hi-IN': 'मापा गया मान', 'te-IN': 'గుర్తించబడిన విలువ', 'en-US': 'Detected Value' },
  'biomarkerTable.thRange':
    { 'en-IN': 'Reference Range', 'hi-IN': 'संदर्भ सीमा', 'te-IN': 'ఉత్తర్వు పరిధి', 'en-US': 'Reference Range' },
  'biomarkerTable.thStatus':
    { 'en-IN': 'Status', 'hi-IN': 'स्थिति', 'te-IN': 'స్థితి', 'en-US': 'Status' },
  'biomarkerTable.thEdit':
    { 'en-IN': 'Edit', 'hi-IN': 'संपादित करें', 'te-IN': 'సవరించు', 'en-US': 'Edit' },
  'biomarkerTable.enteredByYou':
    { 'en-IN': 'entered by you', 'hi-IN': 'आपके द्वारा दर्ज', 'te-IN': 'మీరు నమోదు చేశారు', 'en-US': 'entered by you' },
  'biomarkerTable.readFromReport':
    { 'en-IN': 'read from report · {conf}', 'hi-IN': 'रिपोर्ट से पढ़ा · {conf}', 'te-IN': 'నివేదిక నుండి చదవబడింది · {conf}', 'en-US': 'read from report · {conf}' },
  'biomarkerTable.notEntered':
    { 'en-IN': '— not entered —', 'hi-IN': '— दर्ज नहीं किया —', 'te-IN': '— నమోదు చేయలేదు —', 'en-US': '— not entered —' },
  'biomarkerTable.rangesNote':
    { 'en-IN': 'Ranges are adult reference intervals. Values are converted to a single canonical unit (mg/dL, %, g/dL, /mcL, uIU/mL, mmHg) so Indian and international printouts stay comparable.', 'hi-IN': 'सीमाएं वयस्क संदर्भ अंतराल हैं। मान एक ही मानक यूनिट (mg/dL, %, g/dL, /mcL, uIU/mL, mmHg) में बदले जाते हैं ताकि भारतीय और अंतर्राष्ट्रीय प्रिंटआउट तुलनीय रहें।', 'te-IN': 'పరిధులు ప్రాప్తవయస్కుల రెఫరెన్స్ ఇంటర్వల్స్. విలువలు ఒకే కానోనికల్ యూనిట్ (mg/dL, %, g/dL, /mcL, uIU/mL, mmHg) లోకి మార్చబడతాయి, తద్వారా భారతీయ మరియు అంతర్జాతీయ ప్రింట్‌ఆఉట్లు పోల్చడానికి సరిపోతాయి.', 'en-US': 'Ranges are adult reference intervals. Values are converted to a single canonical unit (mg/dL, %, g/dL, /mcL, uIU/mL, mmHg) so Indian and international printouts stay comparable.' },
  'biomarkerTable.statusOptimal':
    { 'en-IN': 'Optimal Range / Healthy', 'hi-IN': 'स्वस्थ सीमा / स्वस्थ', 'te-IN': 'ఆరోగ్యకరమైన పరిధి / ఆరోగ్యకరం', 'en-US': 'Optimal Range / Healthy' },
  'biomarkerTable.statusBorderline':
    { 'en-IN': 'Borderline Range / Monitor', 'hi-IN': 'सीमांत सीमा / निगरानी', 'te-IN': 'సరిహద్దు పరిధి / పర్యవేక్షణ', 'en-US': 'Borderline Range / Monitor' },
  'biomarkerTable.statusCritical':
    { 'en-IN': 'Critical Risk / Consult Doctor', 'hi-IN': 'गंभीर जोखिम / डॉक्टर सलाह लें', 'te-IN': 'గంభీరమైన ప్రమాదం / వైద్యుడిని సంప్రదించండి', 'en-US': 'Critical Risk / Consult Doctor' },
  'biomarkerTable.statusUnknown':
    { 'en-IN': 'No verified value yet', 'hi-IN': 'अभी तक सत्यापित मान नहीं', 'te-IN': 'ధృవీకరించిన విలువ లేదు', 'en-US': 'No verified value yet' },
  'biomarkerTable.editHint':
    { 'en-IN': 'Edit', 'hi-IN': 'संपादित करें', 'te-IN': 'సవరించు', 'en-US': 'Edit' },

  // ---- Layout ----
  'layout.badgeHeart': { 'en-IN': 'Heart / Arteries', 'hi-IN': 'हृदय / धमनियां', 'te-IN': 'గుండె / ధమనులు', 'en-US': 'Heart / Arteries' },
  'layout.badgePancreas': { 'en-IN': 'Pancreas / Blood Sugar', 'hi-IN': 'अग्न्याशय / ब्लड शुगर', 'te-IN': 'ప్యాన్క్రియాటిక్ / బ్లడ్ షుగర్', 'en-US': 'Pancreas / Blood Sugar' },
  'layout.badgeKidneys': { 'en-IN': 'Kidneys / Renal', 'hi-IN': 'गुर्दे / रेनल', 'te-IN': 'మూత్రపిండాలు / రెనల్', 'en-US': 'Kidneys / Renal' },
  'layout.badgeLungs': { 'en-IN': 'Lungs', 'hi-IN': 'फेफड़े', 'te-IN': 'ఊపిరితిత్తులు', 'en-US': 'Lungs' },
  'layout.badgeBrain': { 'en-IN': 'Brain', 'hi-IN': 'मस्तिष्क', 'te-IN': 'మస్తిష్కం', 'en-US': 'Brain' },
  'layout.badgeLegs': { 'en-IN': 'Legs / Ankles', 'hi-IN': 'पैर / टखने', 'te-IN': 'కాళ్లు / తొండాలు', 'en-US': 'Legs / Ankles' },
  'layout.organNodes': { 'en-IN': 'Organ Nodes', 'hi-IN': 'अंग नोड्स', 'te-IN': 'అవయవ నోడ్స్', 'en-US': 'Organ Nodes' },
  'layout.noFlags': { 'en-IN': 'no flags', 'hi-IN': 'कोई संकेत नहीं', 'te-IN': 'ఎలాంటి సూచనలు లేవు', 'en-US': 'no flags' },

  // ---- Audio Storyteller bar ----
  'storyteller.title':
    { 'en-IN': 'AI Audio Explainer', 'hi-IN': 'एआई ऑडियो विश्लेषक', 'te-IN': 'AI ఆడియో విశ్లేషకుడు', 'en-US': 'AI Audio Explainer' },
  'storyteller.healthTitle':
    { 'en-IN': "your health summary", 'hi-IN': 'आपकी स्वास्थ्य जानकारी', 'te-IN': 'మీ ఆరోగ్య విశ్లేషణ', 'en-US': 'your health summary' },
  'storyteller.healthTitleHi':
    { 'en-IN': 'आपके स्वास्थ्य की पूरी जानकारी', 'hi-IN': 'आपके स्वास्थ्य की पूरी जानकारी', 'te-IN': 'మీ ఆరోగ్య విశ్లేషణ ఆడియో', 'en-US': 'आपके स्वास्थ्य की पूरी जानकारी' },
  'storyteller.healthTitleTe':
    { 'en-IN': 'మీ ఆరోగ్య విశ్లేషణ ఆడియో', 'hi-IN': 'మీ ఆరోగ్య విశ్లేషణ ఆడియో', 'te-IN': 'మీ ఆరోగ్య విశ్లేషణ ఆడియో', 'en-US': 'మీ ఆరోగ్య విశ్లేషణ ఆడియో' },
  'storyteller.listen':
    { 'en-IN': 'Listen to Full Doctor Summary', 'hi-IN': 'पूरा विवरण सुनें', 'te-IN': 'పూర్తి వివరాలు వినండి', 'en-US': 'Listen to Full Doctor Summary' },
  'storyteller.listenHi':
    { 'en-IN': 'पूरा विवरण सुनें', 'hi-IN': 'पूरा विवरण सुनें', 'te-IN': 'పూర్తి వివరాలు వినండి', 'en-US': 'पूरा विवरण सुनें' },
  'storyteller.listenTe':
    { 'en-IN': 'పూర్తి వివరాలు వినండి', 'hi-IN': 'పూర్తి వివరాలు వినండి', 'te-IN': 'పూర్తి వివరాలు వినండి', 'en-US': 'పూర్తి వివరాలు వినండి' },
  'storyteller.playing':
    { 'en-IN': 'Playing…', 'hi-IN': 'बज रहा है…', 'te-IN': 'స్వరిస్తుంది…', 'en-US': 'Playing…' },
  'storyteller.notSupported':
    { 'en-IN': 'Speech synthesis unavailable', 'hi-IN': 'वक्त्व संश्लेषण అनुपलब्ध है', 'te-IN': 'స్పీచ్ సింథెసిస్ అందుబాటులో లేదు', 'en-US': 'Speech synthesis unavailable' },

  // ---- Misc ----
  'misc.listen': { 'en-IN': 'Listen', 'hi-IN': 'सुनें', 'te-IN': 'వినండి', 'en-US': 'Listen' },
  'misc.converting': { 'en-IN': 'Converting…', 'hi-IN': 'మార్చబడుతోంది…', 'te-IN': 'మార్చబడుతోంది…', 'en-US': 'Converting…' },

  // ---- Alert sentence used by storyteller example ----
  'storyteller.hiSummary':
    { 'en-IN': 'नमस्ते। आपकी रिपोर्ट में प्लेटलेट और हीमोग्लोबिन की जांच हुई है। आपने बुखार और खांसी के लक्षण बताए हैं। आपकी स्थिति स्थिर है, लेकिन अगर सांस लेने में तकलीफ हो तो तुरंत 108 या डॉक्टर से संपर्क करें।', 'hi-IN': 'नमस्ते। आपकी रिपोर्ट में प्लेटलेट और हीमोग्लोबिन की जांच हुई है। आपने बुखार और खांसी के लक्षण बताए हैं। आपकी स्थिति स्थिर है, लेकिन अगर सांस लेने में तकलीफ हो तो तुरंत 108 या डॉक्टर से संपर्क करें।', 'te-IN': 'నమస్కారం. మీ రిపోర్ట్ పరిశీలించాము. మీకు జ్వరం మరియు దగ్గు ఉన్నట్లు తెలిపారు. తగిన విశ్రాంతి తీసుకోండి, ఇబ్బందిగా ఉంటే వెంటనే వైద్యుడిని సంప్రదించండి.', 'en-US': 'नमस्ते। आपकी रिपोर्ट में प्लेटलेट और हीमोग्लोबिन की जांच हुई है। आपने बुखार और खांसी के लक्षण बताए हैं। आपकी स्थिति स्थिर है, लेकिन अगर सांस लेने में तकलीफ हो तो तुरंत 108 या डॉक्टर से संपर्क करें।' },
  'storyteller.teSummary':
    { 'en-IN': 'నమస్కారం. మీ రిపోర్ట్ పరిశీలించాము. మీకు జ్వరం మరియు దగ్గు ఉన్నట్లు తెలిపారు. తగిన విశ్రాంతి తీసుకోండి, ఇబ్బందిగా ఉంటే వెంటనే వైద్యుడిని సంప్రదించండి.', 'hi-IN': 'నమస్కారం. మీ రిపోర్ట్ పరిశీలించాము. మీకు జ్వరం మరియు దగ్గు ఉన్నట్లు తెలిపారు. తగిన విశ్రాంతి తీసుకోండి, ఇబ్బందిగా ఉంటే వెంటనే వైద్యుడిని సంప్రదించండి.', 'te-IN': 'నమస్కారం. మీ రిపోర్ట్ పరిశీలించాము. మీకు జ్వరం మరియు దగ్గు ఉన్నట్లు తెలిపారు. తగిన విశ్రాంతి తీసుకోండి, ఇబ్బందిగా ఉంటే వెంటనే వైద్యుడిని సంప్రదించండి.', 'en-US': 'నమస్కారం. మీ రిపోర్ట్ పరిశీలించాము. మీకు జ్వరం మరియు దగ్గు ఉన్నట్లు తెలిపారు. తగిన విశ్రాంతి తీసుకోండి, ఇబ్బందిగా ఉంటే వెంటనే వైద్యుడిని సంప్రదించండి.' },
  'storyteller.enSummary':
    { 'en-IN': 'Hello. Your report checked platelets and haemoglobin. You reported fever and cough. Your condition seems stable, but if you have trouble breathing please call 108 or contact a doctor right away.', 'hi-IN': 'Hello. Your report checked platelets and haemoglobin. You reported fever and cough. Your condition seems stable, but if you have trouble breathing please call 108 or contact a doctor right away.', 'te-IN': 'Hello. Your report checked platelets and haemoglobin. You reported fever and cough. Your condition seems stable, but if you have trouble breathing please call 108 or contact a doctor right away.', 'en-US': 'Hello. Your report checked platelets and haemoglobin. You reported fever and cough. Your condition seems stable, but if you have trouble breathing please call 108 or contact a doctor right away.' },
};

export const LANG_DEFS: { code: LangCode; label: string; ttsTag: string }[] = [
  { code: 'en-IN', label: 'English (India)', ttsTag: 'en-IN' },
  { code: 'te-IN', label: 'తెలుగు (Telugu)', ttsTag: 'te-IN' },
  { code: 'hi-IN', label: 'हिन्दी (Hindi)', ttsTag: 'hi-IN' },
  { code: 'en-US', label: 'English (US)', ttsTag: 'en-US' },
];

export function speechLangFor(langCode: LangCode): string {
  return langCode === 'en-US' ? 'en-IN' : langCode;
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [currentLang, setCurrentLang] = useState<LangCode>('en-IN');

  const t = useCallback(
    (key: string, fallback?: string, params?: Record<string, string>): string => {
      const entry = PHRASES[key];
      if (!entry) return fallback ?? key;
      let translated = entry[currentLang];
      if (translated === undefined) translated = entry['en-IN'];
      if (translated === undefined) return fallback ?? key;
      if (params) {
        translated = translated.replace(/\{(\w+)\}/g, (_, name) => {
          return params[name] ?? `{${name}}`;
        });
      }
      return translated;
    },
    [currentLang],
  );

  const setCurrentLangSafe = useCallback(
    (lang: LangCode) => {
      setCurrentLang(lang);
    },
    [],
  );

  const value = useMemo(
    () => ({
      currentLang,
      setCurrentLang: setCurrentLangSafe,
      t,
      speechLang: speechLangFor(currentLang),
    }),
    [currentLang, setCurrentLangSafe, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}

export const LANGUAGES = LANG_DEFS;

export function LanguageSwitcher() {
  const { currentLang, setCurrentLang } = useLanguage();
  return (
    <select
      value={currentLang}
      onChange={(e) => setCurrentLang(e.target.value as any)}
      className="text-[11px] bg-slate-800/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
      aria-label="App language"
    >
      {LANG_DEFS.map((entry) => (
        <option key={entry.code} value={entry.code}>
          {entry.label}
        </option>
      ))}
    </select>
  );
}

