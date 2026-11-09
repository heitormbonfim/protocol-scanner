/** Explicit lookup DTO: only identity, protocol number, opening date and client name. */
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
  nomecompleto: string;
};

export function toProtocoloDto(raw: unknown): ProtocoloDto {
  const p = (raw ?? {}) as Record<string, unknown>;

  const pessoa = p.Pessoa as Record<string, unknown> | null | undefined;

  return {
    // Upstream sends a number; the client works in strings throughout.
    id: String(p.id ?? ""),
    numprotocolo: String(p.numprotocolo ?? ""),
    data: String(p.data ?? ""),
    nomecompleto: typeof pessoa?.nomecompleto === "string" ? pessoa.nomecompleto.trim() : "",
  };
}
