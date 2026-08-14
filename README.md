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
- [Configuration](#configuration)
- [Wiring up the real API](#wiring-up-the-real-api)
- [Testing](#testing)
- [How accurate is the OCR?](#how-accurate-is-the-ocr)
- [Project layout](#project-layout)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)

---

## How it works

```text
Dashboard ──▶ Escanear ──▶ camera scans continuously
                               │
                        several frames agree
                               ▼
                        CONFIRM SHEET  (photo + digits side by side)
                               │  ✓ Confirmar   [ ] Protocolar também AS
                               ▼
              GET {LOOKUP_URL}?numprotocol=<num>  →  { id }
                    (in the background — scanning never waits)
                               ▼
                    saved to history { id, num }
                               │
                        …next slip…
                               ▼
                    Dashboard ──▶ "Protocolar todos"
                               ▼
              one at a time:  GET {PROTOCOL_URL}/<id>
                              GET {PROTOCOL_AS_URL}/<id>   ← only if AS was
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

When enough frames agree, the phone vibrates and the confirm sheet appears with
the **photo above the digits**. Check they match, tick AS if this slip needs it,
and confirm. The AS choice sticks for the next slip, so a run of AS pages does
not need re-ticking.

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

## Configuration

Copy [`.env.example`](.env.example) to `.env.local` and edit. Vite only exposes
`VITE_`-prefixed variables and **inlines them at build time**, so rebuild after
changing any of them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_USE_MOCK` | `true` | Serve the mock API from the dev server |
| `VITE_LOOKUP_URL` | `/api/protocols` | `GET ?numprotocol=<num>` → `{ id }` |
| `VITE_PROTOCOL_URL` | `/api/protocols` | `GET /<id>` — ordinary protocol |
| `VITE_PROTOCOL_AS_URL` | `/api/protocols-as` | `GET /<id>` — AS protocol |
| `VITE_REQUEST_TIMEOUT_MS` | `15000` | Per-request timeout |

All three URLs are independent. Relative paths resolve against the app's own
origin (what you want when routing through the Vite dev proxy); absolute
`https://` URLs work too if the service sends CORS headers.

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

1. Set `VITE_USE_MOCK=false` and the three URLs in `.env.local`.
2. Uncomment the `server.proxy` block in [vite.config.ts](vite.config.ts) and
   point `target` at the real host. Proxying server-side avoids CORS.

Two things to check against the real service, both marked in
[src/lib/api.ts](src/lib/api.ts):

- **The ID field.** `readId` currently accepts `id`, `Id`, `ID`, `protocolId`,
  `idProtocolo`, or a bare string/number body. Narrow it once the real shape is
  known.
- **Auth.** None of the three requests send credentials yet.

---

## Testing

```bash
pnpm test         # once
pnpm test:watch   # watch mode
pnpm test:ui      # browser UI
```

Vitest + Testing Library + MSW, 127 tests. Notable coverage:

- **`protocol.test.ts`** — extraction against *verbatim OCR output* captured
  from the reference photo, including the mangled `Nº`; label anchoring
  preferring the labelled number over other long numbers on the page.
- **`queue.test.ts`** — the AS rule: AS never precedes the ordinary protocol,
  never fires when it fails, never fires without an ID; strict one-at-a-time
  sequencing verified by counting concurrent in-flight requests.
- **`preprocess.test.ts`** — the `object-fit: cover` coordinate mapping, and a
  guard that the scan region stays large (a regression here silently reproduces
  the focus-blur bug).
- **`api.test.ts`** — ID field variants, error mapping, URL construction.
- **`storage.test.ts`** — migration of records written by older versions.
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
    preprocess.ts    ROI → intrinsic-pixel mapping, crop, scale
    ocr.ts           Tesseract worker lifecycle
    consensus.ts     multi-frame voting (the misread defence)
    api.ts           the three GET calls
    queue.ts         sequential run + the AS rule
    storage.ts       localStorage history + migration
    config.ts        env-driven URLs
  hooks/
    useCamera.ts     getUserMedia, torch, teardown
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
plugins/
  mock-api.ts        serves the mock API from the dev server
```

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix),
Tesseract.js, MSW, Vitest.

---

## Scripts

| | |
| --- | --- |
| `pnpm dev` | LAN dev server over HTTPS |
| `pnpm build` | typecheck + production build |
| `pnpm test` | run the test suite |
| `pnpm test:watch` / `pnpm test:ui` | watch mode / browser UI |
| `pnpm lint` | oxlint |

---

## Troubleshooting

**The camera will not open.** Check the address is `https://`. On plain HTTP the
browser blocks `getUserMedia` entirely. If Android Chrome refuses the
self-signed certificate, add the origin to
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

**It never finds a number.** Get the whole slip in the guide and hold steady for
a couple of seconds — do not move closer. Use the torch button in dim light. A
frame takes about a second, and three need to agree.

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
