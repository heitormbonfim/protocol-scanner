/**
 * Picking one protocol out of what the upstream lookup returns.
 *
 * `GET /protocolo?protocoloId=<num>` answers with a **list**, not an object.
 * Taking `[0]` would be the obvious shortcut and it is the wrong one: the
 * endpoint may well be matching with a `LIKE`, and a 14-digit prefix that also
 * matches a different slip would have us file the wrong person's protocol. A
 * submission has no undo, so an ambiguous answer is refused rather than
 * guessed at.
 *
 * Pure, and separate from the controller, so all four cases are testable
 * without HTTP.
 */

export type Selection =
  | { ok: true; protocolo: unknown }
  | { ok: false; status: number; message: string };

export function selecionarProtocolo(body: unknown, num: string): Selection {
  // A single object rather than a list is tolerated, in case the endpoint
  // narrows its response shape one day.
  const linhas = Array.isArray(body) ? body : body ? [body] : [];

  const exatas = linhas.filter(
    (linha) =>
      String((linha as Record<string, unknown> | null)?.numprotocolo ?? "") === num,
  );

  if (exatas.length === 0) {
    return { ok: false, status: 404, message: `Protocolo ${num} não encontrado` };
  }
  if (exatas.length > 1) {
    return {
      ok: false,
      status: 409,
      message: `${exatas.length} protocolos com o número ${num} — nada foi selecionado`,
    };
  }

  return { ok: true, protocolo: exatas[0] };
}
