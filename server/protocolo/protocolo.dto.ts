/**
 * The protocol whitelist — three fields, and nothing else crosses.
 *
 * The upstream response is a full citizen record: `Pessoa.nomecompleto`, `cpf`,
 * `sus`, `celular01`, and a nested `Logradouro`/`Bairro`/`Distrito` address,
 * alongside a dozen internal foreign keys (`pessoa_id`, `servico_id`,
 * `entidade_id`, `created_user`, …). The scanner needs none of it. The operator
 * is holding the paper; the person's details are already in their hand, and
 * putting them in a browser puts them in that phone's DevTools and disk cache
 * too.
 *
 * ## Built by construction, never by deletion
 *
 * See the same note in `../auth/auth.dto.ts`. `protocolo.dto.test.ts` pins this
 * against the real upstream payload. See "The DTO boundary" in the README.
 */

/** What the browser is allowed to know about a protocol. */
export type ProtocoloDto = {
  /**
   * The internal id, and the only reason this lookup exists.
   *
   * The two submission endpoints address a protocol by this, not by the
   * 15-digit number printed on the paper.
   */
  id: string;
  /** The 15-digit number, echoed back so the client can check the scan. */
  numprotocolo: string;
  /** The date the protocol was opened, `YYYY-MM-DD`. */
  data: string;
};

export function toProtocoloDto(raw: unknown): ProtocoloDto {
  const p = (raw ?? {}) as Record<string, unknown>;

  return {
    // Upstream sends a number; the client works in strings throughout.
    id: String(p.id ?? ""),
    numprotocolo: String(p.numprotocolo ?? ""),
    data: String(p.data ?? ""),
  };
}
