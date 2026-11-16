# JARVIS Gemini free-tier voice

This describes the original Gemini rollout. Current hosted voice uses [Cloudflare Workers AI with the optional local companion](jarvis-hosted-voice.md).

Hosted JARVIS uses the Gemini Developer API with the Charon voice and a British English speaking instruction. Start a conversation once, then speak and follow up without clicking. “Hey JARVIS, stop” interrupts a turn where browser support permits it. “Stop listening” ends the session. The standalone companion uses local Kokoro.

On the free tier Google may use the submitted text to improve its products. VAOS asks for consent before sending reply text and keeps that consent in the current tab. Use hosted readback only for text you are allowed to share with Google. This endpoint sends reply text for synthesis. Microphone recognition has its own browser permission and consent.

The founder and same-origin checks protect `/api/voice-speech`. The existing R2 bucket holds an atomic counter for 1,000 reply characters and 12 requests per UTC day. The Worker stops on the provider’s rate limit. It does not use a paid fallback.

## Commissioning

1. In [Google AI Studio](https://aistudio.google.com/api-keys), use a Gemini Developer API project verified as Free with billing disabled. The API key alone cannot prove its project tier. See [Gemini pricing and data use](https://ai.google.dev/gemini-api/docs/pricing).
2. Store the key in the Cloudflare Worker secret named `VAOS_GEMINI_FREE_TTS_API_KEY`. The existing feature bundle uses `VAOS_GOOGLE_TTS_CONTROL=founder-gemini-free-v1`. Keep the credential out of source, logs and chat.
3. Coordinate the secret change with the main build before merging. If the Worker is at the Free binding limit, stage the previous voice secret removal and Gemini secret addition on the same candidate version. Keep the last verified version available for rollback.
4. Verify the candidate deployment identity. Sign in as founder, open the JARVIS voice settings and play the sample. Start a visible workspace conversation, ask a permitted question, follow up aloud, and interrupt and stop by voice. Confirm audible playback and verify headers `X-VAOS-Voice-Provider: google-gemini` and `X-VAOS-Voice-Profile: gemini-2.5-flash-preview-tts-Charon`. Use synthetic or shareable content for commissioning.
5. If the live check fails, restore the last verified Worker through the normal release process and confirm the live version. No database changes are required.
