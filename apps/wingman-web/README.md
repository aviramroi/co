# 🪽 Wingman — Web

The marketing landing page and the full **sign-up → onboarding → activation** flow for the
[Wingman agent](../wingman). Built with Next.js (App Router).

## Run

```bash
cd apps/wingman-web
npm install
npm run dev            # http://localhost:3000
```

Point it at your running agent (defaults to `http://127.0.0.1:4600`):

```bash
NEXT_PUBLIC_WINGMAN_API=http://127.0.0.1:4600 npm run dev
```

## The flow

| Route | Purpose |
|---|---|
| `/` | Landing page — value prop, the three channels, how it works |
| `/signup` | Create your operator account (bootstrap) |
| `/login` | Log back in; resumes onboarding or jumps to the dashboard |
| `/onboarding` | 6-step wizard → writes config to the agent and activates it |
| `/dashboard` | Live view of the running agent: stats, approvals, conversations |

### Onboarding steps

1. **Choose apps** — Tinder, Marketplace, Groups (any mix).
2. **Connect & log in** — triggers a real browser login on the agent host (via
   `POST /api/agent/channels/:p/login/start`) and polls until the session is saved.
3. **Your voice** — name, texting style, hard boundaries.
4. **Goals** — per-app: dating intent, items to buy/sell + prices, group searches.
5. **Behavior** — human-like timing, approve-first, daily limits.
6. **Activate** — posts the config to the agent's `/api/config` and drops you on the dashboard.

The wizard persists progress to `localStorage`, so users can leave and resume. Activation calls the
agent API; if the agent isn't running yet, setup is saved and the dashboard reconnects when it comes
up.

## Auth (production)

Real auth via a BFF pattern:

- Sign-up/login POST to same-origin route handlers (`app/api/auth/*`), which call the agent and set
  an **httpOnly cookie** — the JWT never touches browser JS.
- `middleware.ts` gates `/onboarding` and `/dashboard`; unauthenticated users are redirected to
  `/login`.
- All agent calls go through `app/api/agent/[...path]`, which injects the token from the cookie and
  proxies to the agent. The agent URL (`WINGMAN_API`) is server-side only and never exposed.

The first account created is the bootstrap operator; the agent closes further sign-ups unless
`WINGMAN_ALLOW_SIGNUP=1`.

## Deploy

Standalone Docker image (`output: "standalone"`):

```bash
docker build -t wingman-web apps/wingman-web
docker run -p 3000:3000 -e WINGMAN_API=http://agent:4600 wingman-web
```

Or run both apps together with `docker compose -f apps/wingman/docker-compose.yml up --build`.
