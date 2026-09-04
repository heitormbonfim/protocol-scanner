import {
  AS_FAILS_ON,
  LOOKUP_FAILS_ON,
  MOCK_TOKEN,
  MOCK_USER,
  PROTOCOL_FAILS_ON,
} from "../../src/mocks/scenario.ts";
import type { UpstreamResult } from "./upstream.ts";

/**
 * A stand-in for the Mais Cidadão service, so the whole stack can be run
 * without touching it.
 *
 * ## Why this exists
 *
 * The real service is a live government system, and permission to call it is
 * tied to a place and a person — not to whoever has the repository checked out.
 * Development happens on one machine and deployment on another, and only the
 * second is authorised. Without this, "run the server and see if it works"
 * means filing real protocols against real citizens' records, and a submission
 * has no undo.
 *
 * So this is the **default**. `MOCK_UPSTREAM=false` is a deliberate act,
 * performed once, on the machine that is allowed to do it. See server/config.ts.
 *
 * ## What it answers with
 *
 * Upstream-shaped payloads, not our DTOs — including a fake CPF, SUS card,
 * phone number and address. That is the point: the response then travels the
 * real path through `selecionarProtocolo` and `toProtocoloDto`, so running
 * mocked actually exercises the boundary that keeps that data off the phone.
 * Curl the API in this mode and you can watch it get stripped.
 *
 * The names and numbers below are invented. No real person's data belongs in a
 * source file.
 *
 * ## Behaviour
 *
 * Keyed on the **last two digits** of the protocol number, the same convention
 * the browser mock uses (the digits are imported from it, so they cannot
 * drift):
 *
 * | ends in | behaviour                                          |
 * | ------- | -------------------------------------------------- |
 * | `97`    | lookup fails (503)                                  |
 * | `98`    | ordinary protocol fails (409)                       |
 * | `99`    | ordinary protocol succeeds, AS fails (422)          |
 * | other   | everything succeeds                                 |
 */

/** Latency, so spinners and progress bars behave like the real thing. */
const DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The id out of `/protocolo/protocolaragendamento(as)/<id>`. */
const lastSegment = (path: string) => decodeURIComponent(path.split("/").pop() ?? "");

/**
 * Invented. Mirrors the real response's shape, field for field.
 *
 * The id is derived from the number's last six digits, so a slip's id keeps its
 * final two — which is what lets the failure convention survive the lookup and
 * still apply to the two submissions.
 */
function protocoloRow(num: string) {
  return {
    id: Number(num.slice(-6)),
    pessoa_id: 99999,
    servico_id: 1125,
    status_id: 1,
    entidade_id: 1,
    data: "2026-08-26",
    data_previsao: "2026-08-26",
    datahora_protocolo_resultado: null,
    datahora_protocolo_resultado_as: null,
    detalhamento_solicitacao: ".",
    urgencia: "Não Urgente",
    created_user: 14,
    updated_user: 14,
    // Everything below must be stripped by toProtocoloDto. It is here so that
    // running mocked proves it, rather than assuming it.
    Pessoa: {
      id: 99999,
      nomecompleto: "FULANA DE TAL DA SILVA",
      nomesocial: "FULANA",
      cpf: "00000000000",
      sus: "000.0000.0000.0000",
      celular01: "(88)90000-0000",
      Logradouro: {
        id: 1,
        nome: "RUA INVENTADA",
        cep: "00000-000",
        Bairro: { id: 1, nome: "BAIRRO INVENTADO", Distrito: { id: 1, nome: "DISTRITO" } },
      },
    },
    Status: { id: 1, status: "ABERTO" },
    Servico: { id: 1125, descricao: "EXAME - TESTE DA ORELHINHA [G]", detalhamento: null },
    numprotocolo: num,
  };
}

/**
 * Answer one upstream call.
 *
 * Routes on the upstream path, which is what `callUpstream` was handed — so
 * this sits behind the same single chokepoint the real calls go through, and
 * nothing above it knows which mode it is in.
 */
export async function mockUpstream(
  method: string,
  path: string,
  query?: Record<string, string>,
): Promise<UpstreamResult> {
  await sleep(DELAY_MS);

  // POST /usuario/login
  if (path === "/usuario/login") {
    return {
      ok: true,
      body: {
        id: 36,
        nome: MOCK_USER.nome,
        sobrenome: "Mock",
        email: "mock",
        status: "ATIVO",
        token: MOCK_TOKEN,
        nivel_permissao: MOCK_USER.nivel_permissao,
        usuariogrupoid: 3,
        permissoes: ["PROTOCOLO_VISUALIZAR", "PROTOCOLO_CRIAR", "PROTOCOLO_GERENCIAR"],
        entidades: [{ id: 1, nome: "MAIS CIDADAO (MOCK)" }],
      },
    };
  }

  // GET /protocolo?protocoloId=<num> — answers with a LIST, like the real one
  if (path === "/protocolo") {
    const num = query?.protocoloId ?? "";
    if (num.endsWith(LOOKUP_FAILS_ON)) {
      return { ok: false, status: 502, message: "Mock: serviço indisponível" };
    }
    return { ok: true, body: [protocoloRow(num)] };
  }

  /*
   * The two submissions.
   *
   * Addressed by id, so the mock has no way to know the 15-digit number and
   * echoes the id into `numprotocolo` rather than inventing one — the real
   * service returns the whole protocol object here, but a plausible-looking
   * wrong number would be worse than an obviously partial one. The client only
   * requires the body to be an object; it reads nothing out of it.
   *
   * AS is checked FIRST, because the ordinary path below is a prefix of it.
   */
  if (path.startsWith("/protocolo/protocolaragendamentoas/")) {
    const id = lastSegment(path);
    if (id.endsWith(AS_FAILS_ON)) {
      return { ok: false, status: 422, message: "Mock: AS recusado pelo serviço" };
    }
    return { ok: true, body: protocoloRow(id) };
  }

  // PUT /protocolo/protocolaragendamento/<id>
  if (path.startsWith("/protocolo/protocolaragendamento/")) {
    const id = lastSegment(path);
    if (id.endsWith(PROTOCOL_FAILS_ON)) {
      return { ok: false, status: 409, message: "Mock: protocolo já processado" };
    }
    return { ok: true, body: protocoloRow(id) };
  }

  return { ok: false, status: 502, message: `Mock: rota upstream desconhecida ${method} ${path}` };
}
