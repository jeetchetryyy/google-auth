# google-auth

SuperTokens (EmailPassword) + Express + MongoDB example.

## Setup

1. `npm install`
2. Create `.env` with:
   - `SUPERTOKENS_CONNECTION_URI`
   - `SUPERTOKENS_API_KEY`
   - `MONGODB_URI`
   - `PORT` (optional, default 3000)
3. `npm run dev`
4. Open http://localhost:3000

## Scripts

- `npm run build` — bundle `src/auth.js` → `public/auth.js` with esbuild
- `npm run watch` — rebuild on change
- `npm run dev`   — build, then start server
- `npm start`     — same as dev
