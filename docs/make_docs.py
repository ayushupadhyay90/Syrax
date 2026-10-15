# -*- coding: utf-8 -*-
"""Build the two B.TECH project documents:
  1) Syrax-Synopsis.docx       — per 'synopsis new format for B.TECH projects.pdf'
  2) About-Syrax.docx          — source-code reference + viva FAQ
Spec: A4 · Times New Roman 12 · double spacing · margins L3.5 T2.5 R1.25 B1.25 cm.
"""
from docx import Document
from docx.shared import Pt, Mm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml.ns import qn
import os

OUT_DIR = r"C:\Users\Ayush\OneDrive\Desktop\Syrax\docs"
os.makedirs(OUT_DIR, exist_ok=True)

C = WD_ALIGN_PARAGRAPH.CENTER
J = WD_ALIGN_PARAGRAPH.JUSTIFY
L = WD_ALIGN_PARAGRAPH.LEFT

TEAM = [
    ("Ayush Kumar Upadhyay", "2500350100012"),
    ("Navam", "2500350100041"),
    ("Sandeep", "2500350100057"),
]


# ─────────────────────────── shared helpers ────────────────────────────
def new_doc(font_size=12, spacing=2.0):
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)          # A4
    # SYMMETRIC margins — the sample format's asymmetric gutters (L3.5 / R1.25)
    # made the text block hug the right edge on every page; user wants it centred
    sec.left_margin = sec.right_margin = Mm(25)                 # 2.5 cm both sides
    sec.top_margin = sec.bottom_margin = Mm(25)                 # 2.5 cm both sides
    st = doc.styles["Normal"]
    st.font.name = "Times New Roman"
    st.font.size = Pt(font_size)
    st.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "Times New Roman")
    st.paragraph_format.line_spacing = spacing
    st.paragraph_format.space_after = Pt(0)
    return doc


def para(doc, text, size=12, bold=False, italic=False, align=L, spacing=None,
         before=0, after=0, font="Times New Roman"):
    p = doc.add_paragraph()
    p.alignment = align
    if spacing:
        p.paragraph_format.line_spacing = spacing
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    r = p.add_run(text)
    r.font.name = font
    r.font.size = Pt(size)
    r.bold = bold
    r.italic = italic
    return p


def body(doc, text, align=J, **kw):
    """A justified, double-spaced body paragraph."""
    return para(doc, text, size=12, align=align, spacing=2.0, **kw)


def bullet(doc, text, size=12, spacing=2.0):
    return para(doc, "\u2022  " + text, size=size, align=L, spacing=spacing, after=0)


def caption(doc, text):
    return para(doc, text, size=12, bold=True, align=L, spacing=1.0, before=8, after=4)


def table(doc, headers, rows, widths=None, fsize=11):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    for j, h in enumerate(headers):
        cell = t.rows[0].cells[j]
        cell.paragraphs[0].paragraph_format.line_spacing = 1.0
        r = cell.paragraphs[0].add_run(h)
        r.font.name, r.font.size, r.bold = "Times New Roman", Pt(fsize), True
    for row in rows:
        cells = t.add_row().cells
        for j, val in enumerate(row):
            cells[j].paragraphs[0].paragraph_format.line_spacing = 1.0
            r = cells[j].paragraphs[0].add_run(str(val))
            r.font.name, r.font.size = "Times New Roman", Pt(fsize)
    return t


# ═══════════════════════════ 1) SYNOPSIS ══════════════════════════════
doc = new_doc()

# ── title page (format, page 1) ──
para(doc, "SYRAX: A VOICE-DRIVEN 3D PARTICLE WEB UI AGENT",
     size=22, bold=True, align=C, spacing=1.0, before=18)
para(doc, "A Project Synopsis", size=14, bold=True, align=C, spacing=1.0, before=24)
para(doc, "Submitted by", size=14, bold=True, italic=True, align=C, spacing=1.0, before=18)
for name, roll in TEAM:
    para(doc, name, size=16, bold=True, align=C, spacing=1.0, before=10)
    para(doc, roll, size=16, bold=True, align=C, spacing=1.0, before=4)
para(doc, "In partial fulfillment for the award of the degree of",
     size=14, bold=True, italic=True, align=C, spacing=1.5, before=34)
para(doc, "BACHELOR OF TECHNOLOGY", size=16, bold=True, align=C, spacing=1.0, before=8)
para(doc, "IN", size=14, bold=True, align=C, spacing=1.0, before=4)
para(doc, "COMPUTER SCIENCE AND ENGINEERING", size=16, bold=True, align=C, spacing=1.0, before=4)
para(doc, "At", size=14, bold=True, align=C, spacing=1.0, before=40)
para(doc, "BABU BANARSI DAS INSTITUTE OF TECHNOLOGY, GHAZIABAD",
     size=16, bold=True, align=C, spacing=1.0, before=6)
para(doc, "Affiliated to Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow",
     size=14, bold=True, align=C, spacing=1.0, before=6)
para(doc, "Department of CSE", size=16, bold=True, align=C, spacing=1.0, before=6)
para(doc, "OCTOBER 2026", size=16, bold=True, align=C, spacing=1.0, before=44)

doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

# ── 1. Introduction ──
para(doc, "Introduction", size=12, bold=True, align=C, spacing=2.0, before=4, after=0)
body(doc,
     "Syrax is a voice-driven web agent that allows a person to control a real web browser "
     "entirely by speaking. Delivered as an installable progressive web application (PWA), it "
     "runs from a single web address on both laptop and Android phone. The user taps the "
     "microphone once and gives one clear spoken command \u2014 for example, \u201copen YouTube\u201d, "
     "\u201csearch for cats\u201d, \u201cplay any comedy video\u201d or \u201cwhat is the world clock\u201d \u2014 and the system "
     "either performs the action in a genuine browser tab or answers the question aloud. "
     "Unlike conventional chat assistants that merely describe what they would do, Syrax "
     "executes the operation and leaves the resulting page open and fully under the user\u2019s "
     "control.")
body(doc,
     "Technically, the system is built around three cooperating layers. The presentation layer "
     "is a three-dimensional particle interface rendered with Three.js and React Three Fiber, "
     "which reacts to microphone level and to application state so that feedback is always "
     "visible without obstructing the conversation. The voice layer captures speech through "
     "the Web Speech API (speech-to-text, STT), buffers it until the sentence is demonstrably "
     "complete, and speaks replies through a layered text-to-speech (TTS) chain that falls "
     "back gracefully from a neural voice service to the browser\u2019s built-in synthesiser. The "
     "decision layer consists of a deterministic local intent engine that instantaneously "
     "matches clear commands, and a large language model (LLM) \u2014 DeepSeek\u2019s deepseek-flash \u2014 "
     "that answers questions and holds conversation but is structurally forbidden from "
     "narrating actions it cannot perform.")
body(doc,
     "The principal technologies employed are React 19 with TypeScript, built using Vite; "
     "Tailwind CSS for styling; Three.js, React Three Fiber and GSAP for graphics and "
     "animation; the Web Speech API for recognition; the DeepSeek application programming "
     "interface (API) in JSON mode for natural-language understanding; a small FastAPI "
     "sidecar in Python for optional voice services; and GitHub Actions with GitHub Pages "
     "for continuous integration and free hosting. No server-side database is required; "
     "conversation history and settings are held in the browser\u2019s localStorage.")
body(doc,
     "The project lies in the field of human\u2013computer interaction (HCI) and applied artificial "
     "intelligence. Specialised terms used throughout include STT and TTS (speech-to-text and "
     "text-to-speech), intent parsing (classifying an utterance into an executable command), "
     "LLM and JSON mode (structured model output), PWA (installable web application), one-shot "
     "microphone control (the microphone enables itself for a single utterance and always "
     "returns to the off state after each task), and popup-safe tab operation.")
body(doc,
     "The objectives of the project are: (i) to execute every clear spoken command reliably "
     "without falling back to conversation, (ii) to answer identity, time, date and general "
     "questions instantly and honestly, (iii) to perform all operations in real, visible "
     "browser tabs, (iv) to keep the microphone privacy-aware \u2014 one-shot and never hearing "
     "media audio, and (v) to deploy the complete system at zero hosting cost from a public "
     "source repository.")

# ── 2. Feasibility Study ──
para(doc, "Feasibility Study", size=12, bold=True, align=C, spacing=2.0, before=16, after=0)
body(doc,
     "Technical feasibility: the entire system is realised with browser-native, "
     "standards-based technologies \u2014 Web Speech, Web Storage, window management \u2014 and mature "
     "open-source frameworks (React, Vite, Tailwind, Three.js). No bespoke hardware, custom "
     "server or proprietary licence is required, and the speech recognition and synthesis "
     "services are supplied free of charge by the browser vendor; therefore the proposed work "
     "is technically achievable with the available laboratory resources.")
body(doc,
     "Operational feasibility: a single microphone tap followed by one natural sentence is "
     "the complete interaction model, so the system requires minimal training. Every action "
     "opens in a normal browser tab that the user can inspect, edit or close, which keeps the "
     "agent transparent in daily use and installs on desktop and Android from the same link.")
body(doc,
     "Economic feasibility: hosting on GitHub Pages is free, the speech interfaces cost "
     "nothing, and the language-model key is optional \u2014 without it, all local commands still "
     "execute and questions receive canned honest replies. When a key is supplied, usage is "
     "pay-per-use at a negligible cost. Overall project cost is therefore close to zero.")
body(doc,
     "Schedule feasibility: the work decomposes into eight well-bounded phases (Table 1) that "
     "fit comfortably within the academic project timeline ending October 2026.")
body(doc,
     "Need and significance: hands-free operation improves accessibility for users who cannot "
     "type, removes the overhead of menus and navigation for routine tasks such as opening, "
     "searching and media playback, and demonstrates that a lightweight, honest assistant can "
     "be built and deployed by students on open tooling \u2014 a reusable foundation for further "
     "research in conversational web agents.")

# ── 3. Methodology / Planning of work ──
para(doc, "Methodology/Planning of work", size=12, bold=True, align=C, spacing=2.0,
     before=16, after=0)
