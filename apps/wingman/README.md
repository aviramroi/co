# 🪽 Wingman

A deployable AI agent that manages your conversations across three channels with **one Claude brain**:

1. **Tinder / dating** — reads matches, drafts on-brand replies, paces them like a human.
2. **Facebook Marketplace** — answers inquiries and negotiates quotes on **both** the buyer and seller side.
3. **Facebook Groups** — searches groups for what you want and opens warm, specific outreach.

You stay in control: every outbound message is drafted for your approval by default, with per-channel rate limits and hard safety boundaries.

> This repo has two apps:
> - **`apps/wingman`** (this folder) — the agent + control-panel API. Deployable, headless.
> - **`apps/wingman-web`** — a Next.js landing page + sign-up/onboarding/activation flow that configures and drives this agent.

---

## Why it feels human, not botty

The brain doesn't just decide *what* to say — it decides **when**. For every reply it chooses a
`replyDelaySeconds` based on the hour, how long their message was, and how eager it's reasonable to
seem. Sometimes it fires back in a minute; sometimes it waits hours ("asleep", "at work", playing it
cool). Live channels also type at human speed. The scheduler holds each message until its chosen time.

---

## Quick start (no accounts, no API key)

```bash
cd apps/wingman
npm install --omit=optional
npm run dev          # or: npm run build && npm start
```

It boots in **mock mode**: all three channels fabricate realistic activity so you can watch the full
pipeline — *poll → brain → policy → human-delay → send* — end to end.

Create your operator account (the control panel requires login), then open
**http://127.0.0.1:4600**:

```bash
npm run cli useradd          # prompts for email + password
```

Or create it from the web app's sign-up page (`apps/wingman-web`). Add a Claude API key to swap the
heuristic fallback for the real brain:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

---

## Going live (real accounts)

Live channels use Playwright browser automation against your own account.

```bash
npm install                       # pulls in Playwright
npx playwright install chromium
npm run cli login tinder          # opens a browser; log in; press Enter to save the session
npm run cli login marketplace
npm run cli login groups
```

Then set the channel(s) to `live` in `wingman.config.json` (or via env), and run:

```bash
WINGMAN_TINDER_MODE=live npm start
```

Sessions are saved under `.wingman/sessions/` and reused on every run.

> ⚠️ **Read this.** These platforms forbid automation in their terms of service and actively detect
> it. Use Wingman only for **your own** account, attended, at human pace, and expect to tune the DOM
> selectors in `src/channels/live.ts` (they change often). Keep `requireApproval: true`. This is a
> reference implementation, not a way to operate at scale or evade detection.

---

## Configuration

Copy `wingman.config.example.json` → `wingman.config.json` and edit, or let the **wingman-web**
onboarding flow write it for you via the API. Env overrides:

| Env | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Enables the Claude brain (else heuristic fallback) |
| `WINGMAN_MODEL` | Model id (default `claude-opus-4-8`) |
| `WINGMAN_<APP>_MODE` | `mock` \| `live` \| `off` per channel |
| `WINGMAN_PORT` / `PORT` | Control-panel port (default 4600) |
| `WINGMAN_STATE_DIR` | State + sessions dir (default `.wingman`) |
| `WINGMAN_HEADFUL` | `1` to run live browsers headed |

---

## How it works

```
                 ┌── tinder ──┐
  channels ──────┤ marketplace ├── poll() ─▶ ingest ─▶ Store (conversations)
   (mock/live)   └── groups ───┘                          │
                                                          ▼
                                    Brain (Claude) ── decide() per thread
                                     action: reply | wait | escalate | close
                                     + replyDelaySeconds (human timing)
                                                          │
                                                          ▼
                                    Policy ── rate limits · approval gate · scam interlock
                                                          │
                            ┌── requireApproval ──▶ Approval queue ──▶ (you click approve)
                            └── auto ──▶ PendingSend (sendAt = now + delay)
                                                          │
                                              scheduler dispatches when due ─▶ channel.sendMessage()
```

- **`src/agent/`** — the brain (`brain.ts`) and prompts (`prompts.ts`). Structured JSON decisions.
- **`src/channels/`** — `Channel` interface, `mock.ts`, `live.ts` (Playwright), `browser.ts` (sessions).
- **`src/core/`** — `orchestrator.ts` (loop), `store.ts` (state), `policy.ts` (guardrails).
- **`src/server/`** — control-panel HTTP API + dashboard the web app talks to.

---

## Control-panel API

JWT-protected (except `/api/health` and `/api/auth/*`). The web app talks to it through its own BFF,
so the browser holds an httpOnly cookie, never the token.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` | public¹ | Create operator account → `{ token }` |
| `POST` | `/api/auth/login` | public | `{ email, password }` → `{ token }` |
| `GET` | `/api/auth/me` | bearer | Current operator |
| `GET` | `/api/state` | bearer | Stats, approvals, conversations, queued sends, channel status |
| `POST` | `/api/approvals/:id` | bearer | `{ decision: "approve" \| "reject", text? }` |
| `GET` / `POST` | `/api/config` | bearer | Read / update persona, goals, channel modes |
| `GET` | `/api/channels` | bearer | Per-channel mode + connection status |
| `POST` | `/api/channels/:p/login/{start,complete,cancel}` | bearer | Drive a browser login |
| `GET` | `/api/health` | public | Liveness + brain kind |

¹ Signup is allowed for the first (bootstrap) account; further signups require `WINGMAN_ALLOW_SIGNUP=1`.

Security: `WINGMAN_AUTH_SECRET` is **required** in production (`NODE_ENV=production`); scrypt-hashed
passwords, HS256 tokens, per-IP login rate limiting, CORS locked to `WINGMAN_WEB_ORIGIN`, and
security headers. Run behind TLS (reverse proxy) when exposed.

---

## Deploy

**Both apps together (recommended) — Docker Compose:**

```bash
export WINGMAN_AUTH_SECRET=$(openssl rand -hex 32)
export ANTHROPIC_API_KEY=sk-ant-...            # optional
docker compose -f apps/wingman/docker-compose.yml up --build
# → web at http://localhost:3000, agent at http://localhost:4600
```

**Agent alone:**

```bash
docker build -t wingman apps/wingman
docker run -p 4600:4600 \
  -e NODE_ENV=production -e WINGMAN_AUTH_SECRET=$(openssl rand -hex 32) \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -v wingman-state:/app/.wingman wingman
```

Mock mode runs anywhere. Live mode needs Playwright + Chromium in the image and saved sessions on the
mounted volume — and a display for the one-time login (run `wingman login <app>` on a machine with a
browser, or use xvfb). The `.wingman` volume holds accounts, state, and saved sessions — persist it.

---

## Safety & responsibility

- Human approval is on by default; scam/off-platform-payment signals **force** approval.
- Hard boundaries (money, address, private first meetings) are baked into the persona prompt.
- Daily per-channel send caps. Nothing runs unattended without you flipping the switches.
- Respect each platform's terms and the people you're talking to. Don't deceive about material facts.
