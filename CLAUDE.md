@AGENTS.md

# Project context

**Connect Mobile** is the member app (iOS, Android, web) of the multi-tenant
Connect platform for Jain communities. JSH (Jain Society of Houston) is tenant #1.
Platform conventions live in `connect-crm/docs/ARCHITECTURE.md` — read it first.

- **The schema is owned by connect-crm** (`connect-crm/supabase/migrations`). Never
  change it from here; list gaps instead (README › Schema gaps).
- **Types**: `src/lib/database.types.ts` is generated in connect-crm and copied here.
  Never hand-edit it; after a migration, regenerate there and copy the file over.
- **Client**: `src/lib/supabase.ts` (`db: { schema: 'app' }`). All data access goes
  through `src/lib/api/*`; business rules go through RPCs (`find_my_family`,
  `link_account`, `create_my_household`, `boli_summary`, `place_boli_entry`,
  `log_practice`, `send_anumodana`, `check_in`), never client re-implementations.
- **Specs** (source of truth for screens, copy and rules): `docs/PROTOTYPE_SPEC.md`,
  `docs/PROTOTYPE_ONBOARDING.md`, `docs/PROTOTYPE_WELCOME_GUIDE.md`,
  `docs/PROTOTYPE_GYAN_PATH.md` (read-only; extracted from the clickable prototype).
- **Errors are always shown in plain English with a retry** — never console-only,
  never a silent fallback. Use `must`/`maybe`/`check`/`report` from `src/lib/errors.ts`
  and render `Loaded` / `ErrorState` / `Banner`. Log the technical detail.
- **Money, RSVPs, bolis and pledges are adults only** (18+ or unknown DOB, mirroring
  `app.i_am_adult`). Children get `LockedState` ("Ask a parent"). RLS enforces it too.
- **Money is integer cents**; format only with `formatCents`.
- **Bolis: always say "pledge", never "bid"** (labels, buttons, toasts). A unit test
  enforces this on the English strings.
- **Online payment** goes through `src/features/pay/online.ts` (the portal's /api/payments/intent → the organization's Stripe/PayPal; recorded only by the provider's webhook). Without it the Pay sheet shows the honest notice and the offline "how to give" instructions — never fake success.
- **No mock data**: when env vars are missing the app shows the setup screen.
- **Strings** live in `src/i18n/en.ts` (complete); `gu.ts` / `hi.ts` carry every key
  and fall back to English. Use `useT()`.
- **Design tokens** in `src/theme.ts`; never hard-code colours. 44px minimum targets;
  all text goes through `Txt` so the text-size setting applies.
- Lint uses the React Compiler rules (no synchronous setState in effects, no impure
  calls in render). `useLoad` is the data-loading hook.

Verify before finishing: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec expo export --platform web`.

## Handover and memory (read at session start)
- Handover receipt (every handoff file, memory line and feature → where it is built): `connect-crm/docs/HANDOVER_RECEIPT.md` (GitHub: malavsanghvi/connect-crm)
- Project memory from the claude.ai prototyping sessions: `connect-crm/docs/handoff/project-memory.md`
- Decisions + open questions: `connect-crm/docs/DECISIONS.md` · design doc: `connect-crm/docs/design-doc/`
- Screen specs extracted from the prototype: `docs/PROTOTYPE_*.md` (source prototypes: `connect-crm/docs/handoff/prototypes/source/Main.dc.html`, `Onboarding`, `Welcome`, `GyanPath`)
- Founder rules: bolis say "pledge", never "bid"; money/RSVP/bolis/pledges are adults-only; show JSH member ID and JSH household ID exactly as issued (leading zeros kept); every failure shown in plain English with retry.

## Pull requests — standing authorisation (owner, 2026-09-24)

Claude opens a PR for each change, waits for **App checks** (typecheck, lint, test, build;
plus **Database tests** in connect-crm when `supabase/**` changes) to pass, merges it, then
confirms the resulting **Deploy** run is green and the app answers. Ask the owner first,
even with checks green, for anything that changes money rules, permissions/RLS, or deletes
data. Repository settings, secrets and passwords stay with the owner.
