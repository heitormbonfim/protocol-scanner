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
> | **Independent actions** | Select Protocolar, Protocolar AS, or both — [details](#the-as-rule) |
> | 🆔 **Nothing goes out without its id** | A run waits for the confirm-time lookups instead of failing the slips still resolving — [details](#nothing-is-submitted-without-its-id) |
> | 🔁 **Nothing is filed twice** | A filed protocol is remembered in a sticky flag, so no rerun, reload or abort can resend it — [details](#nothing-is-ever-filed-twice) |
> | 🚦 **The upstream is never guessed** | The server refuses to boot without an explicit `UPSTREAM_URL`, and says on every start where submissions go — [details](#configuration) |
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
- [Executáveis: copiar certificados e iniciar em HTTP](#executáveis-windows-e-linux)
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
                               │  ✓ Confirmar   [x] Protocolar AS
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
                                                              ticked independently
                                                              of the ordinary call
                               ▼
              Relatório — Sucesso / Falha, each row: número · ID · motivo
```

### The AS rule

**Protocolar** and **Protocolar AS** are independent checkboxes, both selected
by default for each new scan. Choose either action, both, or leave an existing
record out by clearing both. Selected requests run sequentially; AS does not
depend on ordinary protocol success. Successfully completed actions are never
resubmitted. Missing IDs fail only the requested actions.

Reports group each action by its submission timestamp in **America/Fortaleza**,
not by the scan or upstream opening date. Older results without a timestamp
appear under “Data não registrada”. The date filter also applies to CSV/copy.
Client names come from `Pessoa.nomecompleto`, persist in local history, and
appear in cards, search and exports. Use **Consultar** to retrieve a missing
name in an older record.

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

**Protocolar** and **Protocolar AS** both start checked for each new scan.
Uncheck either action independently before confirming or in the history card.

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
| **Leave one out of the run** | clear both action checkboxes |
| **Leave out / include everything** | the checkbox above the list |
| **Toggle AS** | *Protocolar AS* on the row |
| **Correct the number** | pencil icon, or tap the number on the confirm sheet |
| **Retry a failed ID lookup** | the refresh icon (only shown when it failed) |
| **Delete one** | the trash icon on the row |
| **Search** | the search field, matches client names or protocol digits |
| **Clear everything** | the trash button next to the search field, with a confirmation |

Clearing both actions leaves the record in history without sending it. The
bottom button counts records with selected, unfinished actions. Each successful
action is locked independently; the other can still be selected later.

Each row states where it stands, in plain terms:

| Badge | Meaning |
| --- | --- |
| **Protocolado** | filed successfully — it will never be sent again |
| **Protocolando…** | in flight right now |
| **Falha ao protocolar** | the submission failed; the reason is printed underneath |
| **AS protocolada** | the AS submission landed |
| **AS não enviada** | Legacy skipped AS result; can be retried independently |
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
npm install
npm run dev
```

Use Node.js 22.12+ and npm; package-lock.json is the dependency lockfile.

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
   `import.meta.env.PROD` ([src/main.tsx](src/main.tsx)), so `npm run dev` never
   registers a worker no matter how good the certificate is.

#### How the local certificate works

`npm run cert` issues **two** things, and the split is the whole trick:

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

- **Re-running `npm run cert` is cheap.** The CA is reused, so phones that already
  trust it need no attention; only the server certificate is reissued. Do it
  whenever your DHCP lease hands you a new address.
- **`certs/` is git-ignored, and must stay that way.** Anyone holding
  `dev-ca.key` can mint certificates that every phone you set up will trust
  silently.

#### Setting it up

Fix the first with `npm run cert`, which issues a certificate that actually covers
this machine's LAN address, signed by a local CA you install on the phone once:

```bash
npm run cert                # writes certs/ — CA + server certificate
npm start               # build, then serve app + API on 4173
```

In a second terminal, run `npm run cert:serve`. Then, **on the phone**, open
`http://<lan-ip>:8080/dev-ca.crt` in Safari and install it. This temporary HTTP
server serves only the public CA; the app and API stay on HTTPS. Allow the
onboarding port through the firewall for the local network only, and stop the
helper with Ctrl+C after setup. Use `npm run cert:serve -- 8081` if 8080 is busy.
You can also transfer `certs/dev-ca.crt` using AirDrop from a Mac. Never share
`.key` files or expose the app through router port forwarding or public tunnels.

Install and trust the CA:

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
> actually hit. Install the CA on Android too, for a trusted HTTPS connection.

Reload the app and it should offer **Install app**.

The server certificate is issued for **397 days** as a conservative renewal
interval (Apple’s 398-day public-root limit does not apply to manually installed
roots) and carries
`extendedKeyUsage=serverAuth`, which iOS 13+ requires of every TLS server
certificate.

While no certificate has been generated, the dev server falls back to
`basicSsl()` exactly as before, which remains fine for desktop work.

### Testing the PWA on a desktop

To exercise the worker without any certificate at all:

```bash
npm run build
npm run server:http      # http://localhost:4173
```

That serves the real build over **plain HTTP on localhost**, which browsers
treat as a secure context — so the service worker registers *and* the camera
still works. It is the same server as `npm run server`, with TLS off.

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

Copy [`.env.example`](.env.example) to `.env` and edit. **Two settings**, and
only the first is load-bearing.

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPSTREAM_URL` | — | **Required.** The Mais Cidadão service — scheme and host |
| `PORT` | `4173` | The one port serving the app *and* the API |

Neither is prefixed `VITE_`, and that is the mechanism rather than a
convention: that prefix is what makes a value reach the browser bundle, and the
address of a government service has no business being inlined into JavaScript a
phone downloads. `npm run build && grep -ri upstream dist/` returns nothing. See
[The DTO boundary](#the-dto-boundary).

`UPSTREAM_URL` has no default and the server **refuses to boot** without it.
There is no safe guess: a wrong one either fails everything or quietly points a
batch of real submissions somewhere nobody intended, and a submission has no
undo.

**Timeouts are not settings.** They live in code — `UPSTREAM_TIMEOUT_MS` in
[server/config.ts](server/config.ts) at 20s, `REQUEST_TIMEOUT_MS` in
[src/lib/api.ts](src/lib/api.ts) at 25s. What matters is the *ordering*: the
server must give up first, so the phone gets a definite 504 rather than timing
out on its own and never learning whether a submission landed. Two env vars
could be set inconsistently on one machine; two constants cannot.

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

The table above is [src/lib/endpoints.ts](src/lib/endpoints.ts), imported by
both consumers — the client ([src/lib/api.ts](src/lib/api.ts)) and the
server ([server/api.routes.ts](server/api.routes.ts)) — so the two cannot
disagree about where a call goes.

Note the id is always the **last** path segment (`/protocolar/<id>`, never
`/<id>/protocolar`), and `protocolar-as` is a sibling of `protocolar` rather
than a path beneath it, so neither can shadow the other however they are
matched.

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
Content-Type, attaches the token and applies the timeout.

> [server/api.routes.ts](server/api.routes.ts) has to change with it — Express
> polices the method, and a mismatch surfaces as the terminal `404` from the
> `/api` router rather than as anything more helpful.

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

Run `npm run test:data` to check the DTO boundary, independent submission
actions, persistence migration, report dates and CSV output. These tests use
mocked responses and never submit to the real service. The DTOs also remain
short enough to review in full.

That is what "by construction" buys. Each one names every field it emits:

```ts
return {
  id: String(p.id ?? ''),
  numprotocolo: String(p.numprotocolo ?? ''),
  data: String(p.data ?? ''),
  nomecompleto: typeof pessoa?.nomecompleto === 'string' ? pessoa.nomecompleto.trim() : '',
}
```

Nothing is spread, nothing is deleted, nothing is conditional. If a field is not
written there, it cannot come out — so checking the boundary is checking that
the object literal has four keys, which takes a glance rather than a test run.
Keep them that way, and this stays true.

The only check that needs a running server needs a real call, and therefore the
authorised machine. Do it there, once, when you first connect (it is step 6 of
[docs/WINDOWS.md](docs/WINDOWS.md)):

```bash
curl -k 'https://localhost:4173/api/protocolos?protocoloId=<15 digits>' \
  -H 'authorization: Bearer <token>'
```

That must print **exactly four keys**:

```json
{"id":"251474","numprotocolo":"202608260251474","data":"2026-08-26","nomecompleto":"Cliente de exemplo"}
```

If you see extra fields such as `cpf`, `sus`, `celular01`,
`Pessoa`, `Logradouro` or `pessoa_id`, the boundary is broken and a citizen's
record just reached a phone.

Widening the whitelist is a deliberate decision. Make it deliberately.

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
npm run cert          # once per machine, and again if its LAN IP changes
npm start         # build, then https://localhost:4173 and https://<lan-ip>:4173
```

### Every run is a real run

There is no mock. Whatever `UPSTREAM_URL` points at is what gets the
submissions, and a filed protocol cannot be taken back — so the server says
where they are going on every single start:

```
  ⚠  SUBMISSÕES REAIS → https://o-servico-real
     Cada protocolo enviado é definitivo. Não há desfazer.
```

`GET /api/health` answers the same question — `{"ok":true,"upstream":"…"}` — so
you can check it from a phone rather than by reading a terminal. And with no
`UPSTREAM_URL` at all the server **refuses to boot**, rather than defaulting to
something and hoping.

> **Running it somewhere that is not allowed to call the service.** Permission
> to reach Mais Cidadão belongs to a place and a person, not to whoever has this
> checked out. To bring the app up on a development machine without any risk of
> touching it, point `UPSTREAM_URL` at a host that does not exist:
>
> ```dotenv
> UPSTREAM_URL=https://nao-existe.invalid
> ```
>
> Everything runs — login screen, camera, scanning, history, the report — and
> every call fails cleanly with a `502`. No packets go anywhere near the real
> service, and there is no mode to accidentally leave switched off.

The full setup for the machine that *is* allowed is
**[docs/WINDOWS.md](docs/WINDOWS.md)**.

### Where the settings live

One `.env`, two entries, neither prefixed `VITE_` — so `UPSTREAM_URL` is never
inlined into anything a phone downloads. `npm run build && grep -ri upstream dist/`
returns nothing, and that is the property rather than a habit. Full table in
[Configuration](#configuration).

### Developing

Two terminals. The dev server has no API of its own, so the Express server has
to be up for anything past the login screen to work:

```bash
npm run server:watch      # terminal 1 — the API, restarting on change
npm run dev               # terminal 2 — https://localhost:5173, with HMR
```

[vite.config.ts](vite.config.ts) forwards `/api` to the server rather than
letting the browser call it directly, so there is still exactly one origin in
play — no CORS, and no second certificate to accept.

`npm run preview` serves on **4174**, not 4173 — 4173 belongs to `npm run server`,
which is what a phone connects to.

### On Windows

The deployment machine is Windows, and three things there are not the same:

- **Env-var prefixes do not work.** `HTTPS=false npm run server` means nothing in
  cmd or PowerShell, so the switch is a flag: `npm run server:http`.
- **openssl is not on PATH.** `npm run cert` looks inside Git for Windows, which
  bundles one, so installing Git is enough.
- **The firewall blocks port 4173 inbound by default**, silently — the server
  starts, localhost works, and no phone can connect. One `netsh` command fixes
  it.

All three are covered in [docs/WINDOWS.md](docs/WINDOWS.md), along with keeping
the server running across reboots.

### On a phone

The certificate has to be trusted first. Use a trusted CA on both Android and iPhone.
**iPhone needs a two-step install** that is easy to get
half-right — see **[docs/IPHONE.md](docs/IPHONE.md)**.

One thing that catches everyone: `npm run cert` bakes the machine's LAN IP into the
certificate's SAN at the moment it runs. Change network, or get a different
address from DHCP, and the certificate no longer matches:

```bash
rm certs/dev-server.*   # keep certs/dev-ca.crt — reusing it keeps phones trusting you
npm run cert
```

---

## Verifying a change

There is **no automated test suite and no mock.** Both were removed
deliberately: this is a small tool with one operator and one deployment, and
they were costing more in day-to-day friction than they returned.

What is left is running it and looking, which for a tool this size is honest
work rather than a shortcut. Do it before any deploy.

### Bringing it up without touching the real service

Point `UPSTREAM_URL` at a host that does not exist:

```dotenv
UPSTREAM_URL=https://nao-existe.invalid
```

Everything comes up — login screen, camera, aim box, scanning, history, editing,
the report — and every network call fails cleanly with a `502`. That covers most
of what a change touches, with no possibility of reaching a live government
service and no mode to accidentally leave switched off.

```bash
npm run server:watch      # terminal 1
npm run dev               # terminal 2 — https://localhost:5173
```

Or `npm start` for the built app on 4173, which is what a phone gets.

### Without paper, or without a phone

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
[public/mock-image.jpeg](public/mock-image.jpeg) — the same
WhatsApp-recompressed image the OCR figures were measured against.

**Or skip the camera entirely.** Everything after the scan — history, editing,
the queue, the AS rule, the report — is reachable by adding a record and
correcting its number with the pencil icon.

### The walkthrough

Worth doing once before a release, on a phone:

1. **Camera opens** over `https://<lan-ip>:4173`. On plain `http://` it must
   refuse with an explanation, not fail silently.
2. **Aim box** drags onto the `Protocolo Nº` field, will not leave the guide,
   and is still where you left it after a reload.
3. **A scan confirms** — phone vibrates, sheet shows the photo above the digits.
4. **The header names you** — *Usuário: …* with the right permission level.
5. **The history survives a reload.**
6. **Log out and back in** — the history is still there. Logging out clears the
   session and nothing else; wiping the history would make a half-finished stack
   re-file every slip.
7. **Turn the Wi-Fi off and reload** — the app comes back logged in, with the
   history, rather than at a login screen it cannot pass.

### On the authorised machine

Only there, and only after the above is clean. The full procedure is
[docs/WINDOWS.md](docs/WINDOWS.md). Three checks before anything else:

```bash
# 1. Is it pointed where you think? The banner says so on start; so does this.
curl -k https://localhost:4173/api/health

# 2. An unknown API route must be a JSON 404, not the HTML shell. This is what
#    stops a mistyped endpoint being reported as a filed protocol.
curl -k -i https://localhost:4173/api/nao-existe

# 3. On real data, only the four whitelisted fields may cross.
curl -k 'https://localhost:4173/api/protocolos?protocoloId=<15 digits>' \
  -H 'authorization: Bearer <token>'
```

Then file **one** protocol you are willing to send for real, and check the
report. There is no undo for a successful submission.

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
    message.ts       readDetail() for upstream error bodies
    cert.ts          reads certs/ from Node (twin of plugins/dev-cert.ts)
    static.ts        dist/, cache headers, SPA fallback, /dev-ca.crt
docs/
  WINDOWS.md         setting up the deployment machine, step by step
  IPHONE.md          trusting the certificate on iOS, for the end user
plugins/
  dev-cert.ts        loads the dev certificate, serves the CA at /dev-ca.crt
public/
  sw.js              service worker — offline shell, never caches the API
  manifest.webmanifest
  icon-*.png         PWA icons (generated from favicon.svg)
scripts/
  dev-cert.mjs       issues the local CA + LAN server certificate
certs/               generated by `npm run cert`, git-ignored — never commit
```

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix),
Tesseract.js, Express 5.

---

## Scripts

| | |
| --- | --- |
| `npm start` | **build, then serve app + API on 4173** — what a phone connects to |
| `npm run server` | serve app + API without rebuilding first |
| `npm run server:watch` | same, restarting on change, for working on `server/` |
| `npm run dev` | LAN dev server over HTTPS on 5173, proxying `/api` to `npm run server` |
| `npm run cert:serve` | temporarily serve only the public CA over HTTP on 8080 for phone setup |
| `npm run cert` | issue a dev certificate covering this machine's LAN address, so a phone can install the PWA |
| `npm run build` | typecheck (app **and** `server/`) + production build |
| `npm run server:http` | same as `npm run server` with TLS off — `http://localhost:4173` is a secure context, so the service worker registers there |
| `npm run preview` | serve the build over HTTPS on **4174** — 4173 belongs to `npm run server` |
| `npm run lint` | oxlint |
| `npm run package` | build standalone Linux x64 and Windows x64 servers in `release/` |
| `npm run package:linux` | build only Linux x64 |
| `npm run package:windows` | build only Windows x64 |

The source project uses npm. End users of the packaged executable need neither Node.js nor a package manager.

> `tsx`, which runs the server's TypeScript, is a **devDependency** while
> `npm run server` needs it at runtime. That is fine on the machine this is
> operated from — which is the only place it runs — but it would break a
> `--prod` install.

### Package manager

Use Node.js 22.12+ and npm. `package-lock.json` records dependencies. Run
`npm ci` for reproducible installs or `npm install <package>` to add dependencies.
There is no package-manager installation guard.


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

**Everything fails with "Bloqueado: … não é a origem do app".** Working as
intended, and it just stopped a request going somewhere unintended. A path in
[src/lib/endpoints.ts](src/lib/endpoints.ts) resolves off-origin — the realistic
slip is a protocol-relative `//host/x`, which looks like a path and is not.

**Everything fails with "sem ID".** Check, in order: `npm run server` is running
(the dev server has no API of its own and only proxies to it); `UPSTREAM_URL` in
`.env` is right — the boot banner prints it; and you are logged in, since an
expired session shows as *Sessão expirada* and stops the run on the first slip
rather than the last.

**Every submission reports success but nothing was filed.** The `/api` router's
terminal 404 has been removed or shadowed, so unmatched API paths fall through to
the SPA fallback and answer `200` with `index.html`. Check with
`curl -k -i https://localhost:4173/api/nao-existe` — it must be a JSON 404. See
[The DTO boundary](#the-dto-boundary) and `server/api.routes.ts`.

**A phone shows a certificate warning that used to be gone.** The machine's LAN
IP changed; it is baked into the certificate's SAN when `npm run cert` runs. Delete
`certs/dev-server.*` — **not** `certs/dev-ca.crt` — and re-run `npm run cert`.
Reusing the CA means no phone has to be set up again.

**Everything 404s after I changed an HTTP method.** Express polices the verb.
Change it in [src/lib/endpoints.ts](src/lib/endpoints.ts) and in
[server/api.routes.ts](server/api.routes.ts) together, or the request falls
through to the `/api` router's terminal 404.

**The server refuses to start: "UPSTREAM_URL não está definido".** Working as
intended — there is no safe default for where submissions go. Put it in `.env`.
To bring the app up somewhere that must *not* reach the real service, set it to
a host that does not exist (`https://nao-existe.invalid`): everything runs and
every call fails with a clean `502`.

**No phone can reach the server, but `localhost` works.** On Windows, the
firewall blocks 4173 inbound by default and says nothing. See
[docs/WINDOWS.md](docs/WINDOWS.md) § 4.

**`openssl was not found` on Windows.** Install
[Git for Windows](https://git-scm.com/download/win); `npm run cert` looks for the
openssl it bundles.

**npm installation fails.** Use Node.js 22.12+ and its bundled npm.
When migrating from pnpm, remove the old node_modules folder and run `npm ci`. For users who only
need to run the application, distribute the executable instead of the source.

**The phone adds a shortcut instead of installing the app.** The two causes are
the certificate and the build; see [Installing on a
phone](#installing-on-a-phone). Short version: run `npm run cert`, install
`http://<lan-ip>:8080/dev-ca.crt` on the phone while `npm run cert:serve` runs (on iOS also enable it under
Certificate Trust Settings), and serve a **production** build — `npm run dev` never
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

## Executáveis Windows e Linux

Use `npm run package` para gerar as duas versões, `npm run package:linux` ou `npm run package:windows` para uma plataforma. Os programas incluem o servidor, Node e frontend, abrem o navegador ao iniciar e leem o `.env` ao lado do executável. Veja [o guia de distribuição](docs/EXECUTABLES.md) para configuração e limitações.

### Ativar HTTPS apenas copiando a pasta `certs`

Se o computador já tem o executável, **não precisa baixar o projeto nem dar
`git pull`** para usar certificados existentes. O executável antigo já suporta
HTTPS quando encontra os arquivos no lugar certo.

1. Encerre o servidor que estiver aberto (Ctrl+C na janela dele).
2. Copie a pasta `certs` com os certificados válidos para **esse computador**
   para a mesma pasta do executável. Se já existir uma `certs`, faça backup
   antes de substituir: trocar a CA exige confiar novamente nos celulares.
3. Confira a estrutura abaixo. No Linux, o binário chama-se `protocol-scanner`,
   sem `.exe`; a posição de `certs/` é a mesma.
4. Inicie normalmente, **sem `--http`**, por `iniciar.cmd` no Windows ou
   `sh iniciar.sh` no Linux. A janela deve mostrar `https://...`.

```text
pasta-do-programa/
├── protocol-scanner.exe       # Linux: protocol-scanner
├── .env
├── iniciar.cmd               # Linux: iniciar.sh
└── certs/
    ├── dev-ca.crt
    ├── dev-ca.key
    ├── dev-server.crt
    └── dev-server.key
```

**O certificado precisa cobrir o IP local do computador onde o servidor roda.**
Copiar certificados de outra máquina com outro IP pode causar aviso de
certificado. O executável antigo não renova automaticamente: nesse caso,
peça ao responsável para gerar um certificado para o IP correto, usando a
mesma CA, ou substitua o binário pela versão nova.

A versão nova gera certificados quando eles não existem e renova o certificado
do servidor quando o IP muda ou a validade está terminando. Para renovar com a
mesma CA, precisa de `dev-ca.crt` e `dev-ca.key`. Preserve a pasta `certs` ao
atualizar. Essas funcionalidades exigem o **executável novo**, mas não exigem
Git, Node.js ou npm no computador que vai usá-lo.

Guarde os arquivos `.key` no computador do servidor, em local protegido.
**Nos celulares, instale somente `dev-ca.crt`.** No iPhone, também ative a
confiança em Ajustes → Geral → Sobre → Ajustes de Confiança de Certificado.
Se a CA é a mesma que o aparelho já confia, não precisa reinstalá-la.
Veja [o passo a passo do iPhone](docs/IPHONE.md).

### Windows: iniciar em HTTP com dois cliques

Crie um arquivo chamado **`iniciar-http.cmd`** na mesma pasta do executável,
com este conteúdo:

```bat
@echo off
cd /d "%~dp0"
"%~dp0protocol-scanner.exe" --http
pause
```

No Bloco de Notas, escolha **Salvar como → Tipo: Todos os arquivos**, para não
salvar como `iniciar-http.cmd.txt`. Depois, basta dar **dois cliques em
`iniciar-http.cmd`**. Mantenha a janela aberta enquanto usa o aplicativo.

Também pode iniciar pelo PowerShell, dentro da pasta:

```powershell
.\protocol-scanner.exe --http
```

### Linux: iniciar em HTTP

Abra um terminal na pasta do programa e execute:

```bash
sh iniciar.sh --http
```

Ou execute o binário diretamente:

```bash
chmod +x protocol-scanner
./protocol-scanner --http
```

Para deixar um iniciador pronto, crie **`iniciar-http.sh`** ao lado do
`iniciar.sh` distribuído com o programa:

```sh
#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
exec sh ./iniciar.sh --http
```

Dê permissão uma vez:

```bash
chmod +x iniciar-http.sh
```

Depois escolha **Executar como programa** no gerenciador de arquivos, ou rode
`sh iniciar-http.sh`. A execução com dois cliques depende do gerenciador e de
suas configurações; se abrir em um editor, use o terminal. O `iniciar.sh`
distribuído procura um terminal para manter o servidor visível.

### Qual endereço abrir?

Com `--http`, abra **`http://localhost:4173`** no próprio computador. Se mudou
`PORT` no `.env`, use a porta configurada. `--http` escolhe HTTP explicitamente;
não é necessário apagar os certificados e não há redirecionamento automático
entre HTTP e HTTPS.

**A câmera dos celulares não funciona por HTTP na rede local.** Para os
celulares, inicie sem `--http`, use `https://<IP-do-computador>:4173` e confie na
CA. O acesso por `http://localhost` é uma exceção de contexto seguro no próprio
computador; `localhost` no celular aponta para o celular, não para o servidor.

Encerre a instância anterior antes de mudar o modo. Para voltar ao HTTPS,
feche o servidor HTTP e abra `iniciar.cmd` ou `sh iniciar.sh` sem a flag.
