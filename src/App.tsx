import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { Dashboard } from '@/components/Dashboard'
import { EditProtocolDialog } from '@/components/EditProtocolDialog'
import { ResultsPanel } from '@/components/ResultsPanel'
import { ScannerView } from '@/components/ScannerView'
import { useCamera } from '@/hooks/useCamera'
import { useScanner } from '@/hooks/useScanner'
import { lookupProtocolId } from '@/lib/api'
import { USE_MOCK } from '@/lib/config'
import {
  pendingRecords,
  runProtocolQueue,
  type QueueProgress,
} from '@/lib/queue'
import { seedMockRecords } from '@/mocks/seed'
import {
  clearRecords,
  loadFieldRoi,
  loadRecords,
  saveFieldRoi,
  saveRecords,
} from '@/lib/storage'
import type { Roi } from '@/lib/preprocess'
import type { ProtocolRecord, ScanCandidate, StepState, View } from '@/types'

const IDLE_STEP: StepState = { status: 'idle' }

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [scannerOpen, setScannerOpen] = useState(false)
  /*
   * With mocking on, start from a sample history rather than an empty one, so
   * the queue and the report can be exercised without a camera or paper. Seeded
   * once per browser and never while mocking is off — see mocks/seed.ts.
   */
  const [records, setRecords] = useState<ProtocolRecord[]>(() => {
    const stored = loadRecords()
    return USE_MOCK ? seedMockRecords(stored) : stored
  })
  const [candidate, setCandidate] = useState<ScanCandidate | null>(null)
  const [editingNum, setEditingNum] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<QueueProgress | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  /** Slips confirmed since the camera was opened, shown on the scanner. */
  const [sessionCount, setSessionCount] = useState(0)
  /**
   * Sticky AS choice, so a run of AS slips does not need re-ticking each page.
   * Starts **on**: most slips are protocolled alongside AS, so the common case
   * should be the one that needs no tap. Unticking it sticks just the same.
   */
  const [defaultWithAs, setDefaultWithAs] = useState(true)
  /** The aim box, kept across sessions: a form is lined up with once. */
  const [fieldRoi, setFieldRoi] = useState<Roi>(loadFieldRoi)

  const camera = useCamera()
  const abortRef = useRef<AbortController | null>(null)
  /**
   * Lookups in flight, by number, so retries never double-fire — and so a run
   * can wait for them. See `settleLookups`.
   */
  const inFlightRef = useRef(new Map<string, Promise<void>>())

  /**
   * `records` as they are *now*, for handlers that need the latest value
   * without becoming dependencies of every callback.
   *
   * Written synchronously by `commitRecords` rather than mirrored from an
   * effect. An effect mirror is one render behind, which is invisible until a
   * handler awaits something and then reads it — exactly what the protocol run
   * does after waiting for lookups.
   */
  const recordsRef = useRef(records)

  /** The single writer for `records`: keeps state and ref in step. */
  const commitRecords = useCallback(
    (update: (records: ProtocolRecord[]) => ProtocolRecord[]) => {
      const next = update(recordsRef.current)
      recordsRef.current = next
      setRecords(next)
    },
    [],
  )

  useEffect(() => saveRecords(records), [records])
  useEffect(() => saveFieldRoi(fieldRoi), [fieldRoi])

  const flash = useCallback((message: string) => {
    setToast(message)
    setTimeout(
      () => setToast((current) => (current === message ? null : current)),
      3500,
    )
  }, [])

  const updateRecord = useCallback(
    (num: string, patch: (record: ProtocolRecord) => ProtocolRecord) => {
      commitRecords((current) =>
        current.map((record) => (record.num === num ? patch(record) : record)),
      )
    },
    [commitRecords],
  )

  // ── Confirm-time lookup ───────────────────────────────────────────────────
  // Runs in the background: the record is already stored, so the user moves on
  // to the next page immediately instead of waiting on a round trip per slip.
  const runLookup = useCallback(
    (num: string): Promise<void> => {
      const existing = inFlightRef.current.get(num)
      if (existing) return existing

      const attempt = (async () => {
        updateRecord(num, (record) => ({
          ...record,
          lookup: { status: 'pending' },
        }))

        const result = await lookupProtocolId(num)

        if (result.ok) {
          updateRecord(num, (record) => ({
            ...record,
            id: result.id,
            lookup: { status: 'ok' },
          }))
        } else {
          updateRecord(num, (record) => ({
            ...record,
            id: null,
            lookup: { status: 'failed', reason: result.reason },
          }))
          flash(`Sem ID para ${num} — ${result.reason}`)
        }
      })()

      // Swallowed and always cleared: callers fire this with `void`, and a
      // lookup left in the map would stall every later run for its full
      // timeout.
      const tracked = attempt
        .catch(() => undefined)
        .finally(() => {
          inFlightRef.current.delete(num)
        })

      inFlightRef.current.set(num, tracked)
      return tracked
    },
    [flash, updateRecord],
  )

  /**
   * Every id asked for, and nothing left on the wire.
   *
   * A record with no id is reported as "Sem ID" rather than submitted, so a run
   * must not start while a lookup is still out. That is the ordinary case, not
   * an edge one: "Protocolar" straight from the scanner is how a stack is
   * meant to be finished, and the slip confirmed a second ago is still being
   * looked up.
   */
  const settleLookups = useCallback(async () => {
    // A record can sit `pending` with nothing in flight — the tab was closed
    // mid-lookup and this state came back from storage. Ask again, or it would
    // report "Sem ID" forever.
    for (const record of recordsRef.current) {
      if (!record.id && record.lookup.status === 'pending') void runLookup(record.num)
    }

    // A loop, because the sweep above may have started new ones.
    while (inFlightRef.current.size > 0) {
      await Promise.allSettled([...inFlightRef.current.values()])
    }
  }, [runLookup])

  const handleCandidate = useCallback((found: ScanCandidate) => {
    navigator.vibrate?.(60)
    setCandidate(found)
  }, [])

  const scanner = useScanner({
    videoRef: camera.videoRef,
    // Only the aim box is read, not the whole guide: a slip carries several
    // "Protocolo" labels and position is what tells them apart.
    roi: fieldRoi,
    enabled: scannerOpen && camera.status === 'active' && !candidate,
    onCandidate: handleCandidate,
  })

  // ── Scanner lifecycle ─────────────────────────────────────────────────────
  const openScanner = useCallback(() => {
    setSessionCount(0)
    setScannerOpen(true)
  }, [])

  const closeScanner = useCallback(() => {
    camera.stop()
    setCandidate(null)
    setScannerOpen(false)
    // Sweep up anything whose id never arrived while scanning.
    for (const record of recordsRef.current) {
      if (!record.id && record.lookup.status === 'failed') void runLookup(record.num)
    }
  }, [camera, runLookup])

  const handleConfirm = useCallback(
    (num: string, withAs: boolean, edited: boolean) => {
      commitRecords((current) => [
        {
          num,
          id: null,
          scannedAt: Date.now(),
          editedAt: edited ? Date.now() : undefined,
          source: edited ? 'manual' : (candidate?.source ?? 'manual'),
          withAs,
          lookup: { status: 'pending' },
          protocol: IDLE_STEP,
          as: IDLE_STEP,
          protocoled: false,
          asProtocoled: false,
        },
        // Newest first: the row just scanned should be the one you can see.
        ...current,
      ])
      setDefaultWithAs(withAs)
      setSessionCount((count) => count + 1)
      // The camera stays up: the point of the app is working through a stack,
      // and closing it after every slip would mean reopening and re-warming the
      // camera for each page. Protocolling is still never offered here — the
      // dashboard behind is inert, and the scanner's own button closes the
      // camera before a run starts.
      setCandidate(null)
      void runLookup(num)
    },
    [candidate, commitRecords, runLookup],
  )

  // ── History editing ───────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(
    (originalNum: string, nextNum: string) => {
      commitRecords((current) =>
        current.map((record) =>
          record.num === originalNum
            ? {
                ...record,
                num: nextNum,
                // The id belongs to the old number, so it must be discarded and
                // looked up again rather than carried across.
                id: null,
                editedAt: Date.now(),
                source: 'manual',
                lookup: { status: 'pending' },
                protocol: IDLE_STEP,
                as: IDLE_STEP,
                // The only place these are cleared: a corrected number means a
                // different id, so whatever was filed was filed for something
                // else and this record has not been protocolled at all.
                protocoled: false,
                asProtocoled: false,
              }
            : record,
        ),
      )
      setEditingNum(null)
      void runLookup(nextNum)
    },
    [commitRecords, runLookup],
  )

  const handleToggleAs = useCallback(
    (num: string) => {
      updateRecord(num, (record) => ({
        ...record,
        withAs: !record.withAs,
        // Clear any stale AS result so the row does not claim an outcome for a
        // submission that is no longer part of the plan.
        as: IDLE_STEP,
      }))
    },
    [updateRecord],
  )

  const handleToggleSelected = useCallback(
    (num: string) => {
      updateRecord(num, (record) => ({
        ...record,
        selected: record.selected === false,
      }))
    },
    [updateRecord],
  )

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      commitRecords((current) =>
        current.map((record) => ({ ...record, selected })),
      )
    },
    [commitRecords],
  )

  const handleClearHistory = useCallback(() => {
    clearRecords()
    commitRecords(() => [])
    setProgress(null)
    setView('dashboard')
  }, [commitRecords])

  // ── Protocol run ──────────────────────────────────────────────────────────
  const runQueue = useCallback(
    async (requested: ProtocolRecord[]) => {
      const controller = new AbortController()
      abortRef.current = controller
      setRunning(true)

      /*
       * Resolve the ids first.
       *
       * Without this, finishing a stack from the scanner failed the slips that
       * had just been scanned: their lookups were still on the wire, so they
       * had no id yet and `runRecord` reported "Sem ID — busca não concluída"
       * for a record that was perfectly fine. Waiting costs at most one request
       * timeout, and only when something is actually outstanding.
       */
      let batch = requested
      const awaitingId = batch.some(
        (record) => !record.id && record.lookup.status === 'pending',
      )

      if (inFlightRef.current.size > 0 || awaitingId) {
        // Show the dock as busy immediately: the wait is a real pause, and
        // leaving the buttons up invites a second tap.
        setProgress({
          done: 0,
          total: pendingRecords(batch).length,
          current: null,
        })
        await settleLookups()
        // The ids landed on `recordsRef` while we waited.
        batch = recordsRef.current
      }

      if (controller.signal.aborted) {
        abortRef.current = null
        setRunning(false)
        setProgress(null)
        return
      }

      await runProtocolQueue(batch, {
        signal: controller.signal,
        onProgress: (next) => {
          setProgress(next)
          if (next.current) {
            commitRecords((current) =>
              current.map((record) =>
                // Never over an already-filed protocol: a record queued only
                // for its pending AS would have its `success` replaced by a
                // `running` that nothing settles, and the next run would file
                // the protocol a second time.
                record.num === next.current && record.protocoled !== true
                  ? { ...record, protocol: { status: 'running' } }
                  : record,
              ),
            )
          }
        },
        onOutcome: (outcome) => {
          commitRecords((current) =>
            current.map((record) => {
              if (record.num !== outcome.num) return record
              const step: StepState = {
                status: outcome.ok ? 'success' : 'failed',
                reason: outcome.reason,
                at: Date.now(),
              }
              // `protocoled` only ever goes from false to true here — it is the
              // durable record that something was actually filed.
              return outcome.kind === 'as'
                ? {
                    ...record,
                    as: step,
                    asProtocoled: record.asProtocoled === true || outcome.ok,
                  }
                : {
                    ...record,
                    protocol: step,
                    protocoled: record.protocoled === true || outcome.ok,
                  }
            }),
          )
        },
      })

      abortRef.current = null
      setRunning(false)
      setProgress(null)
      setView('results')
    },
    [commitRecords, settleLookups],
  )

  const handleProtocolAll = useCallback(() => {
    void runQueue(recordsRef.current)
  }, [runQueue])

  /**
   * Finish scanning and send, in one tap.
   *
   * The camera is closed *first*, deliberately. A run started with the scanner
   * still up would leave the phone pointed at paper while submissions go out
   * behind an opaque overlay — no progress bar, no Parar, no idea whether it
   * worked. Closing first puts the dashboard in front of you before the first
   * request leaves.
   */
  const handleProtocolFromScanner = useCallback(() => {
    closeScanner()
    handleProtocolAll()
  }, [closeScanner, handleProtocolAll])

  const handleRetryFailed = useCallback(() => {
    const reset = recordsRef.current.map((record) => ({
      ...record,
      protocol: record.protocol.status === 'failed' ? IDLE_STEP : record.protocol,
      as:
        record.as.status === 'failed' || record.as.status === 'skipped'
          ? IDLE_STEP
          : record.as,
    }))
    commitRecords(() => reset)
    setView('dashboard')
    void runQueue(reset)
  }, [commitRecords, runQueue])

  const duplicate =
    candidate !== null && records.some((record) => record.num === candidate.num)
  const editingRecord = records.find((record) => record.num === editingNum) ?? null

  return (
    <>
      {/*
        Inert while the camera is up. The scanner covers the screen, so this is
        not about what you can see — it is about the dashboard's controls still
        being reachable by keyboard and by assistive tech underneath it.
        "Protocolar" must not be pressable while scanning.
      */}
      <div inert={scannerOpen || undefined}>
        {view === 'dashboard' ? (
          <Dashboard
            records={records}
            running={running}
            progress={progress}
            onOpenScanner={openScanner}
            onEdit={setEditingNum}
            onToggleAs={handleToggleAs}
            onToggleSelected={handleToggleSelected}
            onSelectAll={handleSelectAll}
            onRetryLookup={(num) => void runLookup(num)}
            onDelete={(num) =>
              commitRecords((current) =>
                current.filter((record) => record.num !== num),
              )
            }
            onClearHistory={handleClearHistory}
            onProtocolAll={handleProtocolAll}
            onAbort={() => abortRef.current?.abort()}
            onViewResults={() => setView('results')}
          />
        ) : (
          <ResultsPanel
            records={records}
            onRetryFailed={handleRetryFailed}
            onBack={() => setView('dashboard')}
          />
        )}
      </div>

      {scannerOpen && (
        <ScannerView
          videoRef={camera.videoRef}
          cameraStatus={camera.status}
          cameraError={camera.error}
          torchOn={camera.torchOn}
          torchSupported={camera.torchSupported}
          focusSupported={camera.focusSupported}
          fieldRoi={fieldRoi}
          onStart={() => void camera.start()}
          onToggleTorch={() => void camera.toggleTorch()}
          onFocusAt={(point) => void camera.focusAt(point)}
          onFieldRoiChange={setFieldRoi}
          ocrReady={scanner.ready}
          scannerError={scanner.error}
          agreement={scanner.agreement}
          required={scanner.required}
          source={scanner.source}
          paused={candidate !== null}
          scannedThisSession={sessionCount}
          pendingCount={pendingRecords(records).length}
          onProtocol={handleProtocolFromScanner}
          onClose={closeScanner}
        />
      )}

      {candidate && (
        <ConfirmSheet
          candidate={candidate}
          duplicate={duplicate}
          defaultWithAs={defaultWithAs}
          onConfirm={handleConfirm}
          onDiscard={() => setCandidate(null)}
        />
      )}

      <EditProtocolDialog
        record={editingRecord}
        takenNumbers={records
          .filter((record) => record.num !== editingNum)
          .map((record) => record.num)}
        onSave={handleSaveEdit}
        onClose={() => setEditingNum(null)}
      />

      {toast && (
        <div className="pb-safe fixed inset-x-4 bottom-24 z-60 rounded-xl border border-border bg-card p-3 text-sm shadow-2xl">
          {toast}
        </div>
      )}
    </>
  )
}