body(doc,
     "The project follows the software development life cycle (SDLC) in eight sequential "
     "phases, each concluding with a review of demonstrable, working software. Requirements "
     "were gathered first-hand from intended usage scenarios \u2014 opening sites, searching, "
     "media playback, conversation and halting \u2014 and each requirement was classified as either "
     "\u201cexecutable locally\u201d or \u201crequires the language model\u201d, which became the central design "
     "constraint of the system.")
caption(doc, "Table 1: Project development phases and duration")
table(doc,
      ["S. No.", "Phase", "Key activities", "Duration"],
      [
          ["1", "Requirement analysis", "Usage scenarios, command inventory, risk list", "2 weeks"],
          ["2", "System design", "Layered architecture, module interfaces, theme palette", "1 week"],
          ["3", "UI and 3D theme", "React shell, Tailwind layout, particle field, PWA assets", "2 weeks"],
          ["4", "Voice pipeline", "STT buffering, silence/dangling detection, TTS chain", "2 weeks"],
          ["5", "Intent engine and LLM", "Local command parser, DeepSeek JSON integration", "2 weeks"],
          ["6", "Browser operations", "Tab reuse, popup-safe opening, video resolution", "1 week"],
          ["7", "Testing and hardening", "Type checks, live command suite, edge cases", "1 week"],
          ["8", "Deployment and documentation", "Actions pipeline, Pages hosting, reports", "1 week"],
      ])
body(doc,
     "Design: the architecture is a strict layered pipeline \u2014 microphone \u2192 STT buffer \u2192 local "
     "intent gate \u2192 either a tab operation or the LLM \u2192 text-to-speech reply. The intent gate "
     "is deterministic and runs first; the language model is only reachable for content the "
     "gate declines (questions and conversation) and holds no actuator at all, so a fabricated "
     "\u201copening\u2026\u201d reply is impossible by construction.", after=0)
body(doc,
     "Implementation: modules were built bottom-up and integrated continuously \u2014 interface and "
     "theming first, then the voice pipeline, then the intent engine, then real-tab "
     "operations, and finally the language-model conversation layer. Every merged increment "
     "was compiled with strict TypeScript checks before it was accepted.")
body(doc,
     "Testing: the strategy combines static checking (tsc, zero-error policy), build "
     "verification (production Vite bundle), and an end-to-end command suite executed against "
     "the live deployment \u2014 each documented voice phrase is issued and the resulting tab URL, "
     "status text and reply are asserted. Edge cases covered include cut-off sentences, "
     "misheard wake words, popup blocking, resolver failure and missing API keys.")
body(doc,
     "Deployment: pushes to the main branch trigger a GitHub Actions workflow that builds the "
     "application and publishes it to GitHub Pages under a hashed bundle address; a single "
     "refresh loads the new version. Maintenance consists of monitoring command success, "
     "fixing defects, and extending the command vocabulary in the local parser.")

# ── 4. Facilities required ──
para(doc, "Facilities required for proposed work", size=12, bold=True, align=C,
     spacing=2.0, before=16, after=0)
body(doc, "Software required:", align=L)
for s in [
    "Operating system: Windows 10/11 (or any desktop OS with a Chromium browser)",
    "Browser: Google Chrome / Microsoft Edge (Web Speech API support)",
    "Editor: Visual Studio Code; runtime: Node.js 18 or later; Git for version control",
    "Frameworks and libraries: React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4, Three.js, "
    "React Three Fiber, GSAP",
    "Python 3.12 with FastAPI, Uvicorn (optional local voice sidecar)",
    "DeepSeek API account (optional key, entered once per device in the application)",
    "GitHub account with GitHub Actions and GitHub Pages (free tier)",
]:
    bullet(doc, s)
body(doc, "Hardware required:", align=L)
for h in [
    "Any personal computer with at least 4 GB RAM and a microphone input",
    "Headset or desktop microphone and speakers for voice input/output",
    "Internet connection (for speech services, the language model and hosting)",
    "An Android smartphone (optional) for verifying the installed progressive web app",
]:
    bullet(doc, h)

# ── 5. Bibliography ──
para(doc, "Bibliography", size=12, bold=True, align=C, spacing=2.0, before=16, after=0)
refs = [
    "MDN Web Docs, \u201cWeb Speech API\u201d, developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API "
    "(Accessed: October 2026).",
    "MDN Web Docs, \u201cWindow.open()\u201d, developer.mozilla.org/en-US/docs/Web/API/Window/open "
    "(Accessed: October 2026).",
    "React Foundation, \u201cReact documentation\u201d, react.dev/learn (Accessed: October 2026).",
    "Three.js, \u201cDocumentation\u201d, threejs.org/docs (Accessed: October 2026).",
    "Tailwind Labs, \u201cTailwind CSS documentation\u201d, tailwindcss.com/docs (Accessed: October 2026).",
    "Vite, \u201cGetting started\u201d, vite.dev/guide (Accessed: October 2026).",
    "DeepSeek, \u201cDeepSeek API documentation\u201d, api-docs.deepseek.com (Accessed: October 2026).",
    "Google, \u201cProgressive web apps\u201d, web.dev/learn/pwa (Accessed: October 2026).",
    "GitHub, \u201cGitHub Pages documentation\u201d, docs.github.com/en/pages (Accessed: October 2026).",
    "Microsoft, \u201cTypeScript handbook\u201d, typescriptlang.org/docs/handbook (Accessed: October 2026).",
    "I. Sommerville, Software Engineering, 10th ed. Boston: Pearson, 2016.",
    "S. Krug, Don\u2019t Make Me Think! A Common Sense Approach to Web Usability, 3rd ed. "
    "San Francisco: New Riders, 2014.",
]
for i, r in enumerate(refs, 1):
    para(doc, f"[{i}]  {r}", size=12, align=L, spacing=2.0)

