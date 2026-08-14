# Leitor de Protocolos

Reads the `Protocolo Nº:` field off paper slips with a phone camera, keeps a
history you can search and correct, then submits the whole batch one at a time
and reports exactly what succeeded and what failed.

Built for working through a physical stack: point, confirm, next.

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
              GET {LOOKUP_URL}?protocoloId=<num>  →  { id }
                    (in the background — scanning never waits)
                               ▼
                    saved to history { id, num }
                               │
                        …next slip…
                               ▼
                    Dashboard ──▶ "Protocolar todos"
                               ▼
              one at a time:  PUT {PROTOCOL_URL}/<id>
                              PUT {PROTOCOL_AS_URL}/<id>   ← only if AS was
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

---

## Using the app

### Dashboard

The home screen. Shows counters (total, a enviar, enviados, falhas), the full
scan history, and the two actions: **Escanear protocolos** and **Protocolar
todos**.

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

Tap the number itself to correct it before saving.

### History

Every scan is stored on the device. For each row you can:

| Action | How |
| --- | --- |
| **Correct the number** | pencil icon, or tap the number on the confirm sheet |
| **Toggle AS** | the checkbox on the row |
| **Retry a failed ID lookup** | the refresh icon (only shown when it failed) |
| **Delete one** | the trash icon on the row |
| **Search** | the search field, matches on digits |
| **Clear everything** | the trash button next to the search field, with a confirmation |

Correcting a number **discards its ID and looks it up again**, because the ID
belongs to the old number. Any previous submission result is cleared too, so a
corrected row never carries a result that belonged to different digits.

### Submitting

**Protocolar todos** walks the history one request at a time. Already-successful
records are skipped, so pressing it again only retries what is outstanding. The
progress bar shows position and the number in flight; **Parar** aborts.

The **Relatório** screen groups outcomes into Falha and Sucesso, each row
carrying número, ID and motivo, and offers **Copiar** / **CSV** plus **Tentar
novamente os que falharam**.

---

## Running it on your phone

```bash
pnpm install
pnpm dev
```

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

### Testing the PWA

**A service worker cannot register on the LAN dev server.** Browsers refuse to
register one on an origin with a certificate error, and the self-signed
certificate covers only localhost — the same constraint that keeps the mock API
in the dev server rather than in a worker. Registration is therefore limited to
production builds ( `import.meta.env.PROD` ), so nothing is even attempted in
dev.

To exercise it locally:

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

To verify a real install on the phone, the app has to be on an origin with a
**trusted** certificate — a proper deployment, or a tunnel such as `ngrok` or
Cloudflare Tunnel pointed at the dev server. The self-signed LAN address can
never install.

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
| `VITE_LOOKUP_URL` | `/api/protocols` | `?protocoloId=<num>` → `{ id }` |
| `VITE_PROTOCOL_URL` | `/api/protocols` | `/<id>` — ordinary protocol |
| `VITE_PROTOCOL_AS_URL` | `/api/protocols-as` | `/<id>` — AS protocol |
| `VITE_AUTH_TOKEN` | *(empty)* | Sent as `Authorization: Bearer <token>` |
| `VITE_REQUEST_TIMEOUT_MS` | `5000` | Per-request timeout |

All three URLs are independent. Relative paths resolve against the app's own
origin (what you want when routing through the Vite dev proxy); absolute
`https://` URLs work too if the service sends CORS headers.

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

---

## Wiring up the real API

1. Set `VITE_USE_MOCK=false`, the three URLs and `VITE_AUTH_TOKEN` in
   `.env.local`.
2. Uncomment the `server.proxy` block in [vite.config.ts](vite.config.ts) and
   point `target` at the real host. Proxying server-side avoids CORS.

Two things to check against the real service, both marked in
[src/lib/api.ts](src/lib/api.ts):

- **The ID field.** `readId` currently accepts `id`, `Id`, `ID`, `protocolId`,
  `idProtocolo`, or a bare string/number body. Narrow it once the real shape is
  known.
