/**
 * Syrax's signature introduction (written by the user).
 * Shown in the About overlay, posted to the conversation and spoken via TTS
 * whenever the "About Syrax" command fires (card click, voice or typed).
 */

/** Identity, creators, capabilities. */
export const ABOUT_INTRO =
  "Hello, I'm SYRAX — your voice AI assistant. " +
  "I'm built by three legendary coders — Ayush, Navam, and Sandeep. " +
  "I'm designed to understand your voice, assist you with your tasks, " +
  'and make your digital experience smarter, faster, and more convenient. ' +
  "I'm here to listen, assist, and work with you."

/** The closing brand line. */
export const ABOUT_PUNCHLINE = 'This is SYRAX AI. Your voice. Your commands.'

/** Full spoken version. */
export const ABOUT_TEXT = `${ABOUT_INTRO} ${ABOUT_PUNCHLINE}`

/**
 * Spoken variant for TTS (display text above stays verbatim):
 *  - "Navam" → "Navm" (correct pronunciation)
 *  - "Your voice. Your commands." → one line, no mid-sentence stops
 */
export const ABOUT_SPOKEN = `${ABOUT_INTRO.replace('Navam', 'Navm')} This is SYRAX AI. Your voice your commands.`

/** What Syrax can actually do — rendered as chips in the About overlay. */
export const ABOUT_OPERATIONS: { icon: string; label: string; detail: string }[] = [
  { icon: '🎵', label: 'Play songs', detail: 'YouTube, hands-free with autoplay' },
  { icon: '📺', label: 'Open YouTube', detail: 'Browse & search any video' },
  { icon: '🌐', label: 'Open a tab', detail: 'Google search, zoomed in' },
  { icon: '⚡', label: 'Close browser', detail: 'Just say “close the browser”' },
  { icon: '💬', label: 'Ask anything', detail: 'Type or speak — real answers' },
  { icon: '🛑', label: 'Always stoppable', detail: 'Say “stop” to halt anything, anytime' },
]
