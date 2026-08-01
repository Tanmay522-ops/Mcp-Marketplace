# Full Error Audit — mcp-marketplace

Generated 2026-08-01. Covers: build-level errors, broken references, logic
errors, security/data-access errors, and type-safety gaps. Nothing in this
document has been fixed yet — it's the full findings list for triage.

---

## 1. Build-level errors

### 1.1 `AddToolButton.tsx` imports a module that doesn't exist
- **File**: [src/app/dashboard/[workspaceId]/browse/_components/AddToolButton.tsx:8](src/app/dashboard/[workspaceId]/browse/_components/AddToolButton.tsx#L8)
- **Severity**: build-breaking
- Imports `installMarketplaceTool` from `@/actions/tool-connect-actions`, which does not exist anywhere in the repo (`src/actions/` only has `deploy.ts`, `install.ts`, `invite.tsx`, `oauth2-consent-actions.ts`, `user.ts`, `workspace.ts`). Fails both `tsc --noEmit` and `next build`:
  ```
  src/app/dashboard/[workspaceId]/browse/_components/AddToolButton.tsx:8:40
  Type error: Cannot find module '@/actions/tool-connect-actions' or its corresponding type declarations.
  ```
- The component is dead code — `grep` for `AddToolButton` only finds its own file, it's never imported/rendered anywhere.

### 1.2 Next.js typed-route validator fails on a route that was never built
- **File**: `.next/types/validator.ts:80` (generated, points at `src/app/dashboard/[workspaceId]/mcp/[toolId]/page.tsx`)
- **Severity**: build-breaking
- ```
  .next/types/validator.ts(80,39): error TS2307: Cannot find module '../../src/app/dashboard/[workspaceId]/mcp/[toolId]/page.js'
  ```
- Root cause is the missing `mcp/[toolId]` route — see [2.2](#22-missing-tool-detail-route-mcptoolid).

### 1.3 ESLint — 39 errors, 10 warnings
- **Severity**: mixed (see below); none block `tsc`, but several (`react-hooks/set-state-in-effect`) are real bugs, not style.
- Full verbatim list:

```
src/actions/deploy.ts
  299:116  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

src/app/(auth)/_components/SignInForm.tsx
   50:23  error  Unexpected any. Specify a different type
   53:44  error  Unexpected any. Specify a different type
   85:23  error  Unexpected any. Specify a different type
  146:25  error  Do not use an `<a>` element to navigate to `/forgot-password/`. Use `<Link />` from `next/link` instead.  @next/next/no-html-link-for-pages
  177:17  error  Do not use an `<a>` element to navigate to `/sign-up/`. Use `<Link />` from `next/link` instead.  @next/next/no-html-link-for-pages

src/app/(auth)/_components/SignUpForm.tsx
   64:18  error  Unexpected any. Specify a different type
   72:23  error  Unexpected any. Specify a different type
   74:44  error  Unexpected any. Specify a different type
  108:23  error  Unexpected any. Specify a different type
  110:44  error  Unexpected any. Specify a different type
  195:29  error  `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`  react/no-unescaped-entities
  284:29  error  Do not use an `<a>` element to navigate to `/terms/`. Use `<Link />` from `next/link` instead.  @next/next/no-html-link-for-pages

src/app/(auth)/callback/page.tsx
  3:8  warning  'React' is defined but never used  @typescript-eslint/no-unused-vars

src/app/(website)/layout.tsx
  20:19  warning  'destinationWorkspaceId' is assigned a value but never used  @typescript-eslint/no-unused-vars

src/app/(website)/page.tsx
   2:10  warning  'useAuth' is defined but never used
   3:10  warning  'useRouter' is defined but never used
   4:10  warning  'useEffect' is defined but never used
  19:25  error    Do not use an `<a>` element to navigate to `/search/`. Use `<Link />` from `next/link` instead.
  25:25  error    Do not use an `<a>` element to navigate to `/publish/`. Use `<Link />` from `next/link` instead.

src/app/dashboard/[workspaceId]/browse/_components/deploy-panel.tsx
   61:21  error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
           (useEffect(() => setMounted(true), []))
   65:9   error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
           (setPollTimedOut(false) inside the polling-timeout effect)
  413:43, 413:66, 476:50, 478:45, 479:66, 537:89, 537:107, 634:77, 634:85, 634:106, 635:39, 641:103
    error  unescaped `'`/`"`  react/no-unescaped-entities

src/app/dashboard/[workspaceId]/layout.tsx
  2:10  warning  'getWorkspaceMembers' is defined but never used  @typescript-eslint/no-unused-vars

src/app/invite/[inviteId]/_components/invite-response-buttons.tsx
  13:44  warning  'workspaceId' is defined but never used  @typescript-eslint/no-unused-vars

src/components/global/Members/MembersTable/index.tsx
  83:41  warning  Using `<img>` could result in slower LCP and higher bandwidth. Consider `<Image />` from next/image.  @next/next/no-img-element

src/components/global/create-workspace/index.tsx
  24:21  error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
          (useEffect(() => setMounted(true), []))

src/components/global/data/data.ts
  5:5  warning  'DownloadCloud' is defined but never used  @typescript-eslint/no-unused-vars

src/components/global/invite/invite-modal.tsx
  26:21  error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
          (useEffect(() => setMounted(true), []))

src/components/ui/GithubIcon.tsx
  3:11  error  An interface declaring no members is equivalent to its supertype  @typescript-eslint/no-empty-object-type

src/components/ui/carousel.tsx
  98:5  error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
         (onSelect(api) inside React.useEffect)

src/components/ui/navbarComponent.tsx
   60:21  error  Do not use an `<a>` element to navigate to `/`. Use `<Link />` from `next/link` instead. (x2)
  286:9   error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
          (onScroll() inside React.useEffect)

src/emails/invite-email.tsx
  28:24  error  `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`  react/no-unescaped-entities
  50:33  error  `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`  react/no-unescaped-entities

src/hooks/use-mobile.ts
  14:5  error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
         (setIsMobile(...) inside the matchMedia listener setup effect)

src/providers/ReactQueryProvider.tsx
  3:17  warning  'useState' is defined but never used  @typescript-eslint/no-unused-vars

✖ 49 problems (39 errors, 10 warnings)
```

### 1.4 Deprecated middleware convention
- **File**: [src/middleware.ts](src/middleware.ts)
- **Severity**: minor (warning, not an error)
- `next build` prints: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` This fork of Next.js (16.2.10, per AGENTS.md's "breaking changes vs. your training data" notice) wants this migrated to the new `proxy` convention.

---

## 2. Broken references

### 2.1 `AddToolButton.tsx` — dead component, nonexistent import
- Same finding as [1.1](#11-addtoolbuttontsx-imports-a-module-that-doesnt-exist). Listed here too since it's both a build error and an orphaned/unwired component.
- **Severity**: build-breaking

### 2.2 Missing tool-detail route (`mcp/[toolId]`)
- **Files**:
  - [src/app/dashboard/[workspaceId]/mcp/_components/mcp-server-table.tsx:95](src/app/dashboard/[workspaceId]/mcp/_components/mcp-server-table.tsx#L95) — `<Link href={...}>`
  - [src/app/dashboard/[workspaceId]/browse/_components/browse-content.tsx:50](src/app/dashboard/[workspaceId]/browse/_components/browse-content.tsx#L50) and [:54](src/app/dashboard/[workspaceId]/browse/_components/browse-content.tsx#L54) — `router.push(...)`, used by the Add/Connect/Pending status buttons
  - [src/app/dashboard/[workspaceId]/browse/_components/AddToolButton.tsx:33](src/app/dashboard/[workspaceId]/browse/_components/AddToolButton.tsx#L33) — dead code, same target
  - [src/app/api/oauth/callback/route.ts:90](src/app/api/oauth/callback/route.ts#L90) — redirect target after a successful OAuth connect
- **Severity**: high-impact logic bug / broken reference
- `src/app/dashboard/[workspaceId]/mcp/` only contains `page.tsx` (a list view) — there is no `mcp/[toolId]/page.tsx`. All four call sites above link/redirect to `/dashboard/${workspaceId}/mcp/${toolId}`, which 404s. `mcp/_components/InstallStatusBadge.tsx` is also orphaned (never imported by anything) — clearly built for this missing page. Every "click into a tool" flow in the app is a dead end, including the page you land on right after finishing a third-party OAuth connect.

### 2.3 Invite email uses an undefined env var
- **File**: [src/actions/invite.tsx:62](src/actions/invite.tsx#L62)
- **Severity**: high-impact logic bug
- `const acceptUrl = \`${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.id}\`` — `NEXT_PUBLIC_APP_URL` is never defined in `.env`; the file only defines `NEXT_PUBLIC_HOST_URL`. Every invite email renders a link like `undefined/invite/<id>`.

### 2.4 Env vars used in code but undocumented (safe fallback, still worth fixing)
- **File**: [src/actions/deploy.ts:473-474](src/actions/deploy.ts#L473)
- **Severity**: minor
- `RAILWAY_DEFAULT_VCPU_LIMIT`, `RAILWAY_DEFAULT_MEMORY_GB_LIMIT` are read via `process.env` with fallback defaults (`"0.5"`) but aren't present in `.env`/any example file, so their existence is undiscoverable without reading this file.

### 2.5 Env vars defined but never read
- **File**: `.env` (repo root)
- **Severity**: minor / informational
- `E2B_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`, `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET` are all defined but never referenced anywhere in `src`. Consistent with the private-repo/GitHub-App deploy path being stubbed out (`deploy-panel.tsx` just blocks it with "Private repo deploys need a connected GitHub App — use a public repo for now") and the `e2b` npm dependency being unused.

### 2.6 `middleware.ts` protects paths that don't exist
- **File**: [src/middleware.ts:5](src/middleware.ts#L5)
- **Severity**: minor
- `protectedPaths = ["/api/sandbox", "/api/install"]` — neither `src/app/api/sandbox/` nor `src/app/api/install/` exists in the repo. Dead config; harmless but misleading (and see [5.1](#51-apioauthauthorize--apioauthcallback-have-no-membership-check) for the routes that actually needed this kind of protection and don't have it).

---

## 3. Logic errors

### 3.1 `pollDeploymentStatus` skips the auth pattern every sibling action uses
- **File**: [src/actions/deploy.ts:580](src/actions/deploy.ts#L580)
- **Severity**: high (logic + security, see [5.2](#52-polldeploymentstatus-has-no-authorization-check))
- It's the only exported action in `deploy.ts` that doesn't call `getCallerContext` before touching the DB.

### 3.2 DCR OAuth callback URL is built from the wrong base
- **File**: [src/lib/dynamic-clinet-registration.ts:75](src/lib/dynamic-clinet-registration.ts#L75)
- **Severity**: high-impact logic bug
- Registers `redirect_uris: ["${NEXT_PUBLIC_GATEWAY_BASE_URL}/api/oauth/callback"]`. `/api/oauth/callback` is a route inside *this* app, reached via `NEXT_PUBLIC_HOST_URL`/the app's own origin. `NEXT_PUBLIC_GATEWAY_BASE_URL` is a separate proxy service that (per comments elsewhere in `deploy.ts`) only routes `/{workspaceSlug}/{toolSlug}/mcp` paths — it has no reason to forward `/api/oauth/callback` back to this app. Compare to the classic (non-DCR) path in [src/app/api/oauth/authorize/route.ts:36](src/app/api/oauth/authorize/route.ts#L36), which correctly uses `req.nextUrl.origin`. As written, any DCR-based tool (e.g. Notion) registers a callback URL the provider will redirect to, but that never reaches this app — the connect flow for those tools is broken end-to-end.

### 3.3 "Run in background" doesn't run in the background — state drifts out of sync
- **File**: [src/app/dashboard/[workspaceId]/browse/_components/deploy-panel.tsx](src/app/dashboard/[workspaceId]/browse/_components/deploy-panel.tsx)
- **Severity**: significant logic bug (state drift)
- Polling (`useQuery` + `refetchInterval`) is gated on `enabled: !!deploymentId && step === 'progress'` (line 77). `handleClose()` (line 122) only invalidates the `['workspace-installs', workspaceId]` cache if the deployment is *already* `RUNNING`/`ERROR` at the moment of closing; otherwise it calls `reset()` (line 100), which clears `deploymentId` and resets `step` to `'form'` — permanently killing the poll. There is no server-side cron/webhook to pick it back up.
- Worse: the `ToolVersion`/`InstallRecord` rows for the deployed tool are only created inside `pollDeploymentStatus` when it *observes* the transition to `RUNNING` ([src/actions/deploy.ts:719-776](src/actions/deploy.ts#L719)). If nobody is actively polling when Railway finishes, those rows never get created — the tool never appears in the workspace's install list even though Railway deployed it successfully. The "Run in background" button label ([deploy-panel.tsx:659](src/app/dashboard/[workspaceId]/browse/_components/deploy-panel.tsx#L659)) promises behavior the app doesn't actually implement.

### 3.4 Install failure is swallowed to console, never shown to the user
- **File**: [src/app/dashboard/[workspaceId]/browse/_components/browse-content.tsx](src/app/dashboard/[workspaceId]/browse/_components/browse-content.tsx) (`handleInstall`)
- **Severity**: minor
- Explicitly flagged by its own comment: `// TODO: surface res.message to the user (toast, inline error, etc.)`. On failure it only `console.error`s — the user sees no feedback that Add failed.

### 3.5 `deployCustomTool` returns success (201) even on a synchronous deploy failure
- **File**: [src/actions/deploy.ts:572](src/actions/deploy.ts#L572)
- **Severity**: minor, needs intent confirmation
- The `catch (railwayError)` branch marks the deployment `status: "ERROR"` in the DB but still `return { status: 201 as const, data: {...} }`. The panel gates success purely on `res.status === 201` ([deploy-panel.tsx:288](src/app/dashboard/[workspaceId]/browse/_components/deploy-panel.tsx#L288)), so this is probably intentional (record created, subsequent poll shows ERROR) — but it's inconsistent with every other action in the codebase, where a DB-side failure is reflected in the response status itself, not just the row. Worth confirming this is deliberate.

---

## 4. Status/enum field trace

### 4.1 `InstallStatus` — no dead path found
- **Values**: `NOT_CONNECTED | PENDING | ACTIVE | FAILED`
- All four are set somewhere ([src/actions/install.ts](src/actions/install.ts), [src/app/api/oauth/callback/route.ts](src/app/api/oauth/callback/route.ts)) and all four are rendered, in `connectionStatusDisplay` ([mcp-server-table.tsx:20](src/app/dashboard/[workspaceId]/mcp/_components/mcp-server-table.tsx#L20)) and in `browse-content.tsx`'s per-status button switch.

### 4.2 `DeploymentStatus` — exhaustive by construction
- **Values**: `PENDING | BUILDING | DEPLOYING | RUNNING | ERROR`
- `deploymentStatusDisplay` ([src/lib/deployment-status.ts:3](src/lib/deployment-status.ts#L3)) is typed `Record<DeploymentStatus, ...>`, so TypeScript itself guarantees every enum value has a display entry — no gap possible without a compile error.
- The Railway-status → internal-status mapping in `pollDeploymentStatus` ([src/actions/deploy.ts:623-644](src/actions/deploy.ts#L623)) explicitly falls back to the last known status and surfaces `unrecognizedRailwayStatus` to the UI when Railway returns something unmapped — a deliberate, reasonable degradation, not a gap.

### 4.3 The one real gap is the state-drift bug, not a rendering gap
- See [3.3](#33-run-in-background-doesnt-run-in-the-background--state-drifts-out-of-sync) — the only place an enum transition can leave the UI unable to represent reality is when polling stops before `RUNNING` is observed: the tool exists on Railway, but no DB row (and therefore no UI state) reflects it at all.

---

## 5. Security / data-access errors

### 5.1 `/api/oauth/authorize` + `/api/oauth/callback` have no membership check
- **Files**: [src/app/api/oauth/authorize/route.ts](src/app/api/oauth/authorize/route.ts), [src/app/api/oauth/callback/route.ts](src/app/api/oauth/callback/route.ts), [src/middleware.ts:5](src/middleware.ts#L5)
- **Severity**: high — broken access control / IDOR, real exploit path
- `middleware.ts` only forces auth on `/api/sandbox` and `/api/install`, neither of which exists (see [2.6](#26-middlewarets-protects-paths-that-dont-exist)). Every other API route, including these two, is reachable without being logged in at all at the middleware layer.
- `oauth/authorize/route.ts:20` takes `workspaceId`/`toolId` straight from query params and only checks the tool belongs to that workspace (`client.tool.findFirst({ where: { id: toolId, workspaceId } })`) — it never checks the caller is a *member* of `workspaceId`. Contrast with the structurally identical `/api/oauth2/authorize/route.ts:73`, which correctly calls `getCallerContext(tool.workspaceId)`.
- `oauth/callback/route.ts:222` does call `auth()` to identify who's currently logged in, but never checks that user belongs to the `workspaceId` embedded in the signed state — it just upserts the install record for that `workspaceId` with whatever OAuth tokens came back from the token exchange.
- **Impact**: any authenticated user of this app (regardless of which workspace they belong to) can hit `/api/oauth/authorize?workspaceId=<victim>&toolId=<toolId>`, complete the third-party consent screen with their *own* third-party account, and have their own OAuth access/refresh tokens written into the *victim* workspace's `InstallRecord` — hijacking that workspace's tool connection to run under the attacker's third-party identity.

### 5.2 `pollDeploymentStatus` has no authorization check
- **File**: [src/actions/deploy.ts:580](src/actions/deploy.ts#L580)
- **Severity**: high
- Takes a bare `deploymentId`, calls `client.deployment.findUnique` directly — no `getCallerContext`, no workspace-membership check, unlike every other exported action in the same file. Any authenticated user who knows or guesses a `deploymentId` can read another workspace's deployment status/error message, and indirectly trigger writes (`client.deployment.update`) and Railway project deletion (`RAILWAY_PROJECT_DELETE`) through this endpoint.

### 5.3 Non-constant-time HMAC signature comparison
- **Files**: [src/lib/oauth-state.ts:33](src/lib/oauth-state.ts#L33), [src/lib/oauth2-request-lib.ts:40](src/lib/oauth2-request-lib.ts#L40)
- **Severity**: minor-medium
- Both compare signatures with plain `sig !== expected` instead of `crypto.timingSafeEqual`, a timing side-channel against the signed OAuth-state/request-token. Low real-world exploitability given the short TTLs (10 min), but it's exactly the case `timingSafeEqual` exists for.

### 5.4 `searchMarketplaceTools` doesn't verify workspace membership
- **File**: [src/actions/install.ts:78](src/actions/install.ts#L78)
- **Severity**: low / informational
- Takes a caller-supplied `workspaceId` and uses it to filter each tool's `installs` sub-select, without verifying the caller belongs to that workspace. Impact is limited (only reveals install *existence/status* for a public marketplace tool against an arbitrary workspace id — no secrets), but it's inconsistent with every other workspace-scoped query in the codebase, which all verify membership first via `getCallerContext`.

### 5.5 OAuth tokens stored in plaintext, inconsistent with client-secret handling
- **File**: `InstallRecord.oauthAccessToken` / `oauthRefreshToken` (Prisma schema), written in [src/app/api/oauth/callback/route.ts](src/app/api/oauth/callback/route.ts) and [src/lib/tool-crypto.ts](src/lib/tool-crypto.ts)
- **Severity**: informational — worth a deliberate decision, not necessarily a bug
- `tool-crypto.ts` correctly AES-256-GCM-encrypts OAuth *client* secrets before storage and never logs decrypted values. The third-party access/refresh tokens issued *to* a workspace (i.e. what a connected user's account can do on the tool's behalf) are stored in plaintext in the same database. No plaintext secrets were found leaking into logs or client-side bundles anywhere in the audit.

---

## 6. Type-safety gaps

All in application code. `src/generated/prisma/**` is excluded — it's gitignored, unused, stale output from an old `output` config in the generator block (the app actually imports `PrismaClient` from `@prisma/client` via [src/lib/prisma.ts](src/lib/prisma.ts), not from `src/generated`), so its internal `any`s and `as unknown as X` casts are Prisma-generated boilerplate, not something this codebase controls.

### 6.1 `as any` masking a Prisma enum mismatch
- **File**: [src/actions/deploy.ts:299](src/actions/deploy.ts#L299)
- **Severity**: minor, but hides a real future-failure mode
- `const toPrismaSourceType = (source: DeploySource): "GITHUB" | "NPM" | "PYPI" | "DOCKER" => source.toUpperCase() as any`
- Bypasses verifying that `"github"|"npm"|"pypi"|"docker"` uppercased actually matches the Prisma `ToolSourceType` enum. A future new `DeploySource` variant, or a rename on the Prisma side, would compile cleanly and only fail at the DB write (or silently store a bad value) instead of failing at compile time.

### 6.2 `err: any` in Clerk auth error handling
- **File**: [src/app/(auth)/_components/SignInForm.tsx:50, 53, 85](src/app/(auth)/_components/SignInForm.tsx#L50)
- **Severity**: minor
- `catch (err: any)` and `error: any` inside `err.errors.forEach(...)`. Clerk's SDK exports proper error types (`isClerkAPIResponseError`/`ClerkAPIError`); using `any` hides that `err.errors` may not exist on a non-Clerk error (e.g. a network failure), so `err.errors.forEach` can itself throw from inside a catch block.

### 6.3 Same pattern, sign-up flow
- **File**: [src/app/(auth)/_components/SignUpForm.tsx:64, 72, 74, 108, 110](src/app/(auth)/_components/SignUpForm.tsx#L64)
- **Severity**: minor
- `} as any)` on the sign-up-attempt call, plus `catch (err: any)` / `error: any` repeated for both the initial attempt and the verification-code catch blocks. Same risk as [6.2](#62-err-any-in-clerk-auth-error-handling).

### 6.4 No `@ts-ignore` / `@ts-expect-error` / `as unknown as X` in application code
- Confirmed via repo-wide search — the only hits are inside the generated (unused) Prisma client noted above.

---

## Summary

| Category | Count | Notes |
|---|---|---|
| Build-breaking errors | 2 (tsc/build) + 1 warning | Both trace back to the same dead `AddToolButton.tsx` / missing route |
| ESLint problems | 39 errors, 10 warnings | Full list in §1.3 |
| Broken references | 6 | Missing route affects 4 call sites; 1 undefined env var breaks invites in practice |
| Logic errors | 5 | Two are high-impact (DCR callback URL, deploy state drift) |
| Status/enum coverage | clean | No unrendered enum states found |
| Security findings | 5 | 2 high-severity broken-access-control issues (§5.1, §5.2) |
| Type-safety gaps | 8 `any` usages | All isolated to auth forms + one Prisma enum cast |

**Suggested triage order**: §5.1 and §5.2 (live exploitable access-control gaps) → §2.2 (missing route, also what's breaking the build) → §2.3 and §3.2 (both silently break user-facing flows: invites, DCR OAuth) → §3.3 (deploy state drift) → the rest.