syn_path = os.path.join(OUT_DIR, "Syrax-Synopsis.docx")
doc.save(syn_path)
print("saved:", syn_path)


# ══════════════════ 2) ABOUT SYRAX + VIVA FAQ ══════════════════════════
doc = new_doc(font_size=11, spacing=1.0)

para(doc, "SYRAX \u2014 Project Reference & Viva FAQ", size=18, bold=True, align=C, spacing=1.0)
para(doc, "Source-code guide, system information and likely viva questions with model answers",
     size=11, italic=True, align=C, spacing=1.0, before=4)
para(doc, "Team: Ayush Kumar Upadhyay (2500350100012) \u00b7 Navam (2500350100041) \u00b7 "
     "Sandeep (2500350100057) \u00b7 October 2026",
     size=11, align=C, spacing=1.0, before=2)

# ── Part A: overview ──
para(doc, "A. Project Overview", size=14, bold=True, before=14, after=4)
body(doc,
     "Syrax is a voice-driven web agent with a 3D particle interface. A single spoken "
     "sentence is either executed as a real browser action (open, search, play, close) or "
     "answered as conversation (identity, time, date, world clock, general questions). The "
     "two paths never mix: actions come only from a deterministic local command parser, and "
     "the large language model can only talk \u2014 it has no way to open or navigate a tab.", align=J)
caption(doc, "Table A1: Quick facts")
table(doc, ["Item", "Detail"], [
    ["Live site", "https://ayushupadhyay90.github.io/Syrax/ (one responsive PWA URL)"],
    ["Source repository", "https://github.com/ayushupadhyay90/Syrax (public, key-free)"],
    ["Project type", "Web application / PWA with AI (NLP) and voice interaction"],
    ["Frontend", "React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 4"],
    ["3D / animation", "Three.js 0.174, React Three Fiber 9, Drei 10, GSAP 3.12"],
    ["Speech", "Web Speech API (STT), layered TTS chain (Fish \u2192 Pocket \u2192 browser voice)"],
    ["Language model", "DeepSeek deepseek-flash \u2014 JSON mode, temperature 0.5, max_tokens 384"],
    ["Hosting / CI", "GitHub Actions \u2192 GitHub Pages (push to main branch)"],
    ["Sidecar (optional)", "Python FastAPI service (localhost) for premium voice features"],
    ["Storage", "Browser localStorage only \u2014 keys: syrax-chat-v1, syrax-ds-key. No database."],
    ["Cost", "Near zero \u2014 free hosting, free browser speech, optional pay-per-use LLM key"],
])

# ── Part B: source code ──
para(doc, "B. Source Code & Repository", size=14, bold=True, before=14, after=4)
body(doc,
     "Statistics: ~3,887 lines across 14 TypeScript/TSX/CSS source files, plus ~310 lines of "
     "Python in the optional backend. Largest modules: chunks/Stage.tsx (1,811 lines \u2014 the "
     "whole interface and control logic) and ai/syrax.ts (505 lines \u2014 intent parser + LLM).", align=J)
mono = doc.add_paragraph()
mono.paragraph_format.line_spacing = 1.0
tree = """Syrax/                                GitHub repository root
|-- .github/workflows/deploy.yml      CI: builds the app, deploys to GitHub Pages
|-- presentation/                     Project decks + python-pptx generators
|-- docs/                             This synopsis and reference material
`-- syrax/                            The web application
    |-- package.json                  scripts: dev, build (tsc -b && vite build), preview, server
    |-- backend/                      Optional FastAPI sidecar
    |   |-- main.py                   240 lines - proxy for premium voice services
    |   |-- setup_voice.py            voice setup helper
    |   `-- requirements.txt, .env.example
    `-- src/
        |-- main.tsx, App.tsx         entry + routing shell
        |-- chunks/Stage.tsx          1,811 lines - HUD, mic control, chat, command execution
        |-- chunks/Chunk1.tsx         side operation panel
        |-- ai/syrax.ts               505 lines - local intent gate, LLM caller, prompt, identity/time
        |-- ai/about.ts               creator credits + About panel copy
        |-- voice/stt.ts              speech recognizer wrapper (buffering, language en-IN)
        |-- voice/tts.ts              TTS chain: Fish -> Pocket -> browser speechSynthesis
        |-- voice/level.ts            microphone level helper for the particles
        |-- three/Background.tsx      canvas host / state binding
        |-- three/particles.ts        particle engine (state + mic-driven intensity)
        |-- browser/BrowserPanel.tsx  in-app site panel (secondary; real tabs are primary)
        `-- styles.css                380 lines - theme (blue #3B82F6 on #040711) and layout"""
