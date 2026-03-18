# SkillNest Deployment

## Recommended Setup

Use one of these paths:

1. Render for the full app
   This is the best fit because the app uses a Node server and SQLite database with persistent storage.

2. Netlify or Vercel for the frontend, plus Render or Railway for the backend
   This works well if you want the public pages on a static host and the API on a separate backend host.

## Resend Notifications

Resend is the recommended setup for Render Free because it uses an API instead of SMTP ports.

Required `.env` values:

```env
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=SkillNest <onboarding@resend.dev>
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
5. Keep the Render disk enabled so `data/skillnest.db` persists.
6. Confirm the health check passes at `/api/health`.
7. Open `/admin-login.html` after deploy and verify:
   login, workshop CRUD, lead status update, and `Send Test Email`.

Suggested `ALLOWED_ORIGINS` on Render:

```env
ALLOWED_ORIGINS=https://your-render-domain.onrender.com
```

## Frontend on Netlify or Vercel

If you deploy the frontend separately, edit [`config.js`](./config.js) and set:

```js
window.SKILLNEST_CONFIG = {
  apiBase: "https://your-backend-domain.com",
};
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
