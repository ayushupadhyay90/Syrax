# Syrax — Project & Interview Preparation

## Project overview

Syrax is a voice-driven AI assistant with an animated 3D interface. Users can speak or type requests, ask questions, search Google or YouTube, play videos, and hear spoken responses. The interface visualizes assistant activity and includes a browser/video panel.

## Tech stack

| Area | Technologies | How Syrax uses them |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Builds the interactive single-page app with typed components and fast development/build tooling. |
| Styling | Tailwind CSS 4 | Utility-based styling for the HUD, chat, operation cards, and browser panel. |
| 3D graphics | Three.js, React Three Fiber, GLSL shaders, `thinking-orbs` | Renders animated particle/orb visuals that respond to assistant state and microphone amplitude. |
| Animation | GSAP | Animates the embedded browser panel as it expands or docks. |
| Speech-to-text | Browser Web Speech API | Produces live interim and final transcripts; configured for `en-IN`. |
| Audio analysis | Web Audio API | Reads microphone amplitude for visual reactivity. |
| AI | DeepSeek or Groq chat-completions API | Answers questions and returns structured assistant actions. Provider selection is configured server-side. |
| Backend | Python, FastAPI, Pydantic, HTTPX | Provides local API endpoints, validates request payloads, and calls external services without exposing keys to the browser. |
| Deployment API | Vercel serverless functions (JavaScript) | Provides deployed equivalents of chat, TTS, and YouTube search endpoints. |
| Text-to-speech | Fish Audio, optional Pocket TTS, browser speech synthesis | Tries providers in sequence and falls back when a provider is unavailable. |
| Browser/video | iframe, YouTube embeds, Google search | Displays web/video content in the assistant’s animated browser panel. |
| Persistence/PWA | `localStorage`, service worker, web manifest | Keeps chat history on the device and supports installation as a web app. |

## Architecture and request flow

1. The user speaks into the microphone or types a request.
2. The Web Speech API transcribes voice in the browser. The Web Audio API separately measures mic amplitude for the visuals.
3. Clear commands such as play, open, or close are recognized locally for a faster response. Other messages are sent to `/api/chat`.
4. The API endpoint calls DeepSeek or Groq using a server-side API key. The expected result is a JSON-shaped reply/action.
5. The frontend interprets the action, updates the UI, and may open a browser panel, resolve a YouTube video, or display a reply.
6. Syrax speaks the response using the Fish Audio → Pocket TTS → browser speech synthesis fallback chain.

## Interview introduction (about 45 seconds)

> “Syrax is a voice-controlled AI assistant built with React, TypeScript, and Vite. It combines browser speech recognition, local intent handling, and a server-side LLM API to answer questions and carry out actions such as searching YouTube. The interface uses Three.js and React Three Fiber for an animated audio-reactive visual, while GSAP animates the browser panel. For spoken responses, it supports a fallback chain across hosted, local, and browser text-to-speech providers. I focused on connecting the voice, AI, UI, and media pieces into one responsive experience while keeping API credentials on the server.”

## Likely interview questions and answer points

### 1. What problem does Syrax solve?

It offers a hands-free conversational interface for asking questions and performing simple browsing/media actions. Its visual states make it clear whether the assistant is listening, processing, searching, or responding.

### 2. Explain the system architecture.

Describe the request flow above. Separate the browser-side responsibilities (UI, speech recognition, local command parsing, animation) from server-side responsibilities (credentials and external API calls). Mention both the local FastAPI setup and the Vercel serverless routes used for deployment.

### 3. Why do some commands run locally instead of going to the LLM?

A local intent matcher can execute common, clear commands with less latency and without depending on an LLM request. The LLM remains useful for open-ended questions. The trade-off is that a local parser only understands patterns it has been designed to recognize, so ambiguous inputs should not trigger actions.

### 4. How do you stop a model response from triggering an unintended action?

The model is asked for a structured JSON response with an action type. The client parses and validates the result and checks whether the user’s original message supports an action. Unknown or questionable actions should degrade to a normal reply. In a production system, also validate the schema server-side and test adversarial, ambiguous, negative, and question-form inputs.

### 5. How does speech recognition work?

The frontend uses the Web Speech API, including interim results for live feedback and final results for command handling. It requests microphone access and handles unsupported browsers, permission errors, duplicate final transcripts, and recognition restarts. Browser support and recognition behavior can vary, so the UI should explain when speech input is unavailable.

### 6. How do the visuals react to voice?

A microphone analyser calculates an RMS-like amplitude value and stores it in a shared value. The render loop reads this value and passes intensity to the Three.js particle field. The shader animates particles on the GPU, avoiding a React state update for every animation frame.

### 7. Why use a custom shader for the particles?

A shader performs particle movement, pulse, point sizing, and color-related rendering on the GPU. This is suitable for a large visual field and avoids calculating and updating every particle through React. The current implementation creates 12,000 particles; performance should still be checked on lower-end devices.

### 8. How are API secrets protected?

Provider keys are stored in server environment variables and the browser calls the application’s API routes rather than calling the LLM/TTS provider with a secret. Never put secret keys in `VITE_` variables because those are exposed to client bundles. Production should also add rate limits, request-size limits, and careful error handling.

### 9. What is the TTS fallback strategy?

Syrax tries Fish Audio through a server proxy, then an optional Pocket TTS endpoint, then the browser’s `speechSynthesis`. This helps the app continue speaking if a provider is missing or unavailable, though each fallback has different voice quality, latency, and network/local-server requirements.

### 10. How does YouTube search work?

The frontend asks the API to resolve a query into video IDs, then embeds a real video ID. This avoids relying on YouTube’s search-results embed behavior. The current backend extracts results from YouTube’s results page, which is brittle because page markup can change; an official API or another supported integration would be more robust where available.

### 11. How is chat history stored?

The Stage saves a bounded conversation history in `localStorage`, so it survives a refresh on the same browser and origin. It is device/browser-local, not an account-based synchronized history. Avoid storing sensitive conversations without explicit user expectations and safeguards.

### 12. What are the main technical challenges?

Good topics to discuss include coordinating asynchronous speech and AI calls, preventing accidental actions, managing microphone permissions and browser differences, handling external provider failures, synchronizing animations with UI state, and keeping rendering smooth.

### 13. What would you improve next?

- Add unit tests for intent parsing, action validation, and query cleanup.
- Add end-to-end tests for voice/text request flows and API failures.
- Validate AI output against a strict schema on the server as well as the client.
- Add request rate limiting, logging that avoids sensitive transcripts, and stronger input limits.
- Make speech recognition support and data handling clear to users; browser speech recognition may involve browser/vendor services.
- Replace HTML scraping for YouTube results with a supported, stable API/integration where feasible.
- Measure performance on mobile and provide a reduced-motion/low-power visual mode.
- Improve accessibility with keyboard navigation, focus management, captions/transcripts, and screen-reader status announcements.

## Be precise about these details

- Do not say all speech processing is local: the Web Speech API is browser-provided and its recognition service behavior depends on the browser/provider.
- Do not claim chat history syncs between devices: the Stage stores it in localStorage on the current browser/origin.
- Distinguish the local FastAPI backend from the Vercel serverless API used for deployment.
- The project has a Stage-based primary view and an alternate full HUD view; describe the view you actually demonstrate.
- Describe DeepSeek/Groq and Fish/Pocket/browser TTS as supported/configurable providers, not as services that are necessarily all active at once.
