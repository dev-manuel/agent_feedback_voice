# Agent Hint Speaking (MCP)

MCP server that exposes a **`feedback_speaker`** tool. The Cursor agent calls it when it has a task or short message for you; the text is spoken via TTS (natural Edge TTS by default, or macOS `say` / Windows SAPI).

No API keys. Free. Works in German and English.

## Setup

1. Build the MCP server (required for the natural voice; `npm install` pulls in Edge TTS):

   ```bash
   cd /path/to/agent_feedback_voice
   npm install
   npm run build
   ```
   If you skip `npm install` or run the server without this project’s `node_modules`, it will fall back to the system `say` voice, which sounds worse.

2. Add the server in Cursor (Settings → Tools & MCP, or `~/.cursor/mcp.json`):

   ```json
   {
     "mcpServers": {
       "feedback_speaker": {
         "command": "node",
         "args": ["/ABSOLUTE/PATH/TO/agent_feedback_voice/dist/index.js"]
       }
     }
   }
   ```
   Use the key `feedback_speaker` and the **absolute path** to `dist/index.js`. Restart Cursor after adding.

   **If the UI shows “No tools, prompts or resources”:** Check the MCP log (click the server → Show Output). If it says “Found 1 tools”, the server is fine and the tool is available to the **Agent in Composer**. The settings UI can show “No tools” even when the backend has the tool. Use the Agent in a chat and try having it call `feedback_speaker`; or in MCP settings ensure the server is **enabled** / not restricted by the allowlist.

3. Tell the agent to use the tool. Put instructions in your system prompt or a project file (e.g. `AGENT_PROMPT.md`). Example: *When you have a task for me or want to give me short voice feedback, call the `feedback_speaker` tool with that text.*

## Tool: `feedback_speaker`

- **`text`** (required): The phrase to speak (e.g. task instruction or short feedback).

Voice is fixed in code (default: male — Daniel on macOS `say`, en-US-GuyNeural for Edge TTS). Override via env: `MCP_SPEAK_VOICE`, `MCP_SPEAK_EDGE_VOICE`.

Example (agent usage):

```json
feedback_speaker({ "text": "Open the browser and check the log." })
```

## Voice and behaviour

**Default: Edge TTS** (natural online voice, no API key, needs network).

- **Engine:** `MCP_SPEAK_ENGINE=edge-tts` (default), `say`, or `openai-tts` (needs `OPENAI_API_KEY`).
- **OpenAI TTS** (when engine is `openai-tts`): Voice `MCP_SPEAK_OPENAI_VOICE=onyx` (default). Options: alloy, echo, fable, onyx, nova, shimmer. Model `MCP_SPEAK_OPENAI_MODEL=tts-1-hd` (or `tts-1`). Only used on macOS (plays via afplay).
- **Edge voice:** `MCP_SPEAK_EDGE_VOICE=en-US-GuyNeural` (default). Others: `en-US-AriaNeural`, `en-US-JennyNeural`. List with `npx edge-tts voice-list`.
- **Say voice** (when engine is `say`): `MCP_SPEAK_VOICE=Daniel` (default). List macOS voices with `say -v '?'`.

**Volume and rate:**

- **Volume boost:** Off by default. Set `MCP_SPEAK_BOOST_VOLUME=1` to temporarily raise system volume during TTS.
- **TTS volume (0–100):** `MCP_SPEAK_TTS_VOLUME=100`.
- **Say rate (words per minute):** `MCP_SPEAK_RATE=130` (only when engine is `say`).

## Better AI voices (optional)

Edge TTS and `say` are free but often sound clearly synthetic. If you want a **more natural, less “generated”** voice, these are the main options:

| Option | Quality | Cost | Notes |
|--------|--------|------|--------|
| **ElevenLabs** | Often rated best: very natural, emotional | Free: 10k chars/month; then ~$0.10/min | REST API + official `elevenlabs` npm package. Many voices, 32 languages. |
| **OpenAI TTS** | Very good; high scores in naturalness/prosody | ~$0.015/1k chars (tts-1) or ~$0.03/1k chars (tts-1-hd) | Simple API, 6 voices, 57 languages. Easy to add as another engine in this server. |
| **Google Cloud TTS** | Very good (Neural2) | Free tier: 1M chars/month WaveNet | Needs GCP account and setup. |
| **Azure Speech** | Very good, expressive | Free: 0.5M chars/month neural | Needs Azure account. |
| **Kokoro (local)** | Good, natural for open-source | Free, runs on your machine | No API key; CPU-only. Would need a local Kokoro server or CLI to call from Node. |

**Practical recommendation:** For “richtig gute” Stimme mit wenig Aufwand:

1. **ElevenLabs** – Free tier reicht für kurze Agent-Hinweise (z.B. 5 Wörter pro Nachricht). API-Key unter `ELEVENLABS_API_KEY`, dann im Code einen Engine `elevenlabs` einbauen.
2. **OpenAI TTS** – bereits eingebaut: `MCP_SPEAK_ENGINE=openai-tts` und `OPENAI_API_KEY=sk-…` in der MCP-Config (env). Stimme z.B. `onyx`, Modell `tts-1-hd`. Preis pro Zeichen, kein Free-Tier.

## Requirements

- **Node.js** 18+
- **macOS:** `say` and `afplay` (for Edge TTS playback). For Edge TTS, the server uses `@andresaya/edge-tts` (installed with `npm install` in `mcp-speak`).
- **Windows:** PowerShell + SAPI when engine is `say`. Edge TTS is not used on Windows in this server.

## Project layout

- **`mcp-speak/`** – MCP server source and build. All commands above run from here.
- **`AGENT_PROMPT.md`** – Example instructions you can give the Cursor agent so it uses `feedback_speaker`.

## License

MIT.
