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
| `/signup` | Create an account (demo: stored locally in the browser) |
| `/login` | Log back in; resumes onboarding or jumps to the dashboard |
| `/onboarding` | 6-step wizard → writes config to the agent and activates it |
| `/dashboard` | Live view of the running agent: stats, approvals, conversations |

### Onboarding steps

1. **Choose apps** — Tinder, Marketplace, Groups (any mix).
2. **Connect & log in** — link each account (in production this saves a browser session, à la
   `wingman login <app>`).
3. **Your voice** — name, texting style, hard boundaries.
4. **Goals** — per-app: dating intent, items to buy/sell + prices, group searches.
5. **Behavior** — human-like timing, approve-first, daily limits.
6. **Activate** — posts the config to the agent's `/api/config` and drops you on the dashboard.

The wizard persists progress to `localStorage`, so users can leave and resume. Activation calls the
agent API; if the agent isn't running yet, setup is saved and the dashboard reconnects when it comes
up.

## Notes

- The account/auth here is a **front-end demo** (local storage) so the flow is fully clickable
  without a backend user database. Swap `lib/store.ts` for real auth (NextAuth, Clerk, your own API)
  in production.
- All agent interaction goes through `lib/wingman.ts` against the control-panel API.
