'use strict';

/* ============================================================
   LANGUAGE MAPS
   ============================================================ */
const LANG_NAMES = {
  auto: 'Auto Detect',
  en: 'English',   hi: 'Hindi',      te: 'Telugu',
  ml: 'Malayalam', kn: 'Kannada',    ur: 'Urdu',
  ru: 'Russian',   ja: 'Japanese',   zh: 'Chinese',
  de: 'German',    es: 'Spanish',    fr: 'French',
  ar: 'Arabic',    pt: 'Portuguese', it: 'Italian',
  ko: 'Korean',    tr: 'Turkish',    pl: 'Polish',
  nl: 'Dutch',     sv: 'Swedish',
};

const LANG_BCP47 = {
  en: 'en-US', hi: 'hi-IN', te: 'te-IN', ml: 'ml-IN', kn: 'kn-IN',
  ur: 'ur-PK', ru: 'ru-RU', ja: 'ja-JP', zh: 'zh-CN', de: 'de-DE',
  es: 'es-ES', fr: 'fr-FR', ar: 'ar-SA', pt: 'pt-BR', it: 'it-IT',
  ko: 'ko-KR', tr: 'tr-TR', pl: 'pl-PL', nl: 'nl-NL', sv: 'sv-SE',
};

/* Google Input Tools language codes for transliteration */
const TRANSLITERATE_CODES = {
  te: 'te-t-i0-und',
  hi: 'hi-t-i0-und',
  ml: 'ml-t-i0-und',
  kn: 'kn-t-i0-und',
  ur: 'ur-t-i0-und',
  ar: 'ar-t-i0-und',
  ru: 'ru-t-i0-und',
  ja: 'ja-t-i0-und',
  zh: 'zh-t-i0-und',
  ko: 'ko-t-i0-und',
};

/* ============================================================
   STATE
   ============================================================ */
let isListening   = false;
let isSpeaking    = false;
let recognition   = null;
let statusTimeout = null;
let typingTimeout = null;

/* ============================================================
   ROMAN SCRIPT DETECTION
   Shows a tip when user types romanized text with Auto Detect on
   ============================================================ */
