# TastePilot AI

A multilingual, AI-powered cultural discovery agent for anime, films, series, music, books, food, travel, places, hobbies, and experiences.

## Agent experience

- **Conversation continuity:** Uses recent chat history to understand follow-up questions and avoid asking for details already supplied.
- **Qloo discovery:** Tries Qloo Insights with tag IDs resolved from Qloo's tag catalogue; falls back to ordinary catalogue search when a suitable taste tag cannot be resolved. The UI labels the result source so catalogue matches are not presented as affinity-ranked Insights.
- **Result details:** Normalizes catalogue descriptions for display and gives cautious explanations when metadata is incomplete.
- **Taste feedback:** Positive and negative feedback is stored locally as lightweight signals; it is not a trained user model.
- **Positive and negative feedback:** The browser can keep simple preference and dislike signals on the user's device; the latest request takes priority.
- **Multilingual replies:** The model is instructed to respond in the language and script the user is currently using.
- **Honest recommendations:** The agent is instructed not to invent live prices, ratings, opening hours, availability, links, or Qloo results.
- **Media discovery:** The server can search connected public catalogues and distinguishes a free preview from verified free full access.
- **Graceful AI fallback:** Chat requests have a timeout and can retry through the configured fallback model for selected temporary/model errors.

## Run locally

Requirements: a current Node.js release.

```bash
npm install
```

Create a local `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
# Optional: enables live Qloo discovery when configured and correctly integrated
QLOO_API_KEY=your_qloo_api_key
```

Start the server:

```bash
npm start
```

Then open `http://localhost:3000`.

## Tests

Run the lightweight route smoke tests with:

```bash
npm test
```

These tests cover the homepage, input validation, and public auth configuration. They do not replace live Qloo/Gemini integration tests, which require valid server-side API keys.

## Privacy notes

- The simple taste profile and recent chat history are stored in the current browser's local storage.
- Do not put secrets in frontend code or commit a real `.env` file.
- Deploy secrets as server-side environment variables.
- The current taste profile is lightweight keyword-based personalization, not a trained personal model.
- The agent can attempt several languages, but every language and every recommendation category still needs real-world testing.

## API routes

- `POST /api/chat` — AI conversation.
- `POST /api/media-search` — public catalogue lookup for music/movie results.
- `POST /api/discover` — Qloo Insights-first discovery with a catalogue-search fallback. Live recommendation quality still depends on tag resolution, API access, and real request testing.
- `GET /api/auth-config` — public Supabase client configuration only; never expose a service-role key.
