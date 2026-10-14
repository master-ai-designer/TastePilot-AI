# TastePilot AI

A multilingual, AI-powered cultural discovery agent for anime, films, series, music, books, food, travel, places, hobbies, and experiences.

## Agent experience

- **Conversation continuity:** Uses recent chat history to understand follow-up questions and avoid asking for details already supplied.
- **Taste-aware suggestions:** Uses explicit preferences and locally saved taste signals to tailor recommendations.
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

## Privacy notes

- The simple taste profile and recent chat history are stored in the current browser's local storage.
- Do not put secrets in frontend code or commit a real `.env` file.
- Deploy secrets as server-side environment variables.
- The current taste profile is lightweight keyword-based personalization, not a trained personal model.
- The agent can attempt several languages, but every language and every recommendation category still needs real-world testing.

## API routes

- `POST /api/chat` — AI conversation.
- `POST /api/media-search` — public catalogue lookup for music/movie results.
- `POST /api/discover` — Qloo discovery route (verify the current Qloo API contract and returned schema before relying on it in production).
- `GET /api/auth-config` — public Supabase client configuration only; never expose a service-role key.