for line in tree.split("\n"):
    r = mono.add_run(line + "\n")
    r.font.name, r.font.size = "Consolas", Pt(9)
para(doc, "Build and run:", size=11, bold=True, before=8, after=2)
for cmd, note in [
    ("npm install", "install dependencies (in the syrax/ folder)"),
    ("npm run dev", "local development server with hot reload"),
    ("npm run build", "type-check (tsc -b) then production Vite build"),
    ("python -m uvicorn main:app --port 8000", "optional: local voice sidecar (backend/)"),
    ("git push origin main", "GitHub Actions builds and republishes the live site"),
]:
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.0
    r1 = p.add_run(f"  $ {cmd}   ")
    r1.font.name, r1.font.size, r1.bold = "Consolas", Pt(10), True
    r2 = p.add_run(f"\u2014 {note}")
    r2.font.name, r2.font.size = "Times New Roman", Pt(10)

para(doc, "Module responsibility map", size=12, bold=True, before=8, after=4)
caption(doc, "Table B1: Modules and responsibilities")
table(doc, ["Module", "Responsibility", "Lines"], [
    ["chunks/Stage.tsx", "Microphone lifecycle (one-shot), STT buffering/flush, chat UI, "
     "command execution, tab management, halt, song-prompt state", "1,811"],
    ["ai/syrax.ts", "Opener/wake-word stripping, local intent gate (open/search/play/close), "
     "DeepSeek caller with JSON-mode prompt, identity + world-clock local answers", "505"],
    ["voice/stt.ts", "Web Speech recognizer wrapper: continuous listening, interim results, "
     "lazy construction so it works even if injected late", "189"],
    ["voice/tts.ts", "Speech output chain with timeouts and graceful degradation "
     "(Fish Audio \u2192 Pocket TTS \u2192 browser voice)", "142"],
    ["browser/BrowserPanel.tsx", "Embedded site panel used as a secondary view; primary "
     "operations always open real Chrome tabs", "321"],
    ["three/particles.ts + Background.tsx", "Three.js particle field; intensity driven by app "
     "state (idle/listening/thinking/speaking) and microphone level", "142"],
    ["ai/about.ts", "Canonical creator credits (Ayush, Navam, Sandeep) and About panel", "36"],
    ["backend/main.py", "Optional FastAPI sidecar proxying premium voice services", "240"],
])

para(doc, "Persistent data (the project uses no database)", size=12, bold=True, before=8, after=4)
caption(doc, "Table B2: localStorage keys")
table(doc, ["Key", "Purpose"], [
    ["syrax-chat-v1", "Conversation history \u2014 restored on every page load; also seeds the "
     "LLM memory (last ~18 turns, JSON-shaped)"],
    ["syrax-ds-key", "User\u2019s DeepSeek API key, entered once per device; never committed to "
     "the repository; ?key= links save it then strip themselves"],
])

# ── Part C: architecture ──
para(doc, "C. Architecture & Key Flows", size=14, bold=True, before=14, after=4)
flow = doc.add_paragraph()
flow.paragraph_format.line_spacing = 1.0
for line in [
    "  Microphone (one tap = one-shot ON)",
    "        |",
    "        v",
    "  STT buffer -- 1.5 s silence + dangling-word check --> complete sentence",
    "        |",
    "        v",
    "  Local intent gate  ---- clear command ---->  Tab operations (reuse open tab,",
    "        |                                      or window.open at command time)",
    "        |  question / conversation                      |",
    "        v                                               v",
    "  DeepSeek LLM (JSON mode, cannot act)          TTS reply -> mic returns OFF",
]:
    r = flow.add_run(line + "\n")
    r.font.name, r.font.size = "Consolas", Pt(9)