function checkRomanScript(value) {
  const srcLang = document.getElementById('sourceLang').value;
  const tip     = document.getElementById('romanTip');

  const isAllAscii   = /^[a-zA-Z\s,.'!?]+$/.test(value.trim());
  const hasMultiWord = value.trim().split(/\s+/).length >= 2;

  if (srcLang === 'auto' && isAllAscii && hasMultiWord && value.trim().length > 4) {
    tip.classList.remove('hidden');
  } else {
    tip.classList.add('hidden');
  }
}

/* ============================================================
   PAGE NAVIGATION
   ============================================================ */
function showTranslator() {
  const landing    = document.getElementById('landing');
  const translator = document.getElementById('translator');

  landing.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
  landing.style.opacity    = '0';
  landing.style.transform  = 'scale(0.97)';

  setTimeout(() => {
    landing.classList.remove('active');
    landing.style.opacity   = '';
    landing.style.transform = '';

    translator.classList.add('active');
    translator.style.opacity   = '0';
    translator.style.transform = 'translateY(16px)';
    requestAnimationFrame(() => {
      translator.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
      translator.style.opacity    = '1';
      translator.style.transform  = 'translateY(0)';
    });
  }, 420);
}

function showLanding() {
  const landing    = document.getElementById('landing');
  const translator = document.getElementById('translator');

  translator.style.transition = 'opacity 0.35s ease';
  translator.style.opacity    = '0';
  stopSpeaking();

  setTimeout(() => {
    translator.classList.remove('active');
    translator.style.opacity = '';
    landing.classList.add('active');
    landing.style.opacity    = '0';
    requestAnimationFrame(() => {
      landing.style.transition = 'opacity 0.4s ease';
      landing.style.opacity    = '1';
    });
  }, 320);
}

/* ============================================================
   STATUS BAR
   ============================================================ */
const STATUS_CONFIG = {
  listening:   { icon: 'fa-microphone',   label: 'Listening…',   cls: 'listening'   },
  translating: { icon: 'fa-bolt',         label: 'Translating…', cls: 'translating' },
  speaking:    { icon: 'fa-volume-high',  label: 'Speaking…',    cls: 'speaking'    },
  success:     { icon: 'fa-circle-check', label: 'Done!',        cls: 'success'     },
  error:       { icon: 'fa-circle-xmark', label: 'Error',        cls: 'error'       },
  info:        { icon: 'fa-circle-info',  label: '',             cls: ''            },
};

function showStatus(type, customLabel = null, autoDismissMs = 0) {
  clearTimeout(statusTimeout);
  const bar    = document.getElementById('statusBar');
  const iconEl = document.getElementById('statusIcon');
  const textEl = document.getElementById('statusText');
  const cfg    = STATUS_CONFIG[type] || STATUS_CONFIG.info;

  bar.classList.remove('hidden', 'listening', 'translating', 'speaking', 'success', 'error');
  if (cfg.cls) bar.classList.add(cfg.cls);
  iconEl.className   = `fa-solid ${cfg.icon}`;
  textEl.textContent = customLabel || cfg.label;

  if (autoDismissMs > 0) {
    statusTimeout = setTimeout(hideStatus, autoDismissMs);
  }
}

function hideStatus() {
  document.getElementById('statusBar').classList.add('hidden');
}

/* ============================================================
   CHAR COUNT
   ============================================================ */
function updateCharCount() {
  const input = document.getElementById('inputText');
  const count = document.getElementById('charCount');
  count.textContent = `${input.value.length} / 2000`;
  if (input.value.length > 1800)      count.style.color = 'var(--error)';
  else if (input.value.length > 1500) count.style.color = 'var(--warn)';
  else                                count.style.color = 'var(--text-3)';
}

/* ============================================================
   CLEAR
   ============================================================ */
function clearInput() {
  document.getElementById('inputText').value  = '';
  document.getElementById('outputText').value = '';
  document.getElementById('detectedTag').classList.add('hidden');
  document.getElementById('romanTip').classList.add('hidden');
  updateCharCount();
  hideStatus();
}

/* ============================================================
   SWAP LANGUAGES
   ============================================================ */
function swapLanguages() {
  const src = document.getElementById('sourceLang');
  const tgt = document.getElementById('targetLang');
  const out = document.getElementById('outputText');
  const inp = document.getElementById('inputText');

  if (src.value === 'auto') {
    showStatus('info', 'Select a source language to swap', 2200);
    return;
  }

  const btn = document.getElementById('swapBtn');
  btn.style.transform = 'rotate(360deg)';
  setTimeout(() => { btn.style.transform = ''; }, 400);

  const tmpLang = src.value;
  src.value     = tgt.value;
  tgt.value     = tmpLang;

  if (out.value.trim()) {
    inp.value = out.value;
    out.value = '';
    updateCharCount();
  }
}

/* ============================================================
   TRANSLITERATE — Roman script → Native script
   Uses Google Input Tools API
   e.g. "annam thinnava" → "అన్నం తిన్నావా"
   ============================================================ */
async function transliterateToScript(text, langCode) {
  const itc = TRANSLITERATE_CODES[langCode];
  if (!itc) return null; // language doesn't need transliteration

  const url =
    `https://inputtools.google.com/request?text=${encodeURIComponent(text)}` +
    `&itc=${itc}&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    // Response format: ["SUCCESS", [["word", ["నేటివ్స్క్రిప్ట్"]], ...]]
    if (
      data[0] === 'SUCCESS' &&
      data[1] &&
      data[1][0] &&
      data[1][0][1] &&
      data[1][0][1][0]
    ) {
      return data[1][0][1][0]; // native script text
    }
    return null;
  } catch (e) {
    console.warn('Transliteration failed:', e);
    return null;
  }
}

/* ============================================================
   TRANSLATION — Google Translate unofficial API
   3-step process:
   1. If roman text + known non-latin language → transliterate first
   2. If auto detect → detect language
   3. Translate with confirmed source language
   ============================================================ */
async function translateText() {
  const inputEl  = document.getElementById('inputText');
  const outputEl = document.getElementById('outputText');
  const srcLang  = document.getElementById('sourceLang').value;
  const tgtLang  = document.getElementById('targetLang').value;
  const text     = inputEl.value.trim();

  if (!text) {
    showStatus('info', 'Please enter text to translate', 2500);
    return;
  }
  if (srcLang !== 'auto' && srcLang === tgtLang) {
    showStatus('info', 'Source and target languages are the same', 2500);
    return;
  }

  showStatus('translating');
  showLoader(true);
  outputEl.value = '';

  try {
    let textToTranslate = text;
    let finalSrc        = srcLang;

    const isRoman = /^[a-zA-Z\s,.'!?0-9]+$/.test(text.trim());

    /* ----------------------------------------------------------
       STEP 1: Roman text + non-latin source language selected
       → Transliterate to native script first for accuracy
    ---------------------------------------------------------- */
    if (isRoman && srcLang !== 'auto' && TRANSLITERATE_CODES[srcLang]) {
      showStatus('translating', 'Converting script…');

      const nativeScript = await transliterateToScript(text, srcLang);

      if (nativeScript) {
        textToTranslate = nativeScript;
        // Briefly show what was converted
        showStatus('translating', `Script: ${nativeScript}`);
        await new Promise(r => setTimeout(r, 800)); // show for 0.8s
        showStatus('translating');
      }
      // If transliteration failed, proceed with original roman text
      finalSrc = srcLang;
      document.getElementById('detectedTag').classList.add('hidden');
    }

    /* ----------------------------------------------------------
       STEP 2: Auto detect — run detection call first
    ---------------------------------------------------------- */
    else if (srcLang === 'auto') {
      const detectUrl =
        `https://translate.googleapis.com/translate_a/single` +
        `?client=gtx&sl=auto&tl=en&dt=t&dt=ld` +
        `&q=${encodeURIComponent(text)}`;

      const detectRes  = await fetch(detectUrl);
      const detectData = await detectRes.json();

      if (detectData[2]) {
        finalSrc = String(detectData[2]).toLowerCase().split('-')[0];
        const detectedName = LANG_NAMES[finalSrc] || finalSrc.toUpperCase();
        document.getElementById('detectedLangName').textContent = detectedName;
        document.getElementById('detectedTag').classList.remove('hidden');
      }

      // If detected lang same as target, detection likely wrong
      if (finalSrc === tgtLang) {
        finalSrc = 'auto';
        document.getElementById('detectedTag').classList.add('hidden');
      }
    }

    /* ----------------------------------------------------------
       STEP 3: Translate the (possibly script-converted) text
    ---------------------------------------------------------- */
    else {
      document.getElementById('detectedTag').classList.add('hidden');
    }

    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=${finalSrc}&tl=${tgtLang}&dt=t` +
      `&q=${encodeURIComponent(textToTranslate)}`;

    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const translated = data[0]
      .map(chunk => chunk[0])
      .filter(Boolean)
      .join('');

    if (!translated) throw new Error('Empty translation returned');

    showLoader(false);
    typeOutput(outputEl, translated);
    showStatus('success', 'Translation complete', 2800);

  } catch (err) {
    showLoader(false);
    showStatus('error', `Translation failed: ${err.message}`, 4000);
    outputEl.value = '';
    console.error('Translation error:', err);
  }
}

/* ============================================================
   TYPING ANIMATION
   ============================================================ */
function typeOutput(el, text) {
  clearTimeout(typingTimeout);
  el.value = '';
  let i = 0;
  const speed = Math.max(8, Math.min(30, 1800 / text.length));

  function type() {
    if (i < text.length) {
      el.value += text.charAt(i++);
      el.scrollTop = el.scrollHeight;
      typingTimeout = setTimeout(type, speed);
    }
  }
  type();
}

/* ============================================================
   LOADER
   ============================================================ */
function showLoader(show) {
  const overlay = document.getElementById('loaderOverlay');
  show ? overlay.classList.remove('hidden') : overlay.classList.add('hidden');
}

/* ============================================================
   VOICE INPUT — Web Speech API STT
   ============================================================ */
function startVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showStatus('error', 'Voice input not supported in this browser', 3500);
    return;
  }

  const voiceBtn = document.getElementById('voiceBtn');

  if (isListening && recognition) {
    recognition.stop();
    return;
  }

  const srcLang   = document.getElementById('sourceLang').value;
  const recogLang = srcLang === 'auto' ? 'en-US' : (LANG_BCP47[srcLang] || 'en-US');

  recognition = new SpeechRecognition();
  recognition.lang            = recogLang;
  recognition.interimResults  = true;
  recognition.maxAlternatives = 1;
  recognition.continuous      = false;

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.classList.add('listening', 'active');
    showStatus('listening');
  };

  recognition.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      event.results[i].isFinal ? (final += t) : (interim += t);
    }
    document.getElementById('inputText').value = final || interim;
    updateCharCount();
  };

  recognition.onend = () => {
    isListening = false;
    voiceBtn.classList.remove('listening', 'active');
    hideStatus();
    const val = document.getElementById('inputText').value.trim();
    if (val) setTimeout(translateText, 300);
  };

  recognition.onerror = (event) => {
    isListening = false;
    voiceBtn.classList.remove('listening', 'active');
    const msg = {
      'no-speech':     'No speech detected',
      'audio-capture': 'Microphone not available',
      'not-allowed':   'Microphone permission denied',
      'network':       'Network error',
      'aborted':       'Listening cancelled',
    }[event.error] || `Error: ${event.error}`;
    showStatus('error', msg, 3500);
  };

  recognition.start();
}

/* ============================================================
   TEXT-TO-SPEECH — Web Speech API TTS
   ============================================================ */
function speakOutput() {
  const text     = document.getElementById('outputText').value.trim();
  const tgtLang  = document.getElementById('targetLang').value;
  const speakBtn = document.getElementById('speakBtn');

  if (!text) {
    showStatus('info', 'No translation to speak', 2200);
    return;
  }
  if (!window.speechSynthesis) {
    showStatus('error', 'Text-to-speech not supported in this browser', 3500);
    return;
  }

  if (isSpeaking) { stopSpeaking(); return; }

  window.speechSynthesis.cancel();

  const utter  = new SpeechSynthesisUtterance(text);
  utter.lang   = LANG_BCP47[tgtLang] || 'en-US';
  utter.rate   = 0.95;
  utter.pitch  = 1;

  const voices = window.speechSynthesis.getVoices();
  const match  = voices.find(v => v.lang.startsWith(utter.lang.split('-')[0]));
  if (match) utter.voice = match;

  utter.onstart = () => {
    isSpeaking = true;
    speakBtn.classList.add('speaking', 'active');
    showStatus('speaking');
  };
  utter.onend = () => {
    isSpeaking = false;
    speakBtn.classList.remove('speaking', 'active');
    showStatus('success', 'Done speaking', 1800);
  };
  utter.onerror = () => {
    isSpeaking = false;
    speakBtn.classList.remove('speaking', 'active');
    showStatus('error', 'Speech error', 2500);
  };

  window.speechSynthesis.speak(utter);
}

function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  isSpeaking = false;
  const speakBtn = document.getElementById('speakBtn');
  if (speakBtn) speakBtn.classList.remove('speaking', 'active');
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

/* ============================================================
   COPY OUTPUT
   ============================================================ */
function copyOutput() {
  const text = document.getElementById('outputText').value.trim();
  if (!text) { showStatus('info', 'Nothing to copy', 1800); return; }

  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('copyToast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2200);
    showStatus('success', 'Copied to clipboard!', 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showStatus('success', 'Copied!', 2000);
  });
}

/* ============================================================
   KEYBOARD SHORTCUTS
   Ctrl/Cmd + Enter = Translate
   Escape = Stop speaking / hide status
   Enter (in textarea, no shift) = Translate
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('translator').classList.contains('active')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    translateText();
  }
  if (e.key === 'Escape') {
    stopSpeaking();
    hideStatus();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const inputEl = document.getElementById('inputText');
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        translateText();
      }
    });
  }
});