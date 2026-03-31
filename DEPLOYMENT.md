# VidyaOps Deployment

## Recommended Setup

Use one of these paths:

1. Render for the full app
   This is the best fit because the app uses a Node server and SQLite database with persistent storage.

2. Netlify or Vercel for the frontend, plus Render or Railway for the backend
   This works well if you want the public pages on a static host and the API on a separate backend host.

## Portability First

The app now uses environment-driven deployment behavior so moving platforms is mostly config work instead of code changes.

Important portability env vars:

```env
PLATFORM_TARGET=generic
SERVER_RUNTIME_MODE=long-running
ENABLE_BACKGROUND_JOBS=true
PUBLIC_API_BASE=
DATA_DIR=./data
# DB_PATH=./data/skillnest.db
```

What they do:

- `PLATFORM_TARGET`
  Use values like `render`, `vercel`, `railway`, or `generic` for deployment labeling and runtime awareness.
- `SERVER_RUNTIME_MODE`
  Use `long-running` for traditional Node hosts and `serverless` for Vercel-style runtimes.
- `ENABLE_BACKGROUND_JOBS`
  Controls whether the built-in nurture loop starts automatically.
- `PUBLIC_API_BASE`
  Lets the frontend point to a separate backend without editing source files.
- `DATA_DIR` / `DB_PATH`
  Makes local persistent storage configurable instead of hardcoded.

## Platform Notes

### Render / Railway / VPS

Recommended values:

```env
PLATFORM_TARGET=render
SERVER_RUNTIME_MODE=long-running
ENABLE_BACKGROUND_JOBS=true
PUBLIC_API_BASE=
```

These hosts are the best fit for the current SQLite + long-running background job architecture.

### Vercel

Use Vercel in one of these ways:

1. Frontend-only on Vercel, backend elsewhere
   This is the recommended setup for the current app.
2. Full migration after replacing SQLite and long-running jobs

Important note:

- The current backend uses SQLite and background nurture jobs, so the safest Vercel setup today is `frontend on Vercel + backend on Render/Railway/VPS`.
- `vercel.json` is now configured for static frontend deployment, not for the current Node + SQLite backend.

Recommended frontend env values on Vercel:

```env
PUBLIC_API_BASE=https://your-backend-domain.com
PUBLIC_RUNTIME_MODE=serverless
PUBLIC_PLATFORM_TARGET=vercel
```

Recommended backend values if you later move the backend to a serverless platform:

```env
PLATFORM_TARGET=vercel
SERVER_RUNTIME_MODE=serverless
ENABLE_BACKGROUND_JOBS=false
```

On Vercel, long-running `setInterval` jobs are not the right primitive; use Cron Jobs / queues / workflows instead.

## Resend Notifications

Resend is the recommended setup for Render Free because it uses an API instead of SMTP ports.

Required `.env` values:

```env
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=VidyaOps <onboarding@resend.dev>
NOTIFY_EMAIL_TO=nileshdgaikwad8805@gmail.com
```

Resend’s docs show sending through their Email API from Node.js and note you should create an API key and verify a domain for production sending: [Send emails with Node.js](https://resend.com/docs/send-with-nodejs), [Send Email API](https://resend.com/docs/api-reference/emails), [Managing Domains](https://resend.com/docs/dashboard/domains/introduction).

After updating `.env`, restart the server and use the `Send Test Email` button in the admin dashboard.

## Full App on Render

1. Push this project to GitHub.
2. Create a new Render Web Service from the repo.
3. Use the included `render.yaml`.
4. Add environment variables from `.env.example`, including:
   `GEMINI_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, Resend values, and `ALLOWED_ORIGINS`.
5. Keep the Render disk enabled so `data/skillnest.db` persists. The existing DB filename stays unchanged for compatibility.
6. Confirm the health check passes at `/api/health`.
7. Open `/admin-login.html` after deploy and verify:
   login, workshop CRUD, lead status update, and `Send Test Email`.

Suggested `ALLOWED_ORIGINS` on Render:

```env
ALLOWED_ORIGINS=https://your-render-domain.onrender.com
```

## Frontend on Netlify or Vercel

If you deploy the frontend separately, Vercel now generates [`config.js`](./config.js) at build time from env vars.

Vercel build command:

```bash
npm run build:vercel
```

Set these env vars in Vercel:

```env
PUBLIC_API_BASE=https://your-backend-domain.com
PUBLIC_RUNTIME_MODE=serverless
PUBLIC_PLATFORM_TARGET=vercel
```

Then update `ALLOWED_ORIGINS` on the backend to include your frontend domain, for example:

```env
ALLOWED_ORIGINS=https://your-site.netlify.app,https://your-site.vercel.app
```

Then deploy the static files:

- Netlify uses [`netlify.toml`](./netlify.toml)
- Vercel can serve the static frontend, or you can deploy the full app using [`vercel.json`](./vercel.json) for demo purposes

## Important Note About Vercel

The included `vercel.json` lets you deploy the whole app quickly, but Vercel serverless storage is not ideal for persistent SQLite data.
Use Render or another persistent Node host for production.