numbered = [
    ("Command lifecycle",
     "Tap mic \u2192 recognizer starts (status: \u201cListening\u2026\u201d) \u2192 final results accumulate in a buffer "
     "\u2192 after 1.5 s of silence (or 3.5 s when the phrase ends on a connector such as \u201cby\u201d, "
     "\u201cthe\u201d, \u201csearch\u201d) the full sentence fires \u2192 localIntent() strips openers/wake words in a loop "
     "and matches open/search/play/close/halt \u2192 on a match the action executes immediately and "
     "the reply is spoken; otherwise the utterance goes to the LLM (or a local identity/"
     "clock answer) \u2192 the mic always ends OFF."),
    ("Real-tab policy",
     "Operations reuse an already-open tab of the same kind (no stacking). If none exists, "
     "window.open runs at command time; when a popup blocker catches it, the user gets a "
     "one-time guidance message plus an always-working \u201cOpen \u21b5\u201d link, and the next tap "
     "anywhere re-opens the blocked URL. No tab is opened at the moment the mic is clicked."),
    ("Play flow (\u201cplay X\u201d)",
     "The query is parsed locally (artist extraction with a guard so titles like \u201cstand by "
     "me\u201d survive; category queries such as \u201cany comedy video\u201d; \u201cplay a song\u201d with no title asks a "
     "question and keeps the mic open for the spoken answer, 25 s auto-off). A 9-source "
     "client-side parallel race resolves the top YouTube video ID \u2248 2 s; if every source "
     "fails the tab still opens on the YouTube results page."),
    ("Safety rails",
     "Questions are never executed; negations and hypotheticals are ignored; \u201cstop\u201d / "
     "\u201cshut up\u201d / \u201cstop Syrax\u201d (including misheard variants like cyrex/psycx/sirex) halt "
     "everything instantly and cut TTS mid-sentence; media is muted while listening so the "
     "microphone can never transcribe video audio."),
    ("Conversation and memory",
     "Chat persists in localStorage (syrax-chat-v1) and is replayed into the model as "
     "JSON-shaped turns ({reply, action}) because DeepSeek answers first-try on that format. "
     "Identity questions and time/date/world-clock queries are answered locally before the "
     "model is called \u2014 the LLM cannot know the real time."),
    ("Deployment",
     "git push to main \u2192 GitHub Actions workflow builds with Vite \u2192 GitHub Pages publishes "
     "hashed assets \u2192 live in about two minutes. The repository is public and contains no "
     "secrets; the verification suite is run against the deployed URL after every push."),
]
for i, (head, txt) in enumerate(numbered, 1):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run(f"{i}. {head}. ")
    r.bold, r.font.size, r.font.name = True, Pt(11), "Times New Roman"
    r2 = p.add_run(txt)
    r2.font.size, r2.font.name = Pt(11), "Times New Roman"

# ── Part D: design decisions / testing / limits ──
para(doc, "D. Design Decisions, Testing, Limitations", size=14, bold=True, before=14, after=4)
for head, txt in [
    ("Why a local intent gate instead of pure LLM?",
     "Deterministic parsing gives millisecond, testable, hallucination-free execution. An LLM "
     "that is allowed to \u201cact\u201d will happily narrate actions it never performed \u2014 the exact "
     "defect this architecture makes impossible."),
    ("Why real browser tabs?",
     "Transparency and control: the user sees exactly what the agent did in a normal tab they "
     "own, which embedded iframes and sandboxed panels cannot offer (and which matches the "
     "project requirement that every operation opens in a real Chrome tab)."),
    ("Testing strategy",
     "Zero-error TypeScript policy; production build verification; an end-to-end suite run "
     "against the live site after every deployment covering each documented phrase, wake-word "
     "mishearings, popup blocking, resolver failure and keyless operation; console monitored "
     "for stray errors."),
    ("Known limitations",
     "Speech accuracy depends on the browser\u2019s recogniser (English-India tuned; noisy "
     "environments degrade it). Slow commands can be caught once by the popup blocker until "
     "the user selects \u201cAlways allow\u201d. The LLM requires a user-supplied key for open-ended "
     "chat. Video-resolution sources are third-party and may change over time."),
    ("Future scope",
     "Fish Audio voice clone (JARVIS voice), on-device/offline STT, optional cloud sync with a "
     "real database, multi-step chained tasks, always-on assistant widget, more Indian "
     "languages, and calendar/email integrations."),
]:
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run(head + "  ")
    r.bold, r.font.size, r.font.name = True, Pt(11), "Times New Roman"
    r2 = p.add_run(txt)
    r2.font.size, r2.font.name = Pt(11), "Times New Roman"

# ── Part E: FAQ ──
para(doc, "E. Viva FAQ \u2014 likely questions with model answers", size=14, bold=True,
     before=14, after=4)

