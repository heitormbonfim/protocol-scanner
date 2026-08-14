import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'
import { Dashboard } from '@/components/Dashboard'
import { EditProtocolDialog } from '@/components/EditProtocolDialog'
import { ResultsPanel } from '@/components/ResultsPanel'
import { ScannerView } from '@/components/ScannerView'
import { useCamera } from '@/hooks/useCamera'
import { useScanner } from '@/hooks/useScanner'
import { lookupProtocolId } from '@/lib/api'
import { runProtocolQueue, type QueueProgress } from '@/lib/queue'
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
  const [records, setRecords] = useState<ProtocolRecord[]>(loadRecords)
  const [candidate, setCandidate] = useState<ScanCandidate | null>(null)
  const [editingNum, setEditingNum] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<QueueProgress | null>(null)
  const [toast, setToast] = useState<string | null>(null)
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
  /** Numbers with a lookup already in flight, so retries never double-fire. */
  const inFlightRef = useRef(new Set<string>())

  // Mirror of `records` for handlers that need the latest value without
  // becoming dependencies of every callback.
  const recordsRef = useRef(records)
  useEffect(() => {
    recordsRef.current = records
  })

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
      setRecords((current) =>
        current.map((record) => (record.num === num ? patch(record) : record)),
      )
    },
    [],
  )

  // ── Confirm-time lookup ───────────────────────────────────────────────────
  // Runs in the background: the record is already stored, so the user moves on
  // to the next page immediately instead of waiting on a round trip per slip.
  const runLookup = useCallback(
    async (num: string) => {
      if (inFlightRef.current.has(num)) return
      inFlightRef.current.add(num)

      updateRecord(num, (record) => ({ ...record, lookup: { status: 'pending' } }))

      const result = await lookupProtocolId(num)
      inFlightRef.current.delete(num)

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
    },
    [flash, updateRecord],
  )

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
      setRecords((current) => [
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
        },
        // Newest first: the row just scanned should be the one you can see.
        ...current,
      ])
      setDefaultWithAs(withAs)
      setSessionCount((count) => count + 1)
      setCandidate(null)
      void runLookup(num)
    },
    [candidate, runLookup],
  )

  // ── History editing ───────────────────────────────────────────────────────
  const handleSaveEdit = useCallback(
    (originalNum: string, nextNum: string) => {
      setRecords((current) =>
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
              }
            : record,
        ),
      )
      setEditingNum(null)
      void runLookup(nextNum)
    },
    [runLookup],
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

  const handleClearHistory = useCallback(() => {
    clearRecords()
    setRecords([])
    setProgress(null)
    setView('dashboard')
  }, [])

  // ── Protocol run ──────────────────────────────────────────────────────────
  const runQueue = useCallback(
    async (batch: ProtocolRecord[]) => {
      const controller = new AbortController()
      abortRef.current = controller
      setRunning(true)

      await runProtocolQueue(batch, {
        signal: controller.signal,
        onProgress: (next) => {
          setProgress(next)
          if (next.current) {
            setRecords((current) =>
              current.map((record) =>
                record.num === next.current
                  ? { ...record, protocol: { status: 'running' } }
                  : record,
              ),
            )
          }
        },
        onOutcome: (outcome) => {
          setRecords((current) =>
            current.map((record) => {
              if (record.num !== outcome.num) return record
              const step: StepState = {
                status: outcome.ok ? 'success' : 'failed',
                reason: outcome.reason,
                at: Date.now(),
              }
              return outcome.kind === 'as'
                ? { ...record, as: step }
                : { ...record, protocol: step }
            }),
          )
        },
      })

      abortRef.current = null
      setRunning(false)
      setProgress(null)
      setView('results')
    },
    [],
  )

  const handleProtocolAll = useCallback(() => {
    void runQueue(recordsRef.current)
  }, [runQueue])

  const handleRetryFailed = useCallback(() => {
    const reset = recordsRef.current.map((record) => ({
      ...record,
      protocol: record.protocol.status === 'failed' ? IDLE_STEP : record.protocol,
      as:
        record.as.status === 'failed' || record.as.status === 'skipped'
          ? IDLE_STEP
          : record.as,
    }))
    setRecords(reset)
    recordsRef.current = reset
    setView('dashboard')
    void runQueue(reset)
  }, [runQueue])

  const duplicate =
    candidate !== null && records.some((record) => record.num === candidate.num)
  const editingRecord = records.find((record) => record.num === editingNum) ?? null

  return (
    <>
      {view === 'dashboard' ? (
        <Dashboard
          records={records}
          running={running}
          progress={progress}
          onOpenScanner={openScanner}
          onEdit={setEditingNum}
          onToggleAs={handleToggleAs}
          onRetryLookup={(num) => void runLookup(num)}
          onDelete={(num) =>
            setRecords((current) => current.filter((record) => record.num !== num))
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
