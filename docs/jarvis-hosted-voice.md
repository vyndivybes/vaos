# JARVIS voice and Spatial Command recall

Start a conversation in the VAOS workspace and grant microphone access. Ask a question, listen to the reply, then ask a follow-up aloud. Say “Hey JARVIS, stop” to interrupt on supported browsers. Say “stop listening” or hide the tab to end the microphone session.

Hosted playback uses Orpheus through the existing Cloudflare Workers AI binding. The same-origin founder endpoint reserves up to 6,000 reply characters per UTC day, approximately 8,182 Neurons at the documented Aura-1 rate. The account-wide Workers Free allowance is 10,000 Neurons and is shared with other features. VAOS does not retry a rejected synthesis or use a paid fallback. Cloudflare receives the spoken reply text. The voice panel requests consent before use. [Model](https://developers.cloudflare.com/workers-ai/models/aura-1/) and [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

To speak without using hosted quota, run the [local companion with Kokoro](jarvis-local-voice-memory-upgrade.md) and choose **Local neural voice connection** in the workspace. The local companion must have its models installed. Speech selection is explicit and lasts for the current tab.

Spatial Command remembers the last view, sheet or 3D Knowledge node in this tab for 30 minutes. Ask “Where did I leave off?” to hear its name and get a return link. Only an allowlisted selection and timestamp are stored. This memory clears on sign-out and excludes document content, microphone audio, camera frames and other tabs.

For rollout, use the existing Worker and R2 binding. Verify Cloudflare Workers Free, promote the reviewed version, and test an authenticated question and spoken follow-up. Keep the previous Cloudflare version available for rollback.