- **The methods.** The lookup is `GET`, both submissions are `PUT`; see
  [Methods](#methods) for switching one and giving it a body.

The bearer token needs nothing beyond the variable — it is attached to all three
requests already.

---

## Testing

Everything below is meant to be followed literally, start to finish, with no
prior knowledge of the codebase. Nothing here needs a real backend, a real
protocol number, or a phone unless a step says so.

### 1. The automated suite

```bash
pnpm install
pnpm test
```

Expect **171 passed**. That is the whole check — if it is green, the logic is
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
curl -k "https://localhost:5173/api/protocols?protocoloId=202601300217719"
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

1. Set `VITE_USE_MOCK=false`, the three URLs and `VITE_AUTH_TOKEN` in
   `.env.local`.
2. Start with **one** number you are willing to submit for real. There is no
   undo, and the AS rule means a successful protocol cannot be taken back.
3. Watch the Network tab for a `401` (token wrong or missing) or a CORS error
   (needs the proxy in [vite.config.ts](vite.config.ts)).

### 7. Writing a new test

Tests live next to what they cover, as `*.test.ts` / `*.test.tsx`. Two
conventions matter, and both exist because of bugs this project actually hit:

- **Register handlers with `http.all`, not `http.get`.** The verb for each call
  is a constant that changes; a handler pinned to `GET` silently stops matching
  and the request falls through to the default mock, which usually answers `200`
  — so the test keeps passing while asserting nothing. Pin verbs only in the
  dedicated **HTTP methods** block in `api.test.ts`.
- **Compare resolved URLs, not pathnames.** Endpoints may be configured as
  relative (`/api/protocols`) or absolute (`https://real.example/protocolo`).
  Both test files define an `endpoint()` helper that resolves a configured path
  the same way `api.ts` does; use it. And prefer an exact match over
  `startsWith` — the AS endpoint's path usually *begins with* the ordinary one's
  (`…/protocols` and `…/protocols-as`), so a prefix test cannot tell them apart.

---

## Test coverage

Vitest + Testing Library + MSW, 171 tests. Notable coverage:

- **`protocol.test.ts`** — extraction against *verbatim OCR output* captured
  from the reference photo, including the mangled `Nº`; label anchoring
  preferring the labelled number over other long numbers on the page.
- **`queue.test.ts`** — the AS rule: AS never precedes the ordinary protocol,
  never fires when it fails, never fires without an ID; strict one-at-a-time
  sequencing verified by counting concurrent in-flight requests.
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
    config.ts        env-driven URLs
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
public/
  sw.js              service worker — offline shell, never caches the API
  manifest.webmanifest
  icon-*.png         PWA icons (generated from favicon.svg)
scripts/
  only-pnpm.mjs      preinstall guard: blocks npm and yarn
```

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix),
Tesseract.js, MSW, Vitest.

---

## Scripts

| | |
| --- | --- |
| `pnpm dev` | LAN dev server over HTTPS |
| `pnpm build` | typecheck + production build |
| `pnpm preview` | serve the build over HTTPS, for LAN/phone testing |
| `pnpm preview:pwa` | serve the build over HTTP on localhost, where the service worker can register |
| `pnpm test` | run the test suite |
| `pnpm test:watch` / `pnpm test:ui` | watch mode / browser UI |
| `pnpm lint` | oxlint |

Dependencies are pinned to exact versions and `.npmrc` sets `frozen-lockfile`,
so an install reproduces the tree in [pnpm-lock.yaml](pnpm-lock.yaml) rather
than resolving something newer. Adding or upgrading a package therefore needs
`pnpm add <pkg>` (which updates both files) or an explicit
`pnpm install --no-frozen-lockfile`. **Use pnpm, not npm** — a `preinstall`
guard ([scripts/only-pnpm.mjs](scripts/only-pnpm.mjs)) blocks the others,
because only `pnpm-lock.yaml` is committed and npm would resolve its own
untested versions.

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
is not `false`, that the three URLs match what `plugins/mock-api.ts` was given,
and restart the dev server — `vite.config.ts` reads the env at startup, so
changes there need a restart, not just a reload.

**Against a real host, everything fails with "sem ID".** The lookup endpoint is
unreachable. Check `VITE_LOOKUP_URL` and that the proxy in `vite.config.ts` is
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

**`npm install` refuses to run.** Intended — use `pnpm install`. Only
`pnpm-lock.yaml` is committed; see [Scripts](#scripts).

**No install prompt / the service worker never registers.** Almost always the
certificate. A worker cannot register on an origin with a certificate error, so
the self-signed LAN address will never work — use `pnpm preview:pwa` on
localhost, or deploy behind a trusted certificate. Registration is also
production-only, so `pnpm dev` never registers one by design.

**An old version keeps loading after a deploy.** The worker activates on the
next full load; close the installed app and reopen it. If it persists, DevTools
→ Application → Service workers → *Unregister*, then reload. When you have
changed the caching rules themselves, bump `VERSION` in `public/sw.js`.