FAQ = [
    ("GENERAL",
     [
      ("What is Syrax?",
       "A voice-driven web agent with a 3D particle interface. You speak one clear sentence; "
       "Syrax either performs it in a real browser tab (open, search, play, close) or answers "
       "it aloud (identity, time, general knowledge)."),
      ("What problem does it solve?",
       "Routine browser tasks still need hands \u2014 menus, typing, tab hunting. Syrax makes them "
       "hands-free while keeping every result visible and controllable in a normal tab."),
      ("How is it different from Google Assistant or Alexa?",
       "Those answer questions and control device-level actions. Syrax operates your actual "
       "browser sessions \u2014 real tabs you can see and take over \u2014 and runs as a transparent, "
       "inspectable web app rather than a closed cloud service."),
      ("How is it different from ChatGPT voice mode?",
       "In Syrax the language model never executes anything; execution comes from a local "
       "deterministic parser, so the system cannot claim it opened or played something it "
       "did not. Chat-style models converse and may only describe actions."),
      ("Why the name \u201cSyrax\u201d?",
       "It is our coined assistant name. Because speech engines mishear it (Cyrex, Sirex, "
       "Psycx\u2026), the app normalises every known variant in commands, wake words and display."),
      ("Who created Syrax?",
       "Three students of B.Tech CSE: Ayush Kumar Upadhyay (2500350100012), Navam "
       "(2500350100041) and Sandeep (2500350100057)."),
      ("What were the individual roles?",
       "Ayush \u2014 architecture, AI engine (intent gate + DeepSeek integration) and voice "
       "pipeline; Navam \u2014 frontend interface, 3D particle system and PWA installation; "
       "Sandeep \u2014 browser-operations module, testing/verification and deployment. All three "
       "contributed across modules during reviews."),
      ("What is the current status?",
       "A working, deployed system with the core command set verified live end-to-end; the "
       "roadmap covers voice cloning, offline speech and multi-step tasks."),
     ]),
    ("VOICE (STT / TTS / MIC)",
     [
      ("Which speech-to-text engine do you use?",
       "The browser\u2019s Web Speech API (webkitSpeechRecognition), language set to English "
       "(India), running continuously while the mic is on with interim results for feedback."),
      ("How do you avoid acting on an incomplete sentence?",
       "Results are buffered, not fired immediately. Speech fires only after 1.5 s of silence "
       "or, when the phrase ends on a connector (\u201cby\u201d, \u201cthe\u201d, \u201csearch\u2026), after a 3.5 s grace "
       "period \u2014 Chrome\u2019s own final-result events also push the flush later."),
      ("What is the \u201cone-shot microphone\u201d?",
       "The mic switches ON for a single utterance and always returns to OFF after the task. "
       "It prevents the assistant hearing its own voice, ambient phantom commands and "
       "background listening. Exception: while Syrax is waiting for your answer to its own "
       "\u201cwhich song?\u201d prompt it stays open (25 s auto-off)."),
      ("How does the mic avoid hearing the video/audio?",
       "All media is muted while listening, and the mic is switched off before any reply audio "
       "plays, so TTS and video can never loop back as input."),
      ("What is the TTS chain?",
       "Three layers with timeouts: Fish Audio neural voice (via the optional backend) \u2192 "
       "Pocket TTS on localhost \u2192 the browser\u2019s speechSynthesis, which always works. On static "
       "hosting the backend probes are skipped entirely, so there are no console errors."),
      ("What happens if STT mishears a word?",
       "Known variants of the assistant name are rewritten everywhere (display, commands, "
       "halt phrases), common mishearings like \u201cweekend\u201d \u2192 \u201cThe Weeknd\u201d are mapped, and "
       "stuttered repeats (\u201cthe the\u201d) are collapsed before parsing."),
      ("Does it work offline?",
       "Local commands (open/search/play/halt) and identity/clock answers work with no key "
       "and no LLM. Internet is needed for the speech service, YouTube results and open-ended "
       "chat \u2014 and we state that honestly instead of claiming offline operation."),
     ]),
    ("AI / LLM / PRIVACY",
     [
      ("Which language model do you use?",
       "DeepSeek deepseek-flash with JSON mode, temperature 0.5, max_tokens 384 and thinking "
       "disabled \u2014 tuned for short, structured, low-latency replies."),
      ("Why DeepSeek?",
       "Strong quality at very low cost, fast responses, and a simple REST API usable directly "
       "from the browser, which keeps the architecture serverless."),
      ("What is JSON mode?",
       "The model must answer in a fixed structure {reply, action}. It removes parsing "
       "ambiguity, makes replies first-try reliable, and lets history be stored in the same "
       "shape the model expects."),
      ("Can the LLM open a tab or play a video?",
       "No \u2014 by design it has no actuator. Its system prompt explicitly forbids narrating "
       "unperformed actions. Only the local intent gate can trigger operations."),
      ("Where is the API key stored?",
       "Only in the device\u2019s localStorage under syrax-ds-key, pasted once by the user. It is "
       "never committed to the repository; ?key= links save it and then remove it from the "
       "address bar."),
      ("What happens if no key is configured?",
       "Every voice command still executes; questions receive canned honest replies and the "
       "app offers a one-time key setup panel."),
      ("How is memory handled?",
       "The conversation is persisted in localStorage (syrax-chat-v1) and re-seeded into the "
       "model as the last ~18 JSON-shaped turns after a refresh, so context survives reloads "
       "without any server database."),
      ("What about privacy?",
       "We make only honest claims: prompts are processed by DeepSeek (their provider-side "
       "storage applies), the mic is one-shot, media is muted while listening, and we keep no "
       "server-side database of our own."),
     ]),
    ("BROWSER OPERATIONS",
     [
      ("Why real Chrome tabs instead of an iframe?",
       "Real tabs give transparency and full user control, avoid iframe sandbox restrictions "
       "and satisfy the project rule that every operation must be visible in the browser."),
      ("How do you deal with popup blockers?",
       "Tab reuse first; otherwise window.open is invoked at command time; if blocked, the UI "
       "gives a one-time \u201cAlways allow\u201d guidance plus a permanent \u201cOpen \u21b5\u201d link, and the "
       "next tap anywhere retries the blocked URL. Nothing opens at mic-click."),
      ("How does \u201cplay X\u201d find a video without the YouTube API?",
       "A client-side race of nine public sources (invidious instances, proxies, text proxies) "
       "returns a valid video ID in about two seconds; the first winner gives a direct watch "
       "URL with autoplay."),
      ("What if every source fails?",
       "The tab still opens on YouTube\u2019s search results for the query \u2014 the operation degrades "
       "instead of hanging."),
      ("Does it create duplicate tabs?",
       "No \u2014 Syrax tracks the tabs it opened by kind and reuses them: a second \u201csearch\u201d "
       "continues in the already-open search tab."),
      ("What does \u201cclose the browser\u201d close?",
       "Only tabs Syrax opened (tracked by kind); the user\u2019s own tabs are never touched."),
      ("How do you implement the now-playing strip?",
       "Stage state set when a video tab lands and cleared when that tab closes or a new "
       "operation replaces it \u2014 pure UI reflection of real tab events."),
     ]),
    ("ENGINEERING & DEPLOYMENT",
     [
      ("What is the full tech stack?",
       "React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4, Three.js + React Three Fiber + GSAP "
       "for 3D, Web Speech API for STT/TTS, DeepSeek for NLP, FastAPI (optional sidecar), "
       "GitHub Actions + GitHub Pages for CI/CD, PWA manifest/service worker for install."),
      ("Why React and Vite?",
       "Component model suits the many UI states; Vite gives instant dev start, code-splitting "
       "and a tiny production bundle (Three.js is vendor-split from the app code)."),
      ("Why Three.js particles?",
       "They provide continuous state feedback (idle/listening/thinking/speaking plus mic "
       "level) as pure client-side rendering \u2014 visual identity without extra assets."),
      ("Is there a database?",
       "No server database. Only browser localStorage (chat + API key). Rationale: static "
       "hosting, zero cost, and privacy \u2014 nothing about the user leaves their device except "
       "prompts sent to the LLM provider."),
      ("How is the project deployed?",
       "git push to main triggers a GitHub Actions workflow that runs tsc + vite build and "
       "publishes to GitHub Pages at ayushupadhyay90.github.io/Syrax \u2014 live in ~2 minutes."),
      ("How do you test a voice application?",
       "Three layers: strict TypeScript (zero errors), production build, and a live end-to-end "
       "suite against the deployed URL where every documented phrase is issued (voice "
       "simulated) and the resulting tab URL, status line and chat reply are asserted."),
      ("Which browsers are supported?",
       "Chromium family (Chrome, Edge) on desktop and Android \u2014 full Web Speech support. "
       "Unsupported browsers get an honest message instead of a broken mic."),
      ("Any security measures?",
       "No secrets in the repository; API key confined to localStorage; HTTPS hosting; input "
       "never executed as code (LLM output is parsed as JSON with a schema, actions whitelisted); "
       "questions/negations blocked from executing."),
      ("How large is the codebase?",
       "About 3,887 lines across 14 frontend source files plus ~310 lines of Python backend."),
      ("What is the role of GitHub Actions?",
       "Continuous integration and deployment: every push builds the app and redeploys the "
       "site, replacing hashed bundles so clients always get the current version."),
     ]),
    ("PROJECT MANAGEMENT",
     [
      ("Which methodology did you follow?",
       "SDLC in eight phases \u2014 requirement analysis, design, UI/3D, voice pipeline, "
       "intent+LLM, browser operations, testing, deployment \u2014 with a working increment "
       "reviewed at the end of each phase."),
      ("What was the feasibility conclusion?",
       "Fully feasible: browser-native technical stack, near-zero economic cost, minimal "
       "training for users, and a schedule that fits the academic timeline."),
      ("What are the main limitations?",
       "Recogniser accuracy in noise; a one-time popup permission for slow commands; "
       "open-ended chat needs the user\u2019s own API key; third-party video sources can change; "
       "iOS not yet verified."),
      ("What is the future scope?",
       "Voice cloning (Fish Audio), offline/on-device STT, optional cloud sync with a real "
       "database, multi-step tasks, always-on widget, more languages, and integrations such "
       "as calendar and email."),
      ("What did the team learn?",
       "Layered design separating deterministic actions from probabilistic language; "
       "browser security constraints (popup policies); graceful fallback engineering; and "
       "verification-driven development against a live deployment."),
      ("How do you handle errors and failures?",
       "Every external dependency has a fallback ladder: TTS falls back to the browser voice, "
       "video resolution falls back to the results page, blocked popups fall back to guidance "
       "plus a link, and a missing key falls back to canned replies. Nothing can hang."),
     ]),
]

for cat, items in FAQ:
    para(doc, cat, size=11.5, bold=True, before=10, after=3, font="Times New Roman")
    for i, (q, a) in enumerate(items, 1):
        p = doc.add_paragraph()
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_before = Pt(5)
        rq = p.add_run("Q. " + q + "\n")
        rq.bold, rq.font.size, rq.font.name = True, Pt(11), "Times New Roman"
        ra = p.add_run("A. " + a)
        ra.font.size, ra.font.name = Pt(11), "Times New Roman"

para(doc, "Tip: for the live demo keep the order \u2014 open \u2192 search \u2192 play (with artist) \u2192 "
     "question \u2192 stop. It exercises every subsystem in under a minute.",
     size=10.5, italic=True, before=12, align=L)

about_path = os.path.join(OUT_DIR, "About-Syrax.docx")
doc.save(about_path)
print("saved:", about_path)
