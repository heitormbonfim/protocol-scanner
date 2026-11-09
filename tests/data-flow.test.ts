import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toProtocoloDto } from '../server/protocolo/protocolo.dto.ts'
import { lookupProtocolId } from '../src/lib/api.ts'
import {
  pendingRecords,
  recordOutcomes,
  runProtocolQueue,
} from '../src/lib/queue.ts'
import { groupOutcomes, reportDay, toCsv } from '../src/lib/report.ts'
import { loadRecords } from '../src/lib/storage.ts'
import type { ProtocolRecord } from '../src/types.ts'

const record = (patch: Partial<ProtocolRecord> = {}): ProtocolRecord => ({
  num: '202611090264198',
  id: '264198',
  nomecompleto: 'Cliente de teste',
  scannedAt: 1,
  source: 'manual',
  withProtocol: true,
  withAs: true,
  lookup: { status: 'ok' },
  protocol: { status: 'idle' },
  as: { status: 'idle' },
  ...patch,
})

test('independent action matrix, failures, no repeats, cancellation and missing IDs', async () => {
  const original = globalThis.fetch
  const calls: string[] = []
  let failOrdinary = false
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname
    calls.push(path)
    return Response.json(
      {},
      { status: failOrdinary && !path.includes('-as') ? 500 : 200 },
    )
  }
  try {
    for (const [ordinary, as, expected] of [
      [true, true, 2],
      [true, false, 1],
      [false, true, 1],
      [false, false, 0],
    ] as const) {
      calls.length = 0
      const rows = await runProtocolQueue([
        record({ withProtocol: ordinary, withAs: as }),
      ])
      assert.equal(calls.length, expected)
      assert.deepEqual(
        rows.map((r) => r.kind),
        [...(ordinary ? ['protocol'] : []), ...(as ? ['as'] : [])],
      )
    }
    calls.length = 0
    failOrdinary = true
    const independent = await runProtocolQueue([record()])
    assert.equal(independent.length, 2)
    assert.equal(independent[0].ok, false)
    assert.equal(independent[1].ok, true)
    failOrdinary = false
    calls.length = 0
    await runProtocolQueue([
      record({ protocoled: true, protocol: { status: 'idle' } }),
    ])
    assert.equal(calls.length, 1)
    assert.ok(calls[0].includes('-as'))
    assert.equal(
      pendingRecords([record({ protocoled: true, asProtocoled: true })]).length,
      0,
    )
    const controller = new AbortController()
    calls.length = 0
    await runProtocolQueue([record()], {
      signal: controller.signal,
      onOutcome: () => controller.abort(),
    })
    assert.equal(calls.length, 1)
    calls.length = 0
    const missing = await runProtocolQueue([
      record({ id: null, withProtocol: false }),
    ])
    assert.equal(calls.length, 0)
    assert.equal(missing.length, 1)
    assert.equal(missing[0].kind, 'as')
  } finally {
    globalThis.fetch = original
  }
})

test('DTO and client preserve the name and opening date, excluding unrelated personal fields', async () => {
  const dto = toProtocoloDto({
    id: 264198,
    numprotocolo: '202611090264198',
    data: '2026-11-09',
    Pessoa: {
      nomecompleto: '  Cliente de teste  ',
      cpf: 'private',
      celular01: 'private',
    },
  })
  assert.deepEqual(Object.keys(dto).sort(), [
    'data',
    'id',
    'nomecompleto',
    'numprotocolo',
  ])
  assert.equal(dto.nomecompleto, 'Cliente de teste')
  assert.equal(toProtocoloDto({ Pessoa: null }).nomecompleto, '')
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json(dto)
    assert.deepEqual(await lookupProtocolId(dto.numprotocolo), {
      ok: true,
      id: dto.id,
      nomecompleto: dto.nomecompleto,
      data: dto.data,
    })
    assert.equal((await lookupProtocolId('202611090000001')).ok, false)
  } finally {
    globalThis.fetch = original
  }
})

test('report uses each action date in Fortaleza, preserves results when unchecked, and exports names', () => {
  const before = Date.parse('2026-11-10T02:59:00Z')
  const after = Date.parse('2026-11-10T03:01:00Z')
  assert.equal(reportDay(before), '2026-11-09')
  assert.equal(reportDay(after), '2026-11-10')
  const rows = recordOutcomes(
    record({
      withAs: false,
      protocol: { status: 'success', at: before },
      as: { status: 'success', at: after },
    }),
  )
  assert.deepEqual(
    groupOutcomes(rows).map((g) => g.day),
    ['2026-11-10', '2026-11-09'],
  )
  assert.equal(reportDay(undefined), 'unknown')
  assert.match(toCsv(rows), /nomecompleto/)
  assert.match(toCsv(rows), /Cliente de teste/)
  assert.match(toCsv([{ ...rows[0], nomecompleto: '=danger' }]), /'=danger/)
})

test('saved history retains choices, names, timestamps and success flags; legacy exclusions stay excluded', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const old = record({ selected: false, withProtocol: undefined })
  const current = record({
    withProtocol: false,
    withAs: true,
    as: { status: 'success', at: 99 },
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => JSON.stringify([old, current]) },
  })
  try {
    const rows = loadRecords()
    assert.equal(rows[0].withProtocol, false)
    assert.equal(rows[0].withAs, false)
    assert.equal(rows[1].withProtocol, false)
    assert.equal(rows[1].withAs, true)
    assert.equal(rows[1].asProtocoled, true)
    assert.equal(rows[1].as.at, 99)
    assert.equal(rows[1].nomecompleto, 'Cliente de teste')
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
