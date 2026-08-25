<div align="center">

# 📄 Leitor de Protocolos

**Reads the `Protocolo Nº` field off paper slips with a phone camera, then files
the whole stack — one request at a time, with a report of exactly what landed.**

Built for working through a physical pile: *point, confirm, next.*

![React 19](https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06b6d4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-239%20passing-3fb950)

</div>

---

> **Four guarantees the code is built around**
>
> | | |
> | --- | --- |
> | 🔒 **AS is never alone** | The AS submission only ever follows a successful ordinary protocol — [details](#the-as-rule) |
> | 🆔 **Nothing goes out without its id** | A run waits for the confirm-time lookups instead of failing the slips still resolving — [details](#nothing-is-submitted-without-its-id) |
> | 🔁 **Nothing is filed twice** | A filed protocol is remembered in a sticky flag, so no rerun, reload or abort can resend it — [details](#nothing-is-ever-filed-twice) |
> | 🧪 **Mocking is all-or-nothing** | With mocks on, nothing can reach a real service — [details](#mocking-cannot-be-half-on) |

---

## Table of contents

- [How it works](#how-it-works)
- [Using the app](#using-the-app)
- [Running it on your phone](#running-it-on-your-phone)
- [Installing it as an app (PWA)](#installing-it-as-an-app-pwa)
- [Configuration](#configuration)
- [Wiring up the real API](#wiring-up-the-real-api)
- [Testing](#testing) — start here if you are new to the project
- [Test coverage](#test-coverage)
- [How accurate is the OCR?](#how-accurate-is-the-ocr)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)

---

## How it works

```text
Dashboard ──▶ Escanear ──▶ drag the aim box onto "Protocolo Nº"
                               │  (once per form — the position sticks)
                               ▼
                        camera reads that box continuously
                               │
                        several frames agree
                               ▼
                        CONFIRM SHEET  (photo + digits side by side)
                               │  ✓ Confirmar   [x] Protocolar também AS
                               ▼
            GET {API_URL}/protocolo?protocoloId=<num>  →  { id }
                    (in the background — scanning never waits)
                               ▼
                    saved to history { id, num }
                               │
                        …next slip…  (the camera stays up)
                               ▼
                 "Protocolar n" — from the scanner or the dashboard;
                  either way the camera closes before anything is sent
                               │
                     any lookup still on the wire is waited for
                       (a slip scanned a second ago has no id yet)
                               │
                               ▼
     one at a time:  PUT {API_URL}/protocolo/protocolaragendamento/<id>
                     PUT {API_URL}/protocolo/protocolaragendamentoas/<id>
                                                           ← only if AS was
                                                              ticked AND the
                                                              call above worked
                               ▼
              Relatório — Sucesso / Falha, each row: número · ID · motivo
```

### The AS rule

A slip can be submitted as the ordinary protocol alone, or as the ordinary
protocol **followed by** AS. AS on its own is never valid, and there is no way
to ask for it:

- The UI offers a single "Protocolar também AS" checkbox, not a choice between
  two options — so "AS only" is not expressible.
- The AS request is only sent after the ordinary one returns success.
- If the ordinary protocol fails, AS is reported as **not sent**, with the
  reason, and no request goes out.
- A record with no ID sends neither, and both are reported as failures rather
  than silently skipped — so the report never implies something was submitted
  when it was not.

This is enforced in one place, [`runRecord` in src/lib/queue.ts](src/lib/queue.ts),
and is covered by tests that assert the AS endpoint is never contacted when the
ordinary one fails.

### Nothing is submitted without its id

The confirm-time lookup runs in the background so scanning never waits on a
round trip. That leaves a window where a slip is in the history but its id has
not arrived — and "Protocolar" straight from the scanner lands in the middle of
it, because that is how a stack is meant to be finished.

A record with no id is reported as **Sem ID** rather than submitted, which is
right, but here it was reporting a failure for records that were perfectly
fine. So a run now waits for outstanding lookups before sending anything:

- Lookups in flight are awaited — at most one request timeout, and only when
  something is actually outstanding.
- A record left `pending` with nothing in flight is asked for again. That is
  the state a tab closed mid-lookup comes back in.
- A lookup that genuinely fails still reports **Sem ID**, and no submission
  goes out for it. The wait resolves ids; it does not paper over a failure.

`Parar` works during the wait, and the run stops before the first request.

Covered by [src/App.test.tsx](src/App.test.tsx), which holds a lookup open and
asserts the submission does not overtake it.

### Nothing is ever filed twice

A filed protocol cannot be withdrawn, so "already submitted" is tracked in a
field of its own — `protocoled` on the record, and `asProtocoled` for AS — and
that field, not the display state, decides whether a request goes out.

The distinction matters because it was a real bug. `protocol.status` is display
state: a record whose protocol had succeeded but whose AS was still pending went
back into the queue, was marked `running` for the AS leg, and — because the
protocol leg is correctly skipped — never settled again. The stored `success`
was gone. Judged on the status alone, the next run filed that protocol **a
second time**. Stopping a run mid-way left the same wreckage.

So the rule is now:

- `protocoled` is **sticky**. It goes from false to true when a submission
  succeeds and is never cleared by a later run, an abort, or a reload.
- The only thing that clears it is **correcting the number**, which discards the
  ID and makes it a genuinely different submission.
- Both [`pendingRecords` and `runRecord`](src/lib/queue.ts) consult it before
  `protocol.status`, so an unsettled or overwritten step cannot cause a resend.
- [Loading a history](src/lib/storage.ts) recovers the flag from the step status
  for records written before it existed — without that migration, upgrading
  would have re-filed every protocol in an existing history exactly once.

Covered by the **never files the same protocol twice** tests in `queue.test.ts`,
which drive the exact wreckage state, and by the migration tests in
`storage.test.ts`.

---

## Using the app

### Dashboard

The home screen. Counters across the top (total, a enviar, protocolados,
falhas), the scan history in the middle, and a **bottom dock** holding the two
actions you actually press: **Escanear** and **Protocolar *n***.

### Scanning

Tap **Escanear protocolos**, allow camera access, and frame the **whole slip**
inside the guide.

> **Do not move the phone in close.** The app finds the number itself. Holding
> the phone near enough to fill a small box puts the paper inside the camera's
> minimum focus distance and every frame comes back blurred — that is why the
> guide covers most of the screen.

The status pill tells you what is happening: *Procurando o protocolo…*, then
*Confirmando… 2 de 3*. A second line says how it found the number — "achou o
campo Protocolo" is the strongest signal.

### The aim box

Inside the guide there is a smaller box marked **Protocolo Nº**. It is the only
part of the slip that gets read.

**Drag it onto the field once.** The position is remembered, so the next slip of
the same form needs nothing. Arrow keys nudge it too, and it cannot be dragged
outside the guide.

It exists because a slip carries **several "Protocolo" labels** — de origem, de
entrada, whatever the form calls them — and the text alone cannot say which one
is meant. Every one of them is a "Protocolo" followed by a long number, so
reading the whole page and taking the first match is a coin flip. Pointing at
the right one settles it.

Two things follow from the box being small, both good:

- It reads in a fraction of the time a full page took, so the frames needed to
  agree arrive much faster.
- The confirm sheet's photo is the band itself — the digits are large and easy
  to check against what the app read.

**The box is deliberately tight** — 65% less of the frame than it started out,
after two rounds of tuning against real slips. Browsers give no dependable focus
control, and none whatsoever on iOS, so the page ends up held further back than
the guide strictly requires — and further back reads *better*, because the frame
comes out sharper and sharpness is what the OCR is short of. At that distance
the field takes up less of the frame, so a wide box stops being "the Protocolo
line" and becomes "the Protocolo line plus whatever is printed around it" —
noise that costs read time and hands the extractor more long numbers to mistake
for the right one.

This does not cost resolution the way it looks like it should. The crop is
normalised to a fixed width before recognition, so a smaller box is **upscaled
more**, not read from fewer effective pixels — which is why holding the page
further back and reading less of it wins on both counts.

Note what did *not* change: the **guide** is the same size. The guide is what
decides how far away the phone is held, and shrinking *that* is what caused the
old focus-blur failure. Narrowing only the crop keeps the distance and drops the
noise. See [How accurate is the OCR?](#how-accurate-is-the-ocr).

> Because nothing in the UI resizes the box, its **size always comes from the
> current default and only its position is remembered**. A box you lined up
> earlier is re-centred at the new size, so tuning the default reaches everyone
> without anyone having to re-aim or clear their storage.

This is **not** the thin-strip framing that was tried and abandoned; that one
failed because filling it forced the phone inside its minimum focus distance.
Here the phone stays back with the whole slip in the guide, and the crop is
taken from that same in-focus frame.

### Focus

**Tap the paper on screen to focus on it.** A ring marks the spot and the camera
runs one focus sweep there, then holds it — the same gesture as a native camera
app. Tap again to redo it. A flat white page gives continuous autofocus very
little to lock onto, so this is usually what turns a soft frame into a readable
one. The app also asks for continuous autofocus when the camera opens, since
some Android cameras come up in a fixed-focus mode at high resolutions.

What tapping cannot fix is being **inside the camera's minimum focus distance**
— hold the phone back until the whole slip fits the guide.

> **Not available on iOS.** Focus control comes from the Image Capture spec,
> which Chrome on Android implements and WebKit does not implement at all. There
> is no way to trigger or aim focus from a page in Safari, so the app detects
> the missing capability, drops the hint and the tap target, and leaves iOS to
> its own continuous autofocus.

When enough frames agree, the phone vibrates and the confirm sheet appears with
the **photo above the digits**. Check they match and confirm.

**"Protocolar também AS" starts ticked**, because most slips are protocolled
alongside AS — untick it for the ones that are not. Either way the choice sticks
for the next slip, so a run of pages that all go the same way needs no tapping
at all.

**Confirming keeps the camera up for the next slip** — the whole point is
working through a pile without closing and re-warming the camera each page. A
badge counts what you have confirmed this session.

When the stack is done, the scanner's own **Protocolar *n*** button finishes the
job: it **closes the camera first**, then starts the run, so you land on the
dashboard and watch the progress bar. A run must never happen with the camera
up — the submissions would go out behind an opaque overlay, with no progress and
no **Parar**. **Concluir** just closes the camera without sending anything.

The dashboard behind the scanner is `inert` while the camera is open, so its
controls cannot be reached by a stray tap, by the keyboard, or by assistive
tech.

Tap the number itself to correct it before saving.

### History

Every scan is stored on the device. For each row you can:

| Action | How |
| --- | --- |
| **Leave one out of the run** | the big checkbox on the left of the row |
| **Leave out / include everything** | the checkbox above the list |
| **Toggle AS** | *Protocolar também AS* on the row |
| **Correct the number** | pencil icon, or tap the number on the confirm sheet |
| **Retry a failed ID lookup** | the refresh icon (only shown when it failed) |
| **Delete one** | the trash icon on the row |
| **Search** | the search field, matches on digits |
| **Clear everything** | the trash button next to the search field, with a confirmation |

**Unticking a row leaves it in the history but sends nothing for it** — no
protocol, no AS. That is different from unticking *Protocolar também AS*, which
only drops the AS half. The button at the bottom counts what is actually going
out, so it reads *Protocolar 7* rather than *Protocolar todos*. Already-filed
rows cannot be unticked, because there is nothing left to leave out.

Each row states where it stands, in plain terms:

| Badge | Meaning |
| --- | --- |
| **Protocolado** | filed successfully — it will never be sent again |
| **Protocolando…** | in flight right now |
| **Falha ao protocolar** | the submission failed; the reason is printed underneath |
| **AS protocolada** | the AS submission landed |
| **AS não enviada** | AS was wanted but the ordinary protocol failed first |
| **sem ID** | the lookup never resolved, so nothing can be submitted |
| **fora do envio** | you unticked it |

**Protocolado** follows the sticky `protocoled` flag rather than the transient
step state, so a row that was filed keeps saying so even while the run is busy
with its AS.

Correcting a number **discards its ID and looks it up again**, because the ID
belongs to the old number. Any previous submission result is cleared too, so a
corrected row never carries a result that belonged to different digits.

### Submitting

**Protocolar *n*** walks the ticked records one request at a time — the count is
what will actually be sent. Already-filed and unticked records are skipped, so
pressing it again only retries what is outstanding, including after a reload or
after you stopped a run halfway. See [Nothing is ever filed
twice](#nothing-is-ever-filed-twice). The progress bar shows position and the
number in flight; **Parar** aborts.

The scan and submit buttons sit in a **dock at the bottom of the screen**, and
the row checkboxes are sized for a thumb: the app is used standing up, one
handed, with a stack of paper in the other hand, and the top of a phone screen
is the hardest place to reach.

The **Relatório** screen groups outcomes into Falha and Sucesso, each row
carrying número, ID and motivo, and offers **Copiar** / **CSV** plus **Tentar
novamente os que falharam**.

---

## Running it on your phone

```bash
pnpm install     # or: npm install
pnpm dev         # or: npm run dev
```

Either package manager works — see [Scripts](#scripts). The rest of this README
writes `pnpm`; substitute `npm run` if that is what you use.

Open **`https://<your-lan-ip>:5173`** on the phone and accept the certificate
warning. Vite prints the address on the `Network:` line at startup.

The `https` is not optional. `getUserMedia` only works in a secure context, so
a plain `http://192.168.x.x` origin has the camera blocked outright — the app
detects this and says so rather than failing silently.
[`@vitejs/plugin-basic-ssl`](vite.config.ts) supplies the self-signed
certificate; the one-time warning is expected.

On first run the app downloads the Tesseract WASM core and English model
(~3 MB) from jsDelivr and caches the model in IndexedDB, so only the first scan
needs a connection.

---

## Installing it as an app (PWA)

The app installs to the home screen and runs offline. On a phone that means no
browser chrome, a real icon in the launcher, and a scanner that keeps working
when the building's wifi does not.

| Piece | Where |
| --- | --- |
| Manifest — name, icons, colours, `display: standalone` | [public/manifest.webmanifest](public/manifest.webmanifest) |
| Service worker — the offline cache | [public/sw.js](public/sw.js) |
| Registration | [src/main.tsx](src/main.tsx) |
| iOS-only tags the manifest does not cover | [index.html](index.html) |

**To install:** open the built app and choose *Install app* / *Add to Home
Screen* — Chrome offers it in the ⋮ menu, iOS Safari under Share.

### What is cached, and what is deliberately not

The worker caches by **allowlist**, not blocklist. This app submits protocols to
a live service, and a cached or replayed submission would be a real error nobody
could see. So only three things are ever stored:

- the app shell (`/`, manifest, icons),
- Vite's build output under `/assets/`, whose filenames carry a content hash so
  a cache hit can never be stale,
- the Tesseract WASM core and model from the CDN — the ~3 MB that decides
  whether the scanner works offline at all.

**Every API request goes straight to the network, always.** The two submissions
are excluded because they are `PUT` and the worker only ever considers `GET`;
the ID lookup is a `GET`, and is excluded because it matches no static-asset
pattern. Two independent reasons, on purpose. This is pinned by
[src/test/sw.test.ts](src/test/sw.test.ts) — if you widen the cache rules, those
tests are what should stop you.

### Installing on a phone

If the phone only offers **"Add to Home screen"** and never **"Install app"**,
or iOS refuses to open the page at all, it is the certificate. Two separate
things have to be true, and the default dev setup satisfies neither:

1. **The origin must have no certificate error.** `@vitejs/plugin-basic-ssl`
   issues a certificate for `localhost` and `127.0.0.1` only. Your phone
   connects to the LAN address — say `https://192.168.1.57:5173` — which is not
   in that certificate, so every browser flags the origin. Browsers refuse to
   register a service worker on a flagged origin *even after you tap through the
   warning*, and with no worker Chrome offers a bookmark instead of an install.
   iOS enforces this harder still and may not offer to proceed at all.
2. **It must be a production build.** Registration is behind
   `import.meta.env.PROD` ([src/main.tsx](src/main.tsx)), so `pnpm dev` never
   registers a worker no matter how good the certificate is.

#### How the local certificate works

`pnpm cert` issues **two** things, and the split is the whole trick:

```text
  certs/dev-ca.crt          a tiny certificate authority.
        │                   Installed on the phone once. Long-lived,
        │  signs            never changes, so the phone keeps trusting it.
        ▼
  certs/dev-server.crt      the server certificate, listing localhost,
                            the loopback addresses, and this machine's
                            LAN address. Reissued whenever you like.
```

The phone is told to trust the **CA**; the CA vouches for the **server
certificate**; the server certificate actually names the address the phone is
connecting to. All three have to line up, and with `basicSsl()` the third one
never did — its certificate says `localhost` while the phone is dialling
`192.168.x.x`.

Once they line up the origin is clean: no warning, and — the part that matters —
the browser will finally register a **service worker**, which is what turns the
page from a bookmark into an installable app.

Two consequences worth remembering:

- **Re-running `pnpm cert` is cheap.** The CA is reused, so phones that already
  trust it need no attention; only the server certificate is reissued. Do it
  whenever your DHCP lease hands you a new address.
- **`certs/` is git-ignored, and must stay that way.** Anyone holding
  `dev-ca.key` can mint certificates that every phone you set up will trust
  silently.

#### Setting it up

Fix the first with `pnpm cert`, which issues a certificate that actually covers
this machine's LAN address, signed by a local CA you install on the phone once:

```bash
pnpm cert                # writes certs/ — CA + server certificate
pnpm build && pnpm preview
```

Then, **on the phone**, open `https://<lan-ip>:4173/dev-ca.crt` and install it:

- **Android** — Settings → Security → Encryption & credentials → Install a
  certificate → **CA certificate**. (Some builds put it under Settings →
  Security → More settings.)
- **iOS** — open the link in Safari, allow the profile download, then Settings →
  General → **VPN & Device Management** → install it. Then the step everyone
  misses: Settings → General → About → **Certificate Trust Settings** → switch
  it on. iOS ignores a user-installed root until you do.

Reload the app and it should offer **Install app**.

Two details that exist to satisfy Apple: the server certificate is issued for
**397 days** (iOS rejects anything over 398) and carries
`extendedKeyUsage=serverAuth`, which iOS 13+ requires of every TLS server
certificate.

While no certificate has been generated, the dev server falls back to
`basicSsl()` exactly as before, which remains fine for desktop work.

### Testing the PWA on a desktop

To exercise the worker without any certificate at all:

```bash
pnpm build
pnpm preview:pwa      # http://localhost:4173
```

That serves the real build over **plain HTTP on localhost**, which browsers
treat as a secure context — so the service worker registers *and* the camera
still works. (`preview:pwa` is just `HTTPS=false vite preview --host localhost`;
the ordinary `pnpm preview` keeps HTTPS for LAN testing.)

Then, in Chrome DevTools:

1. **Application → Manifest** — icons render, no errors, *Installability* is
   satisfied.
2. **Application → Service workers** — one worker, *activated and is running*.
3. **Application → Cache storage** — `shell-v1` and `assets-v1` hold the shell
   and the hashed build files.
4. **Network → tick Offline, then reload** — the app still opens.
5. Now the important one: **still offline, press Protocolar todos.** The
   requests must *fail*, not succeed from cache. A submission that appears to
   work offline means the allowlist has been broken.
6. Scan something while offline to confirm the Tesseract files came from
   `vendor-v1` rather than the network.

For a real install on a phone, see [Installing on a
phone](#installing-on-a-phone) above. A public tunnel (`ngrok`, Cloudflare
Tunnel) also gives a trusted certificate with no device setup — but note the
build **inlines `VITE_AUTH_TOKEN` into the bundle**, so a public URL hands that
token to anyone who finds it. The local CA keeps everything on the LAN.

### Shipping an update

The worker takes over on the next full load, not immediately, so a running
session is never swapped underneath itself mid-scan. In practice: close the app
and reopen it.

Caches are keyed by `VERSION` at the top of [public/sw.js](public/sw.js).
Content-hashed asset names mean routine deploys need no change — **bump
`VERSION` when you change the caching rules themselves**, and every older cache
is dropped on the next activation.

---

## Configuration

Copy [`.env.example`](.env.example) to `.env.local` and edit. Vite only exposes
`VITE_`-prefixed variables and **inlines them at build time**, so rebuild after
changing any of them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_USE_MOCK` | `true` | Serve the mock API from the dev server |
| `VITE_API_URL` | *(empty)* | Base URL of the service — scheme and host only |
| `VITE_AUTH_TOKEN` | *(empty)* | Sent as `Authorization: Bearer <token>` |
| `VITE_REQUEST_TIMEOUT_MS` | `5000` | Per-request timeout |

### One URL, and where the paths live

`VITE_API_URL` is a **base**: scheme and host, no trailing slash, no path. Every
call goes to the same service, so there is one variable rather than three.

The paths and methods are not configuration — they are the shape of the
service's contract, so they live in code, in
[src/lib/endpoints.ts](src/lib/endpoints.ts):

```
GET {VITE_API_URL}/protocolo?protocoloId=<15 digits>   ->  { "id": "..." }
PUT {VITE_API_URL}/protocolo/protocolaragendamento/<id>
PUT {VITE_API_URL}/protocolo/protocolaragendamentoas/<id>
```

That table is imported by all three consumers — the client
([src/lib/api.ts](src/lib/api.ts)), the dev-server mock
([plugins/mock-api.ts](plugins/mock-api.ts)) and the test mock
([src/mocks/handlers.ts](src/mocks/handlers.ts)) — so they cannot disagree about
where a call goes, and changing a route is one edit reviewed in one diff.

Leave `VITE_API_URL` **empty** to call the app's own origin, which is what you
want when routing through the Vite dev proxy. An absolute `https://` URL works
too if the service sends CORS headers.

### Auth

Set `VITE_AUTH_TOKEN` and **every** request — the ID lookup and both
submissions — carries `Authorization: Bearer <token>`. Leave it empty and no
`Authorization` header is sent at all, rather than a `Bearer` with nothing after
it, which services tend to answer with a 400 instead of the 401 that would tell
you the token is missing.

> The token is **not secret once built.** Vite inlines it into the JS bundle, so
> anyone with the app can read it. That is fine for a token issued to this app
> on a controlled device. If it must not leave the server, leave the variable
> empty and have the proxy in [vite.config.ts](vite.config.ts) — or whatever
> fronts the app in production — attach the header instead.

While mocking, a configured token is **enforced**: the mock answers 401 to a
request that does not carry it, so a broken wiring fails in dev rather than
against the real service.

### Methods

Each call's HTTP method is a named constant at the top of
[src/lib/api.ts](src/lib/api.ts):

| Constant | Method | Call |
| --- | --- | --- |
| `LOOKUP_METHOD` | `GET` | `?protocoloId=<num>` → `{ id }` |
| `PROTOCOL_METHOD` | `PUT` | ordinary protocol submission |
| `PROTOCOL_AS_METHOD` | `PUT` | AS submission |

To change one, edit the constant and, if the service wants a payload, add a
`body` at that call site. The shared `request` helper serialises it, sets the
Content-Type, attaches the token and applies the timeout, and every mock
handler answers any method — so nothing else needs touching.

> The three verbs are asserted in `api.test.ts` (**HTTP methods**). Every other
> handler in the suite is deliberately method-agnostic (`http.all`), so that one
> test is the only thing standing between a careless edit here and a silent
> failure against the real service. If you change a verb on purpose, update that
> test in the same commit.

**Mocking defaults to on.** A fresh clone with no `.env` runs against mocks
rather than firing real submissions at a live government service because
someone forgot to create one.

### Mocking cannot be half-on

There used to be a way to have `VITE_USE_MOCK=true` and still file real
protocols, and it was completely silent. It is worth understanding, because the
configuration that causes it is the obvious one.

The mock is served by the **dev server**, so it can only intercept requests that
reach the dev server. Leave the base URL pointing at the real service —

```dotenv
VITE_USE_MOCK=true
VITE_API_URL=https://real-service.example
```

— and the browser sends that request straight past the dev server to the real
host. Mocking looks on. Every submission is real, and a filed protocol has no
undo.

Two independent defences now prevent it:

1. **The base URL is derived from `USE_MOCK`, not merely defaulted**
   ([src/lib/config.ts](src/lib/config.ts)): while mocking it is `''`, so every
   call resolves against this origin where the dev server answers it. No value
   of `VITE_API_URL` can override that, which makes the dangerous state
   unreachable by configuration rather than just discouraged. You can flip
   `VITE_USE_MOCK` on and off without touching the URL.
2. **Anything that would still leave this origin is refused**
   ([src/lib/api.ts](src/lib/api.ts)) — before `fetch`, so nothing goes out. It
   surfaces as an ordinary failure reading *"Bloqueado: VITE_USE_MOCK está
   ligado…"*. This catches what the rewrite cannot, such as a protocol-relative
   `//host/path`.

Both are covered by the **mock safety** tests in `api.test.ts`, including the
assertion that `fetch` is never called, and the counterpart test that turning
mocking *off* still reaches the real service.

> If you see *Bloqueado* in the report, mocking is on and an endpoint points
> somewhere other than this origin. Either use a relative URL or set
> `VITE_USE_MOCK=false` — deliberately.

### The mock backend

The mock is served by the **dev server itself**
([`plugins/mock-api.ts`](plugins/mock-api.ts)), as ordinary HTTP routes. It
also runs under `pnpm preview`, so a preview of the production build behaves
the same.

`src/lib/api.ts` therefore issues its real `fetch` calls unchanged — the code
exercised against mocks is the code that ships.

> **Why not MSW's browser worker?** It cannot work on the phone. The dev
> server's self-signed certificate covers only `localhost` and `127.0.0.1`, so
> a phone on the LAN IP always hits a certificate error. You can click through
> the interstitial and the page loads — but browsers **refuse to register a
> service worker on an origin with a certificate error**, bypassed or not,
> because a service worker is persistent code. Serving the routes from the dev
> server sidesteps this entirely and needs nothing installed on the phone.
>
> MSW is still the mocking layer for the **test suite**. Both it and the
> middleware drive the same behaviour in
> [`src/mocks/scenario.ts`](src/mocks/scenario.ts), so they cannot drift apart.

Failures are deterministic, keyed on the **last two digits** of the number, so
you can reproduce any path on demand:

| Number ends in | Behaviour |
| --- | --- |
| `97` | ID lookup fails (503) — the record is kept without an ID |
| `98` | ordinary protocol fails — AS must then be skipped |
| `99` | ordinary protocol succeeds, AS fails (422) |
| anything else | everything succeeds |

### The seeded history

With mocking on, a first visit starts with a **sample history already in the
list**, so you can press **Protocolar todos** immediately — no camera, no paper,
no scanning. The rows are chosen to hit each rule above exactly once rather than
five identical successes:

| Row ends in | What it demonstrates |
| --- | --- |
| `19` | the ordinary path — protocol and AS both succeed |
| `99` | protocol succeeds, AS fails — one row of each in the report |
| `98` | protocol fails, so AS is reported **não enviado** and never sent |
| `97` | no ID, so neither call may go out, and both are reported |
| `01` | **already filed** — must be skipped, never submitted again |

That last row is the one worth watching. It carries `protocoled: true` with an
unsettled step state, which is exactly the shape that used to cause a second
submission of an already-filed protocol (see [Nothing is ever filed
twice](#nothing-is-ever-filed-twice)). Pressing Protocolar todos must leave it
alone.

Seeded **once per browser** and remembered, so *Limpar tudo* stays cleared
rather than growing the samples back on the next reload. It is
[src/mocks/seed.ts](src/mocks/seed.ts), reached only when `USE_MOCK` is on —
with mocking off the whole thing is dead-code eliminated and cannot appear in a
production build.

---

## Wiring up the real API

1. Set `VITE_USE_MOCK=false`, `VITE_API_URL` and `VITE_AUTH_TOKEN` in
   `.env.local`.
2. Uncomment the `server.proxy` block in [vite.config.ts](vite.config.ts) and
   point `target` at the real host. Proxying server-side avoids CORS — in which
   case leave `VITE_API_URL` empty so the app calls its own origin.

Two things to check against the real service:

- **The ID field.** `readId` in [src/lib/api.ts](src/lib/api.ts) currently
  accepts `id`, `Id`, `ID`, `protocolId`, `idProtocolo`, or a bare
  string/number body. Narrow it once the real shape is known.
- **The routes.** Paths and methods are in
  [src/lib/endpoints.ts](src/lib/endpoints.ts) — the lookup is `GET`, both
  submissions are `PUT`; see [Methods](#methods) for switching one and giving it
  a body.

The bearer token needs nothing beyond the variable — it is attached to all three
requests already.

---

## Testing

Everything below is meant to be followed literally, start to finish, with no
prior knowledge of the codebase. Nothing here needs a real backend, a real
protocol number, or a phone unless a step says so.

### 1. The automated suite

```bash
pnpm install     # or: npm install
pnpm test        # or: npm test
```

Expect **236 passed**. That is the whole check — if it is green, the logic is
behaving. Other ways to run it:

```bash
pnpm test:watch                        # re-runs on save
pnpm test:ui                           # browser UI, good for reading failures
pnpm vitest run src/lib/api.test.ts    # a single file
pnpm vitest run -t "the AS rule"       # tests whose name matches
pnpm vitest run --reporter=verbose     # print every test name
```

> **The suite does not read your `.env`, and never touches the network.**
> Its environment is fixed in [vitest.config.ts](vitest.config.ts) under
> `test.env` — relative endpoints, mocking on, no token — and MSW answers every
> request. This is deliberate: Vite loads `.env` during tests too, so without it
> the suite would pass or fail depending on whichever endpoints each developer
> happened to have configured. If you need to test different values, stub them
> in the test (`vi.stubEnv`), as the `bearer token` block in `api.test.ts` does
> — do not edit your `.env` to make a test pass.

Any request nobody wrote a handler for makes the suite **fail loudly** rather
than escape to the real network (`onUnhandledRequest: 'error'` in
[src/test/setup.ts](src/test/setup.ts)). A test that suddenly errors about an
unhandled request usually means the code started calling something new.

### 2. Running the app against the mock backend

This is how to exercise the whole flow by hand without touching a live service.

```bash
cp .env.example .env.local     # only if you have no .env.local yet
pnpm dev
```

`.env.local` overrides `.env` and is git-ignored. Leave `VITE_USE_MOCK` at
`true` — **mocking is what keeps you from firing real submissions at a
government service.** Confirm it is on: the three endpoints answer as JSON.

```bash
curl -k "https://localhost:5173/protocolo?protocoloId=202601300217719"
# {"id":"PRT-217719"}
```

If that returns HTML instead of JSON, mocking is off — check `VITE_USE_MOCK`
and **restart the dev server**, because [vite.config.ts](vite.config.ts) reads
the environment once at startup.

### 3. Forcing each outcome on demand

The mock decides what to do from the **last two digits** of the number, so every
path is reproducible. Write a slip by hand, or type the digits into the confirm
sheet — you do not need a real document.

| Use a number ending in | What happens | What you should see |
| --- | --- | --- |
| `19` (or anything unlisted) | everything succeeds | both rows under **Sucesso** |
| `97` | the ID lookup fails (503) | record kept with **no ID**, refresh icon offered |
| `98` | ordinary protocol fails | AS reported **não enviado**, and no AS request is sent |
| `99` | protocol succeeds, AS fails (422) | one Sucesso row, one Falha row, same number |

Full numbers you can use directly:

```text
202601300217719   everything works
202601300217797   lookup fails
202601300217798   protocol fails, AS must be skipped
202601300217799   protocol works, AS fails
```

Check the requests in **DevTools → Network**. The rules worth confirming with
your own eyes:

- The lookup goes out as **GET** with `?protocoloId=`, right after you confirm a
  scan — not when you press Protocolar.
- Both submissions go out as **PUT**, to `/<id>` path segments.
- Requests are **one at a time**, never in parallel.
- On the `98` number, **no request to the AS endpoint appears at all**. This is
  the invariant the whole app is built around: AS is never valid on its own.

### 4. Testing without paper, or without a phone

The camera is the only part that needs real hardware. Two ways around it:

**Feed Chrome a video file instead of a camera.** Works on a desktop, with no
phone and no printouts:

```bash
google-chrome \
  --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream \
  --use-file-for-fake-video-capture=/path/to/slip.y4m \
  https://localhost:5173
```

The file must be **Y4M**; convert one with
`ffmpeg -i slip.jpg -pix_fmt yuv420p slip.y4m`. There is a reference photo at
[public/mock-image.jpeg](public/mock-image.jpeg) — the same WhatsApp-recompressed
image the OCR figures were measured against.

**Skip the camera entirely.** Everything after the scan — history, editing, the
queue, the AS rule, the report — is reachable by adding a record and correcting
its number with the pencil icon. Correcting a number re-runs the lookup, so
typing one of the numbers above is enough to drive any outcome.

### 5. Manual smoke test

Worth walking once before a release. Against mocks, on a phone:

1. **Camera opens** over `https://<lan-ip>:5173` after accepting the warning.
   On plain `http://` it must refuse with an explanation, not fail silently.
2. **Aim box** drags onto the `Protocolo Nº` field, will not leave the guide,
   and is still where you left it after a reload.
3. **A scan confirms** — phone vibrates, sheet shows the photo above the digits.
4. **Tap the number** on the sheet and correct it; the record saves as edited.
5. **"Protocolar também AS"** keeps its state into the next scan.
6. **Duplicate** — scan the same slip twice; the second is blocked.
7. **Protocolar todos** shows progress, and **Parar** actually stops it.
8. **Report** lists every record under Sucesso or Falha with número · ID · motivo.
9. **Copiar / CSV** produce the same rows the screen shows.
10. **Retry** — press Protocolar todos again; already-successful records are
    skipped and only the failures go out again.
11. **Reload the page** — the history is still there.

### 6. Checking against the real service

Only after the mock run is clean.

1. Set `VITE_USE_MOCK=false`, `VITE_API_URL` and `VITE_AUTH_TOKEN` in
   `.env.local`.
2. Start with **one** number you are willing to submit for real. There is no
   undo, and the AS rule means a successful protocol cannot be taken back.
3. Watch the Network tab for a `401` (token wrong or missing) or a CORS error
   (needs the proxy in [vite.config.ts](vite.config.ts)).

### 7. Writing a new test

Tests live next to what they cover, as `*.test.ts` / `*.test.tsx`. Two
conventions matter, and both exist because of bugs this project actually hit:

- **Register handlers with `http.all`, not `http.get`.** The verb for each call
  lives in [src/lib/endpoints.ts](src/lib/endpoints.ts) and changes; a handler
  pinned to `GET` silently stops matching and the request falls through to the
  default mock, which usually answers `200` — so the test keeps passing while
  asserting nothing. Pin verbs only in the dedicated **HTTP methods** block in
  `api.test.ts`.
- **Route from `ENDPOINTS`, never a hand-written path.** A literal in a test
  drifts the moment a route changes, and drifts silently for the reason above.
- **Compare resolved URLs, not pathnames.** With mocking off the base is
  absolute, with it on the base is empty. Both test files define an `endpoint()`
  helper that resolves a path the same way `api.ts` does; use it. And prefer an
  exact match over `startsWith` — the AS path *begins with* the ordinary one's
  (`…/protocolaragendamento` and `…/protocolaragendamentoas`), so a prefix test
  cannot tell them apart.

---

## Test coverage

Vitest + Testing Library + MSW, 236 tests. Notable coverage:

- **`protocol.test.ts`** — extraction against *verbatim OCR output* captured
  from the reference photo, including the mangled `Nº`; label anchoring
  preferring the labelled number over other long numbers on the page.
- **`queue.test.ts`** — the AS rule: AS never precedes the ordinary protocol,
  never fires when it fails, never fires without an ID; strict one-at-a-time
  sequencing verified by counting concurrent in-flight requests. Plus **never
  files the same protocol twice**, driving the exact states an interrupted or
  AS-only run leaves behind.
- **`seed.test.ts`** — the mocked starting history covers each deterministic
  outcome once, survives a deliberate clear, and keeps its already-filed row out
  of the queue.
- **`preprocess.test.ts`** — the `object-fit: cover` coordinate mapping, for
  both the scan box and the tap-to-focus point, including that the two agree at
  the same on-screen spot; and a guard that the scan region stays large (a
  regression here silently reproduces the focus-blur bug).
- **`api.test.ts`** — ID field variants, error mapping, URL construction; the
  bearer token on all three calls and its absence when unconfigured; the exact
  verb each call uses (GET lookup, PUT submissions), which is the guard on a
  one-word edit reaching production.
- **`sw.test.ts`** — the service worker's caching allowlist, run against
  stand-in globals: that no submission and no lookup is ever cached, and that
  the build output and the Tesseract runtime are.
- **`api.test.ts`, older Safari** — the suite deletes `AbortSignal.any` and
  `AbortSignal.timeout` to emulate an iPhone below iOS 17.4, and asserts that
  cancels and timeouts still arrive distinguishable from each other. Without the
  fallbacks every request threw before leaving the app.
- **`storage.test.ts`** — migration of records written by older versions; the
  aim box surviving a corrupt or out-of-bounds saved value.
- **`ScannerView.test.tsx`** — the aim box goes where it is dragged, stays
  inside the guide, and tells a tap apart from a drag.
- **`ConfirmSheet.test.tsx`** — the human safety net: photo present, duplicates
  blocked, corrections reported as edited.

---

## How accurate is the OCR?

Measured against the reference photo in `public/` — a WhatsApp-recompressed
image, close to a worst case.

**The pipeline was rewritten once.** The first version framed a thin box around
the number and did grayscale + Otsu thresholding. Two things were wrong with it:

1. **Focus.** Filling a thin box means holding the phone inside its minimum
   focus distance. Every frame came back blurred, and no thresholding recovers
   a defocused image.
2. **Binarization hurt.** A single global threshold cannot cope with the
   lighting gradient across a whole sheet. Tesseract's own adaptive
   thresholding, which sees the page layout, does better.

Reading the whole slip with no binarization took per-frame accuracy from
**~39% to ~85%**, and cut a confirmed read from ~11 frames to ~2-3.

**What that did and did not settle.** The finding was about *where the phone is
held*, not about how much of the frame is read — those had simply been the same
decision. They are now separate: the guide still frames the whole slip, so the
distance is unchanged, while only the [aim box](#the-aim-box) inside it is
recognised. The crop comes out of the same in-focus frame, so it keeps the
accuracy and adds the one thing text alone cannot give — *which* field was
meant. The figures above were measured full-page and have not been re-measured
per-band; treat them as the floor.

Three findings worth recording, all of which contradicted the obvious guess:

- **Luma grayscale beat green-channel extraction** on the tight crop (8/18
  framings vs 2/18), despite purple ink on pink stock making green look right
  in theory.
- **Plain colour beat grayscale** on the full page.
- **Auto-inverting when most pixels are dark is harmful** — it misfires
  whenever the crop catches the dark background around the paper.

### Residual error rate

At n=15 trials the configurations tested landed between 12/15 and 15/15 correct,
which is **within noise** — the numbers below are not precise enough to rank
close variants, only to establish that the rewrite was a large improvement.

A wrong read is a *plausible-looking single-digit substitution*, not obvious
garbage. That is why:

- Multi-frame agreement is required before anything is offered
  ([`src/lib/consensus.ts`](src/lib/consensus.ts)), with a higher bar for reads
  whose date prefix does not parse.
- The confirm sheet puts **the photo directly above the digits**.

**That comparison, not the OCR, is the correctness guarantee.** Take the glance
seriously; a wrong number that reaches the confirm sheet looks completely
normal. Anything that slips through is still fixable from the history.

---

## Project layout

```text
src/
  lib/
    protocol.ts      label-anchored extraction + validation
    preprocess.ts    guide + aim box, ROI → intrinsic-pixel mapping, crop
    ocr.ts           Tesseract worker lifecycle
    consensus.ts     multi-frame voting (the misread defence)
    api.ts           the three backend calls (GET lookup, PUT submissions)
    queue.ts         sequential run + the AS rule
    storage.ts       localStorage history + migration
    config.ts        env-driven settings (base URL, token, timeout)
    endpoints.ts     the route table: path + method per call
  hooks/
    useCamera.ts     getUserMedia, torch, tap-to-focus, teardown
    useScanner.ts    the scan loop
  components/
    Dashboard.tsx    home: stats, history, actions
    ScannerView.tsx  full-screen camera + document guide
    ConfirmSheet.tsx photo-vs-digits confirmation
    EditProtocolDialog.tsx
    ResultsPanel.tsx
    ui/              shadcn/ui primitives
  mocks/
    scenario.ts      what the mock backend does (shared)
    handlers.ts      MSW handlers for tests
    server.ts        MSW node server
  test/
    setup.ts         MSW lifecycle for the suite
    sw.test.ts       the service worker's caching rules
plugins/
  mock-api.ts        serves the mock API from the dev server
  dev-cert.ts        loads the dev certificate, serves the CA at /dev-ca.crt
public/
  sw.js              service worker — offline shell, never caches the API
  manifest.webmanifest
  icon-*.png         PWA icons (generated from favicon.svg)
scripts/
  check-package-manager.mjs
                     preinstall guard: allows pnpm and npm, blocks the rest
  dev-cert.mjs       issues the local CA + LAN server certificate
certs/               generated by `pnpm cert`, git-ignored — never commit
```

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix),
Tesseract.js, MSW, Vitest.

---

## Scripts

| | |
| --- | --- |
| `pnpm dev` | LAN dev server over HTTPS |
| `pnpm cert` | issue a dev certificate covering this machine's LAN address, so a phone can install the PWA |
| `pnpm build` | typecheck + production build |
| `pnpm preview` | serve the build over HTTPS, for LAN/phone testing |
| `pnpm preview:pwa` | serve the build over HTTP on localhost, where the service worker can register |
| `pnpm test` | run the test suite |
| `pnpm test:watch` / `pnpm test:ui` | watch mode / browser UI |
| `pnpm lint` | oxlint |
| `pnpm lock:npm` | regenerate `package-lock.json` from `package.json` |

Every one of these runs under npm too, as `npm run <name>` (`npm test` and
`npm install` need no `run`).

### pnpm or npm

**Both work.** pnpm is what the project is developed with; npm is fully
supported because pnpm — really corepack, and `node_modules` symlinks — is
unreliable on some Windows machines. Each has its lockfile committed:

| | |
| --- | --- |
| pnpm | [pnpm-lock.yaml](pnpm-lock.yaml) |
| npm | [package-lock.json](package-lock.json) |

A `preinstall` guard
([scripts/check-package-manager.mjs](scripts/check-package-manager.mjs)) allows
those two and rejects yarn and bun, which have no lockfile here and would
resolve their own untested tree.

**The two lockfiles have to be kept in step.** After adding or upgrading a
package with one manager, regenerate the other's lockfile and commit both:

```bash
pnpm add <pkg>@<version>   # updates package.json + pnpm-lock.yaml
pnpm lock:npm              # updates package-lock.json to match
```

Going the other way, `npm install <pkg>` updates `package-lock.json`, and
`pnpm install` then brings `pnpm-lock.yaml` back in line.

### On version pinning

Dependencies are pinned to exact versions in `package.json`, and both managers
are configured to keep it that way (`saveExact` in
[pnpm-workspace.yaml](pnpm-workspace.yaml), `save-exact` in [.npmrc](.npmrc)).
That is a pin on what gets *written*, not a gate on installing — it never
causes an install to fail.

What used to cause failures was the surrounding strictness, all of which has
been removed deliberately:

- **`packageManager: pnpm@…`** — made corepack fetch one exact pnpm build, and
  made corepack-shimmed npm refuse to run at all.
- **`engine-strict`** — turned the `engines` range into a hard install error on
  any other Node. `engines` is still declared (`node >=20.19.0`, the floor Vite
  and oxlint ask for) but is now advisory: an older Node warns instead of
  refusing.
- **`frozen-lockfile`** — failed the install whenever a different manager
  version wanted to rewrite the lockfile format.

The reproducible install is still there when you want it — `pnpm install
--frozen-lockfile` or `npm ci`, both of which CI should use. A plain local
install is allowed to update the lockfile; commit it when it changes.

Note that pnpm's `allowBuilds` (which blocks the msw and tesseract.js
postinstall banners) has no npm equivalent, so an `npm install` prints those
two notices. They are cosmetic.

---

## Troubleshooting

**The camera will not open.** Check the address is `https://`. On plain HTTP the
browser blocks `getUserMedia` entirely. If Android Chrome refuses the
self-signed certificate, add the origin to
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

**It never finds a number.** First check the **aim box is actually over the
`Protocolo Nº` field** — nothing outside it is read. Then get the whole slip in
the guide and hold steady for a couple of seconds; do not move closer. Use the
torch button in dim light. Three frames have to agree.

**It reads the wrong "Protocolo" off the page.** The aim box is on the wrong
field. Drag it onto the right one — the position is remembered from then on.

**The picture will not sharpen.** Tap the paper on screen — that runs a focus
sweep aimed at the point you touched, and a ring marks where. If it is still
soft, **move the phone further away**: every camera has a minimum focus
distance, and inside it nothing focuses, in any app. This is also why the guide
is large. On iOS there is no tap-to-focus at all (see below), so distance and
light are the only levers there.

**It found the wrong number.** Correct it on the confirm sheet, or later from
the history with the pencil icon. If it happens often, more light and a flatter,
less creased slip help more than any setting.

**The mock endpoints 404 / everything fails with "sem ID".** The middleware
only registers when mocking is on and the paths match. Check `VITE_USE_MOCK`
is not `false`, and restart the dev server — `vite.config.ts` reads the env at startup, so
changes there need a restart, not just a reload.

**Everything fails with "Bloqueado: VITE_USE_MOCK está ligado…".** Working as
intended, and it just stopped a real submission. Mocking is on while a call
still resolves off-origin — which configuration can no longer cause, so the
cause is a bad `path` in [src/lib/endpoints.ts](src/lib/endpoints.ts): a
protocol-relative `//host/x` looks like a path but resolves to another host.
See [Mocking cannot be half-on](#mocking-cannot-be-half-on).

**Mocking is on but real protocols were filed.** Fixed — that combination is now
unreachable: while mocking, the base URL is forced to the app's own origin
whatever `.env` says. If you are on an older build, the cause is absolute URLs
in `.env`, which bypass the dev server entirely so the mock never sees the
request. Restart the dev server after updating.

**Against a real host, everything fails with "sem ID".** The lookup endpoint is
unreachable. Check `VITE_API_URL` and that the proxy in `vite.config.ts` is
uncommented and pointed at the right target.

**The tests fail after I changed an HTTP method.** Expected — update the **HTTP
methods** block in `api.test.ts` to the verbs you now send. That test exists to
make this deliberate. If instead the failures are `expected null to be …`, a
handler somewhere is pinned to `http.get` and no longer matches; switch it to
`http.all`.

**A test passes locally and fails for someone else, or vice versa.** The suite
fixes its own environment in `vitest.config.ts`, so this should not happen from
`.env` drift any more. If it does, check the test is not reading `import.meta.env`
directly instead of stubbing it.

**pnpm fails to install, or corepack errors out.** Use npm instead — `npm
install`, then `npm run dev`. Both are supported and both lockfiles are
committed; see [Scripts](#scripts). This is the expected escape hatch on
Windows machines where corepack or `node_modules` symlinks misbehave.

**`npm install` says the project is configured to use pnpm.** That is corepack
intercepting npm. The `packageManager` field that caused it is gone, so pull
the latest `main` first; if it persists, `corepack disable npm`.

**`npm install` fails with `EUNSUPPORTEDPROTOCOL — Unsupported URL Type
"workspace:"`.** You are running npm over a `node_modules` that pnpm built. npm
reads the existing tree, walks into `node_modules/.pnpm/`, and trips on
`workspace:` specs in packages it was never meant to look at. **Delete
`node_modules` when switching package managers** — the two lay it out
differently and cannot share one:

```bash
rm -rf node_modules      # Windows: rmdir /s /q node_modules
npm install
```

**The phone adds a shortcut instead of installing the app.** The two causes are
the certificate and the build; see [Installing on a
phone](#installing-on-a-phone). Short version: run `pnpm cert`, install
`https://<lan-ip>:4173/dev-ca.crt` on the phone (on iOS also enable it under
Certificate Trust Settings), and serve a **production** build — `pnpm dev` never
registers a worker by design.

**iOS will not open the page at all.** Same certificate problem, enforced more
strictly than on Android. Follow [Installing on a
phone](#installing-on-a-phone). If it loads but nothing submits, that is a
different issue: `AbortSignal.any` needs Safari 17.4+, and `AbortSignal.timeout`
Safari 16+ — [src/lib/api.ts](src/lib/api.ts) falls back to hand-wired listeners
when either is missing, so check you are running a current build.

**I installed the CA on iOS and it still complains.** You almost certainly
skipped the second step. Installing a root under *VPN & Device Management* is
not enough — it stays untrusted until you switch it on under Settings → General
→ About → **Certificate Trust Settings**.

**An old version keeps loading after a deploy.** The worker activates on the
next full load; close the installed app and reopen it. If it persists, DevTools
→ Application → Service workers → *Unregister*, then reload. When you have
changed the caching rules themselves, bump `VERSION` in `public/sw.js`.
