# MILO

MILO is a student financial operating system: one financial identity above all of a student's accounts.

## Run
    npm install
    cp .env.example .env            # fill in Google OAuth + provider credentials
    npm run build                   # web app → dist/
    npm start                       # API + static app on $PORT (production; refuses to start without secrets)

Local development without Google credentials:
    MILO_AUTH_DEV_MODE=true npm run server   # developer sign-in (same account model, no Google)
    npm run dev                              # Vite on :5173, proxies /api and /auth to :8787

    npm test                        # 32 engine tests (vitest)
    python3 e2e.py                  # Playwright end-to-end suite (needs the dev server on :8787)

## Architecture
- `server/index.js` Express API: Google OAuth 2.0 (authorization-code, server-side; state param, id_token verified), signed httpOnly SameSite=Lax session cookies, per-user authorization on every query, origin check on writes, rate limits, CSP/HSTS headers, audit log.
- `server/providers/*` adapter per institution (`status/start/complete/sync/revoke`). Setu Account Aggregator (banks), Zerodha Kite, Upstox (demat) are implemented against their real APIs but report **not available** until credentials exist; `demo.js` is the only synthetic source and is labelled DEMO end to end.
- `server/db.js` SQLite (node:sqlite): users, sessions, connections (tokens AES-256-GCM encrypted), accounts, transactions, user_state, splits, obligations, payments, invites, notifications, emergency requests, audit_log.
- `src/store/store.jsx` loads server slices, assembles the flat state the engines use, persists user-owned edits (corrections, goals, commitments…) as a versioned document; verified-user actions (splits, IOUs, payments, reminders, lending) go through the API.
- `src/components/UserPicker.jsx` verified-user search: registered / multiple matches / none / invite.
- Everything under `src/engines/` is unchanged pure finance logic.

## Hosting (so the app and APK work for everyone)
MILO needs one server. Any of these gets you a public HTTPS URL in a few minutes:
- **Render**: push this repo, "New → Blueprint" (render.yaml), set `MILO_PUBLIC_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Fly.io**: `fly launch --copy-config`, `fly secrets set MILO_SESSION_SECRET=… MILO_ENCRYPTION_KEY=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… MILO_PUBLIC_URL=https://milo.fly.dev`.
- **Any VPS / Docker**: `docker build -t milo . && docker run -p 8787:8787 -v milo-data:/app/data --env-file .env milo` behind an HTTPS reverse proxy.
Then in Google Cloud Console add `${MILO_PUBLIC_URL}/auth/google/callback` as an authorised redirect URI.

## Android
One APK works with any MILO deployment. The app bundles the UI; on first launch it asks for the server
address (e.g. `https://milo.yourcollege.edu`) and remembers it. Google sign-in opens in the system browser
(Google blocks OAuth inside WebViews) and returns through the `com.milo.app://auth` deep link with a single-use
code that the app exchanges for a bearer session; the API accepts that bearer exactly like the browser cookie.
    npm run build && npx cap sync android && cd android && ./gradlew assembleRelease
To ship a pre-configured build, set `VITE_API_BASE=https://milo.yourcollege.edu` before `npm run build`.
