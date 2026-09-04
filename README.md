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
![Windows](https://img.shields.io/badge/deploys%20to-Windows-0078d4?logo=windows)

</div>

---

> **Five guarantees the code is built around**
>
> | | |
> | --- | --- |
> | 🔒 **AS is never alone** | The AS submission only ever follows a successful ordinary protocol — [details](#the-as-rule) |
> | 🆔 **Nothing goes out without its id** | A run waits for the confirm-time lookups instead of failing the slips still resolving — [details](#nothing-is-submitted-without-its-id) |
> | 🔁 **Nothing is filed twice** | A filed protocol is remembered in a sticky flag, so no rerun, reload or abort can resend it — [details](#nothing-is-ever-filed-twice) |
> | 🧪 **Mocking is all-or-nothing** | With mocks on, nothing can reach a real service — [details](#mocking-cannot-be-half-on) |
> | 🛡️ **Citizen data never leaves the server** | The API strips every personal field before a browser can see it — [details](#the-dto-boundary) |

---

## Table of contents

- [How it works](#how-it-works)
- [Using the app](#using-the-app)
- [Running it on your phone](#running-it-on-your-phone)
- [Installing it as an app (PWA)](#installing-it-as-an-app-pwa)
- [Configuration](#configuration)
- [The DTO boundary](#the-dto-boundary) — **read this before touching `server/`**
- [Running the server](#running-the-server)
- [Using it from an iPhone](docs/IPHONE.md)
- [Verifying a change](#verifying-a-change) — start here if you are new to the project
- [Setting up the Windows machine](docs/WINDOWS.md)
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

This is enforced in one place, [`runRecord` in src/lib/queue.ts](src/lib/queue.ts).
To check it by hand, scan a number ending in `98`: the ordinary protocol fails,
and the AS endpoint must never be contacted.

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

To check it by hand, scan a number ending in `97`, whose lookup fails, and
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

To check it by hand: run a batch, then press *Protocolar todos* again. Every
record that already succeeded must be skipped.

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
If you widen the cache rules, re-read that comment first — it is now the only
thing standing between a submission and a cache.

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
pnpm start               # build, then serve app + API on 4173
```

Then, **on the phone**, open `https://<lan-ip>:4173/dev-ca.crt` and install it:

- **Android** — Settings → Security → Encryption & credentials → Install a
  certificate → **CA certificate**. (Some builds put it under Settings →
  Security → More settings.)
- **iOS** — open the link in Safari, allow the profile download, then Settings →
  General → **VPN & Device Management** → install it. Then the step everyone
  misses: Settings → General → About → **Certificate Trust Settings** → switch
  it on. iOS ignores a user-installed root until you do.

> **Sending this to someone who is not a developer?** Point them at
> **[docs/IPHONE.md](docs/IPHONE.md)** instead — the same steps in Portuguese,
> written for whoever is holding the phone, with the troubleshooting they will
> actually hit. Android needs none of it; it lets you click through the warning.

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
pnpm server:http      # http://localhost:4173
```

That serves the real build over **plain HTTP on localhost**, which browsers
treat as a secure context — so the service worker registers *and* the camera
still works. It is the same server as `pnpm server`, with TLS off.

A flag (`--http`) rather than an env var, because `HTTPS=false cmd` means
nothing in Windows' cmd or PowerShell, and Windows is where this is deployed.

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
phone](#installing-on-a-phone) above, and [docs/IPHONE.md](docs/IPHONE.md) for
iOS specifically.

A public tunnel (`ngrok`, Cloudflare Tunnel) gives a trusted certificate with no
device setup, and no longer leaks a token — there is none in the bundle any more.
It does, however, put a login form for a government service on the open internet,
protected by nothing but whoever's password. The local CA keeps everything on the
LAN, which is the reason to prefer it.

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

Copy [`.env.example`](.env.example) to `.env` and edit. One file feeds two
processes, and the prefix is what separates them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPSTREAM_URL` | — | **Required.** The Mais Cidadão service. Server-side only |
| `PORT` | `4173` | The one port serving the app *and* the API |
| `UPSTREAM_TIMEOUT_MS` | `20000` | How long the server waits on Mais Cidadão |
| `VITE_USE_MOCK` | `true` | Serve the mock API from the dev server |
| `VITE_REQUEST_TIMEOUT_MS` | `25000` | Per-request timeout, browser side |

`VITE_`-prefixed variables are **inlined into the bundle at build time**, so
rebuild after changing one — and so anyone with the app can read them.
Everything unprefixed stays in `server/`, because Vite's `envPrefix` drops it.

That split is not a convention, it is the mechanism: `UPSTREAM_URL` names the
real government service, and `pnpm build && grep -r maiscidadao dist/` returns
nothing. See [The DTO boundary](#the-dto-boundary).

`UPSTREAM_URL` has no default and the server refuses to boot without it. There
is no safe guess: a wrong one either fails everything or quietly points a batch
of real submissions somewhere nobody intended, and a submission has no undo.

### No URL, and where the paths live

There is no `VITE_API_URL`. Every call the app makes is a **same-origin relative
path** under `/api`, answered by the Express server in `server/` — which serves
this very build from the same port. Nothing to configure per machine, and it
works on any network:

```
POST /api/auth/login                              -> { token, usuario }
GET  /api/protocolos?protocoloId=<15 digits>      -> { id, numprotocolo, data }
PUT  /api/protocolos/protocolar/<id>
PUT  /api/protocolos/protocolar-as/<id>
GET  /api/health                                  -> { ok, upstream }
```

Those are **our** paths. What they map to at Mais Cidadão lives in
[server/protocolo/protocolo.service.ts](server/protocolo/protocolo.service.ts)
and nowhere else.

The table above is [src/lib/endpoints.ts](src/lib/endpoints.ts), imported by all
three consumers — the client ([src/lib/api.ts](src/lib/api.ts)), the dev-server
mock ([plugins/mock-api.ts](plugins/mock-api.ts)) and the server
([server/api.routes.ts](server/api.routes.ts)) — so they cannot disagree about
where a call goes.

Note the id is always the **last** path segment (`/protocolar/<id>`, never
`/<id>/protocolar`). `segmentAfter` in the dev-server mock matches on exactly
that shape, and `protocolar-as` is a sibling of `protocolar` rather than a path
beneath it, so neither can shadow the other.

### Auth

There is no `VITE_AUTH_TOKEN`. It was compiled into the bundle — the same token
for every user, readable by anyone with the app, and impossible to attribute to
a person.

Each operator logs in instead. `POST /api/auth/login` forwards the credentials
to Mais Cidadão, and the session that comes back is stripped to `nome`,
`nivel_permissao` and `podeProtocolar` before the browser sees it. The token is
kept in `localStorage` ([src/lib/session.ts](src/lib/session.ts)), so a phone
auto-logs-in and survives a restart of the API — the header shows who is filing,
which matters on a shared phone.

Two behaviours worth knowing:

- **A stored, unexpired token gets you in with no round trip.** The app is
  usable offline by design, and a gate that waited on the network would turn "no
  signal" into a login screen nobody could get past. Only a real HTTP 401 clears
  the session; a network failure never does.
- **The first 401 ends the run.** `api.ts` sets a flag and every later call
  returns immediately without touching the network. A token expiring at slip 87
  of 200 would otherwise cost 113 pointless round trips and 113 junk rows in the
  report. A **403** is deliberately not treated this way — that is per-slip, and
  folding it in would log the operator out over one bad record.

While mocking, the token is still **enforced**: the mock issues one at login and
answers 401 to any other request that does not carry it back. So a session that
was never stored, or never put on the wire, fails in dev rather than against the
real service.

### Methods

Each call's method sits next to its path in
[src/lib/endpoints.ts](src/lib/endpoints.ts):

| Endpoint | Method | Call |
| --- | --- | --- |
| `login` | `POST` | `{ email, senha }` → `{ token, usuario }` |
| `lookup` | `GET` | `?protocoloId=<num>` → the protocol DTO |
| `protocol` | `PUT` | ordinary protocol submission |
| `protocolAs` | `PUT` | AS submission |

To change one, edit the table and, if the call wants a payload, add a `body` at
that call site. The shared `request` helper serialises it, sets the
Content-Type, attaches the token and applies the timeout, and every mock handler
answers any method — so nothing else needs touching. Only
[server/api.routes.ts](server/api.routes.ts) has to agree, since Express does
police the verb.

> Change a verb and [server/api.routes.ts](server/api.routes.ts) has to change
> with it — Express does police the method, and a mismatch surfaces as the
> terminal `404` from the `/api` router rather than as anything more helpful.

**Mocking defaults to on.** A fresh clone with no `.env` runs against mocks
rather than firing real submissions at a live government service because
someone forgot to create one.

### Mocking cannot be half-on

There used to be a way to have `VITE_USE_MOCK=true` and still file real
protocols, and it was completely silent: the mock is served by the dev server,
so it can only intercept requests that *reach* the dev server, and
`VITE_API_URL` was free to point somewhere else. Mocking looked on. Every
submission was real, and a filed protocol has no undo.

That configuration no longer exists to be got wrong. Every call is a same-origin
relative path, so there is no host to point anywhere — and with it, the question
moved. **What decides whether a submission is real is now which process you
started**, and that is invisible from a phone. So the answer moved to the server:

1. **It refuses to boot without an explicit `UPSTREAM_URL`.** No default, no
   guess.
2. **It says so on every start**, in the banner:
   `⚠ SUBMISSÕES REAIS → https://…`
3. **`GET /api/health` reports what it is pointed at**, so you can check from
   anywhere on the network without reading a terminal.

The two client-side defences are kept as a tripwire rather than deleted:

- `API_URL` in [src/lib/config.ts](src/lib/config.ts) is unconditionally `''`,
  so a stray `VITE_API_URL` in someone's `.env` cannot point a submission
  anywhere.
- `request` in [src/lib/api.ts](src/lib/api.ts) still refuses anything that
  would leave this origin — before `fetch`, so nothing goes out. That catches
  the one remaining route in: a bad path in `endpoints.ts`, such as a
  protocol-relative `//host/path` that looks like a path and is not.

Deleting those two would be the tempting cleanup that leaves nothing at all, in
a change that already removed the original guarantee.

And on the server side there is now a third, which is the strongest of them:
with `MOCK_UPSTREAM` on — the default — `callUpstream` returns before it builds
a URL, so there is no `fetch` call in the process at all. Not a refused request,
not a request to the wrong host: no code path from this machine to the
government service exists.

> If you see *Bloqueado* in the report, an endpoint in `endpoints.ts` points
> somewhere other than this origin. That is a bug in the table, not a
> configuration problem.

### The mock backend

The mock is served by the **dev server itself**
([`plugins/mock-api.ts`](plugins/mock-api.ts)), as ordinary HTTP routes. It
also runs under `pnpm preview`, so a preview of the production build behaves
the same.

`src/lib/api.ts` therefore issues its real `fetch` calls unchanged — the code
exercised against mocks is the code that ships.

> **Why not a service worker?** It cannot work on the phone. Browsers **refuse
> to register a service worker on an origin with a certificate error**, bypassed
> or not, because a service worker is persistent code — and until the local CA
> is installed, that is exactly what a phone sees. Serving the routes from the
> dev server sidesteps this entirely and needs nothing installed on the phone.


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

## The DTO boundary

**Read this before changing anything in `server/`.**

The Mais Cidadão service answers a protocol lookup with the citizen's whole
record: full name, CPF, SUS card number, mobile number, and a nested street /
neighbourhood / district address. **None of that may cross from `server/` into
`src/`.** The computer running the API is the boundary. The operator is standing
there holding the paper — the person's details are already in their hand, and
putting them in a browser puts them in that phone's DevTools and its disk cache
as well.

### Where the boundary lives

Two files, and only two:

| file | what it lets through |
| --- | --- |
| [server/protocolo/protocolo.dto.ts](server/protocolo/protocolo.dto.ts) | `id`, `numprotocolo`, `data` |
| [server/auth/auth.dto.ts](server/auth/auth.dto.ts) | `nome`, `nivel_permissao`, `podeProtocolar`, `token` |

An upstream field reaches a browser **only** if it is written out literally in
one of those. That is the whole mechanism.

`podeProtocolar` is worth a note: it is a boolean the server derives from the
upstream `permissoes` array precisely so that array — eighteen entries
describing every screen of a system this app is not — never has to leave.
Deriving beats forwarding whenever the client only needs a yes or no.

### Whitelist, never blocklist

Build the outgoing object field by field. Do **not** take the upstream object
and delete the sensitive keys.

```ts
// ✅ Whitelist. A new upstream field simply does not appear.
return { id: String(p.id ?? ''), numprotocolo: String(p.numprotocolo ?? ''), data: String(p.data ?? '') }

// ❌ Blocklist. Works today; leaks in silence the day upstream adds
//    `cpf_responsavel`, or renames `Pessoa` to `Requerente`.
const dto = { ...upstream }
delete dto.cpf
```

And forwarding the raw object while "just not showing it in the UI" is not a
filter at all. It is in the network tab, in the JavaScript heap, and in
`localStorage` if anything caches it.

### How to check it

There is no test enforcing this. There was one, and it was removed along with
the rest of the suite — so this is now a rule people keep, not a rule the
repository keeps for them. Which makes checking it by hand worth the thirty
seconds.

The mock is built for exactly this. `server/shared/mock-upstream.ts` answers
with a **full upstream-shaped payload** — invented CPF, SUS card, phone number
and address — so the DTOs run for real against data that must not get through:

```bash
pnpm start          # mocked by default; nothing leaves the machine

TOKEN=$(curl -sk -X POST https://localhost:4173/api/auth/login \
  -H 'content-type: application/json' -d '{"email":"x","senha":"y"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -sk 'https://localhost:4173/api/protocolos?protocoloId=202601300217719' \
  -H "authorization: Bearer $TOKEN"
```

That must print **exactly**:

```json
{"id":"217719","numprotocolo":"202601300217719","data":"2026-08-26"}
```

Three keys. If you see a fourth, or any of `cpf`, `sus`, `nomecompleto`,
`celular01`, `Pessoa`, `Logradouro` or `pessoa_id`, the boundary is broken —
and the fixture proves it, because those values were in the payload the DTO
was handed.

Widening the whitelist is a deliberate decision. Make it deliberately: change
the DTO, run the above, and look at what comes out.

### The sibling rule: logs

The DTOs keep the citizen's record out of the browser. A `console.log(body)`
added while debugging puts the identical payload into a terminal scrollback or a
log file, which is the same leak by another route.

Log the method, the path, the status and the duration. Never the upstream body,
never the `Authorization` header. There is a comment saying so at the exact line
in [server/shared/upstream.ts](server/shared/upstream.ts) where someone will
want to add that log at one in the morning.

### Why the API exists at all

Before it, the app called the government service straight from the browser with
a token compiled into the bundle. That was three problems at once: the service's
CORS policy was not ours to change, the token was identical for everyone and
readable by anyone with the app, and the raw response — CPF and all — arrived
whole in the browser.

Putting a local Express server in front fixed all three, because CORS is a
*browser* policy and Node's `fetch` is not subject to it. Restoring a direct
call from the frontend would undo every part of that at once.

---

## Running the server

One process serves both the app and the API, on **one port**, so a phone has a
single origin to talk to — no CORS, no mixed content, and one certificate to
trust instead of two.

```bash
pnpm cert          # once per machine, and again if its LAN IP changes
pnpm start         # build, then https://localhost:4173 and https://<lan-ip>:4173
```

### Which machine is allowed to file real protocols

Exactly one: the Windows box physically at the site. Everywhere else — including
whatever you develop on — the server runs **mocked**, and that is the default
rather than something to remember.

Mocked means what it says: `callUpstream` returns before it builds a URL, so
there is no code path from the process to the government service at all. Not a
refused request; no request. Permission to call that service belongs to a place
and a person, not to whoever has the repository checked out, and "I just ran it
to see if it worked" must not be able to file a protocol against a real
citizen's record.

So the banner says which mode it is in, every time:

```
  ✓  MODO SIMULADO — nenhuma requisição sai desta máquina.
```

```
  ⚠  SUBMISSÕES REAIS → https://o-servico-real
     Cada protocolo enviado é definitivo. Não há desfazer.
```

`GET /api/health` answers the same question — `{"ok":true,"mock":true,...}` —
so you can check from a phone rather than by reading a terminal.

Turning it off is one line in the deployment machine's `.env`, and the server
then **refuses to boot** without an explicit `UPSTREAM_URL`. The full procedure
is **[docs/WINDOWS.md](docs/WINDOWS.md)**.

> This replaced what `VITE_USE_MOCK` used to guarantee. The client forced its
> base URL to its own origin while mocking, so it physically could not reach a
> live service. Now every call is a relative `/api` path, so that question moved
> to the server — and had to be answered there just as firmly.

### Where the settings live

One `.env`, and the prefix is the boundary: `VITE_*` reaches the browser,
everything else stays in `server/`. `UPSTREAM_URL` deliberately has no prefix,
so it is never inlined into anything a phone downloads —
`pnpm build && grep -ri upstream dist/` returns nothing, and that is the
property rather than a habit. Full table in [Configuration](#configuration).

### Developing

Mocked, which is the default and needs no server at all:

```bash
pnpm dev           # https://localhost:5173, plugins/mock-api.ts answers /api
```

Against the Express server — still mocked upstream, but exercising the server's
real DTOs, selection logic and status mapping — two terminals:

```bash
pnpm server:watch                 # terminal 1 — restarts on change
VITE_USE_MOCK=false pnpm dev      # terminal 2 — proxies /api to it
```

With `VITE_USE_MOCK=false`, [vite.config.ts](vite.config.ts) forwards `/api` to
the server rather than letting the browser call it directly, so there is still
exactly one origin in play. The two browser-side mechanisms are mutually
exclusive by construction — the proxy only exists when `useMock` is false.

Note that `VITE_USE_MOCK` and `MOCK_UPSTREAM` are different switches and both
default to on. The first decides whether the *browser* talks to a real server;
the second decides whether the *server* talks to the real government service.
Turning the first off is routine. Turning the second off is not.

`pnpm preview` now serves on **4174**, not 4173 — 4173 belongs to `pnpm server`,
which is what a phone connects to.

### On Windows

The deployment machine is Windows, and three things there are not the same:

- **Env-var prefixes do not work.** `HTTPS=false pnpm server` means nothing in
  cmd or PowerShell, so the switch is a flag: `pnpm server:http`.
- **openssl is not on PATH.** `pnpm cert` looks inside Git for Windows, which
  bundles one, so installing Git is enough.
- **The firewall blocks port 4173 inbound by default**, silently — the server
  starts, localhost works, and no phone can connect. One `netsh` command fixes
  it.

All three are covered in [docs/WINDOWS.md](docs/WINDOWS.md), along with keeping
the server running across reboots.

### On a phone

The certificate has to be trusted first. Android will let you click through;
**iPhone will not**, and needs a specific two-step install that is easy to get
half-right — see **[docs/IPHONE.md](docs/IPHONE.md)**.

One thing that catches everyone: `pnpm cert` bakes the machine's LAN IP into the
certificate's SAN at the moment it runs. Change network, or get a different
address from DHCP, and the certificate no longer matches:

```bash
rm certs/dev-server.*   # keep certs/dev-ca.crt — reusing it keeps phones trusting you
pnpm cert
```

---

## Verifying a change

There is **no automated test suite.** It was removed deliberately: this is a
small tool with one operator and one deployment, and the suite was costing more
in day-to-day friction than it was returning.

What replaced it is that the mock is good enough to exercise everything by hand,
in a couple of minutes, without touching the real service. Do this before any
deploy.

### 1. Run it

```bash
pnpm dev            # https://localhost:5173 — mock in the dev server
```

or, closer to what actually ships:

```bash
pnpm start          # build + serve app and API together on 4173
```

Both are mocked by default, and `pnpm start` prints which mode it is in. **No
request leaves the machine unless `MOCK_UPSTREAM=false`,** which belongs only on
the deployment machine — see [docs/WINDOWS.md](docs/WINDOWS.md).

`pnpm start` is the more useful of the two, because it runs the server's real
code: the DTOs, the selection logic and the status mapping all execute against a
full upstream-shaped payload, fake CPF and address included. Curl it and watch
the boundary work:

```bash
curl -k -X POST https://localhost:4173/api/auth/login \
  -H 'content-type: application/json' -d '{"email":"x","senha":"y"}'
# -> only { token, usuario: { nome, nivel_permissao, podeProtocolar } }

curl -k 'https://localhost:4173/api/protocolos?protocoloId=202601300217719' \
  -H 'authorization: Bearer <token>'
# -> only { id, numprotocolo, data } — no cpf, no sus, no nomecompleto
```

### 2. Forcing each outcome on demand

Failures are keyed on the **last two digits** of the number, so every path is
reproducible without waiting for one to happen:

| Number ends in | Behaviour |
| --- | --- |
| `97` | ID lookup fails — the record is kept without an ID |
| `98` | ordinary protocol fails — AS must then be skipped |
| `99` | ordinary protocol succeeds, AS fails |
| anything else | everything succeeds |

Both mocks use the same digits — the constants are exported from
[src/mocks/scenario.ts](src/mocks/scenario.ts) and imported by
[server/shared/mock-upstream.ts](server/shared/mock-upstream.ts), so a number
that reproduces something in the browser reproduces it against the server too.

With mocking on, a first visit also starts with a **sample history already in
the list**, so you can press *Protocolar todos* immediately — no camera, no
paper. The rows are chosen to hit each rule above exactly once.

### 3. Without paper, or without a phone

**Feed Chrome a video file instead of a camera:**

```bash
google-chrome \
  --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream \
  --use-file-for-fake-video-capture=/path/to/slip.y4m \
  https://localhost:5173
```

The file must be **Y4M**; convert one with
`ffmpeg -i slip.jpg -pix_fmt yuv420p slip.y4m`. There is a reference photo at
[public/mock-image.jpeg](public/mock-image.jpeg).

**Or skip the camera entirely.** Everything after the scan — history, editing,
the queue, the AS rule, the report — is reachable by adding a record and
correcting its number with the pencil icon. Correcting a number re-runs the
lookup, so typing one of the numbers above drives any outcome.

### 4. The walkthrough

Worth doing once before a release, on a phone, against the mock:

1. **Camera opens** over `https://<lan-ip>:4173`. On plain `http://` it must
   refuse with an explanation, not fail silently.
2. **Aim box** drags onto the `Protocolo Nº` field, will not leave the guide,
   and is still where you left it after a reload.
3. **A scan confirms** — phone vibrates, sheet shows the photo above the digits.
4. **The AS rule holds** — a `98` number reports AS as *não enviado*, and the AS
   endpoint is never contacted.
5. **Nothing is filed twice** — press *Protocolar todos* again; successful
   records are skipped and only failures go out.
6. **The history survives a reload.**
7. **Log out and back in** — the history is still there. Logging out clears the
   session and nothing else; wiping the history would make a half-finished stack
   re-file every slip.
8. **Turn the Wi-Fi off and reload** — the app comes back logged in, with the
   history, rather than at a login screen it cannot pass.

### 5. Against the real service

Only on the authorised machine, and only after the above is clean. The full
procedure is [docs/WINDOWS.md](docs/WINDOWS.md) § 6. In short: flip
`MOCK_UPSTREAM=false`, confirm the banner changed to **SUBMISSÕES REAIS**, and
start with **one** number you are willing to file for real. There is no undo.

Two checks worth running there before anything else:

```bash
# The API's 404 must be JSON, not the HTML shell. This is what stops a mistyped
# endpoint being reported as a filed protocol.
curl -k -i https://localhost:4173/api/nao-existe

# And confirm on real data that nothing personal crosses.
curl -k 'https://localhost:4173/api/protocolos?protocoloId=<15 digits>' \
  -H 'authorization: Bearer <token>'
```

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
    api.ts           the four backend calls (login, lookup, two submissions)
    queue.ts         sequential run + the AS rule
    storage.ts       localStorage history + migration
    session.ts       localStorage session, JWT expiry, the logout rule
    config.ts        env-driven settings (mock flag, timeout)
    endpoints.ts     the route table: path + method per call
  hooks/
    useCamera.ts     getUserMedia, torch, tap-to-focus, teardown
    useScanner.ts    the scan loop
  components/
    AuthGate.tsx     login screen or app — wraps App, from main.tsx
    LoginScreen.tsx  usuário + senha
    UserChip.tsx     "Usuário: Heitor · Atendente" + logout
    Dashboard.tsx    home: stats, history, actions
    ScannerView.tsx  full-screen camera + document guide
    ConfirmSheet.tsx photo-vs-digits confirmation
    EditProtocolDialog.tsx
    ResultsPanel.tsx
    ui/              shadcn/ui primitives
  mocks/
    scenario.ts      what the browser-facing mock does; the failure digits
    seed.ts          the sample history, so a first visit has something to run
server/              the API, and the server that serves the built app
  index.ts           boot: certificate, http|https, listen, the upstream banner
  app.ts             the Express app — the middleware ORDER lives here
  config.ts          .env, validated once; refuses to boot without UPSTREAM_URL
  api.routes.ts      the /api router, /api/health, and the terminal JSON 404
  auth/
    auth.routes.ts   POST /login
    auth.controller.ts
    auth.service.ts  POST {UPSTREAM}/usuario/login
    auth.dto.ts      ⚠ the login whitelist — see "The DTO boundary"
  protocolo/
    protocolo.routes.ts
    protocolo.controller.ts
    protocolo.service.ts   the three Mais Cidadão calls
    protocolo.dto.ts       ⚠ the protocol whitelist — id, numprotocolo, data
    protocolo.select.ts    picking one row out of a LIKE-style result set
  shared/
    upstream.ts      the ONE call to Mais Cidadão; status mapping; no logging
    mock-upstream.ts stands in for it — the DEFAULT, so nothing leaves by accident
    message.ts       readDetail() for upstream error bodies
    cert.ts          reads certs/ from Node (twin of plugins/dev-cert.ts)
    static.ts        dist/, cache headers, SPA fallback, /dev-ca.crt
docs/
  WINDOWS.md         setting up the deployment machine, step by step
  IPHONE.md          trusting the certificate on iOS, for the end user
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
Tesseract.js, Express 5.

---

## Scripts

| | |
| --- | --- |
| `pnpm start` | **build, then serve app + API on 4173** — what a phone connects to. Runs `tsc`/`vite`/`tsx` directly, so it needs neither pnpm nor npm to be the one driving |
| `pnpm server` | serve app + API without rebuilding first |
| `pnpm server:watch` | same, restarting on change, for working on `server/` |
| `pnpm dev` | LAN dev server over HTTPS on 5173, mock API included |
| `pnpm cert` | issue a dev certificate covering this machine's LAN address, so a phone can install the PWA |
| `pnpm build` | typecheck (app **and** `server/`) + production build |
| `pnpm server:http` | same as `pnpm server` with TLS off — `http://localhost:4173` is a secure context, so the service worker registers there |
| `pnpm preview` | serve the build over HTTPS on **4174** — 4173 belongs to `pnpm server` |
| `pnpm lint` | oxlint |
| `pnpm lock:npm` | regenerate `package-lock.json` from `package.json` |

Every one of these runs under npm too, as `npm run <name>` (`npm test` and
`npm install` need no `run`).

> `tsx`, which runs the server's TypeScript, is a **devDependency** while
> `pnpm server` needs it at runtime. That is fine on the machine this is
> operated from — which is the only place it runs — but it would break a
> `--prod` install.

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

**Mocking is on but real protocols were filed.** Not reachable by configuration
any more: every call is a same-origin relative path, so there is no host to point
at a live service. What decides now is *which process you started* — `pnpm dev`
mocks, `pnpm server` is real, and the server prints
`⚠ SUBMISSÕES REAIS → …` on every start. `curl -k https://localhost:4173/api/health`
answers the same question from anywhere on the network.

**Against a real host, everything fails with "sem ID".** Check, in order:
`pnpm server` is running; `UPSTREAM_URL` in `.env` is right (the boot banner
prints it); and you are logged in — an expired session shows as *Sessão expirada*
and stops the run on the first slip rather than the last.

**Every submission reports success but nothing was filed.** The `/api` router's
terminal 404 has been removed or shadowed, so unmatched API paths fall through to
the SPA fallback and answer `200` with `index.html`. Check with
`curl -k -i https://localhost:4173/api/nao-existe` — it must be a JSON 404. See
[The DTO boundary](#the-dto-boundary) and `server/api.routes.ts`.

**A phone shows a certificate warning that used to be gone.** The machine's LAN
IP changed; it is baked into the certificate's SAN when `pnpm cert` runs. Delete
`certs/dev-server.*` — **not** `certs/dev-ca.crt` — and re-run `pnpm cert`.
Reusing the CA means no phone has to be set up again.

**Everything 404s after I changed an HTTP method.** Express polices the verb,
unlike both mocks. Change it in [src/lib/endpoints.ts](src/lib/endpoints.ts) and
in [server/api.routes.ts](server/api.routes.ts) together, or the request falls
through to the `/api` router's terminal 404.

**The server says MODO SIMULADO when it should be filing for real.** The `.env`
was not read, or `MOCK_UPSTREAM` is not exactly `false`. Better this way round
than the other, but fix it before assuming anything was submitted — see
[docs/WINDOWS.md](docs/WINDOWS.md) § 6.

**No phone can reach the server, but `localhost` works.** On Windows, the
firewall blocks 4173 inbound by default and says nothing. See
[docs/WINDOWS.md](docs/WINDOWS.md) § 4.

**`openssl was not found` on Windows.** Install
[Git for Windows](https://git-scm.com/download/win); `pnpm cert` looks for the
openssl it bundles.

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
