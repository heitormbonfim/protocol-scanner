import type { Request, Response } from "express";
import { buscarProtocolo, protocolar, protocolarAs } from "./protocolo.service.ts";
import { selecionarProtocolo } from "./protocolo.select.ts";
import { toProtocoloDto } from "./protocolo.dto.ts";
import type { UpstreamResult } from "../shared/upstream.ts";

/**
 * The three protocol routes.
 *
 * Each one does the same three things in the same order: forward the operator's
 * token upstream, turn a failure into our own status, and run every success
 * through `toProtocoloDto` before it can reach a browser. That last step is the
 * boundary — see "The DTO boundary" in the README.
 */

/**
 * The caller's bearer token, forwarded verbatim.
 *
 * Read from the header here rather than in a middleware: typing `res.locals`
 * would need a `declare global` + `namespace`, and `erasableSyntaxOnly` bans
 * namespaces. Passing it as an argument is both simpler and easier to follow.
 */
function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== "string") return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

/** Reply with the DTO, or with the mapped failure. Never the raw upstream body. */
function replyWithDto(res: Response, result: UpstreamResult): void {
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }
  res.json(toProtocoloDto(result.body));
}

/** `GET /api/protocolos?protocoloId=<15 digits>` — number → protocol. */
export async function getProtocolo(req: Request, res: Response): Promise<void> {
  const num = req.query.protocoloId;

  if (typeof num !== "string" || !/^\d{15}$/.test(num)) {
    res.status(400).json({ message: "protocoloId deve ter 15 dígitos" });
    return;
  }

  const result = await buscarProtocolo(num, bearer(req));
  if (!result.ok) {
    res.status(result.status).json({ message: result.message });
    return;
  }

  // The upstream lookup answers with a list, and an ambiguous list is refused
  // rather than guessed at — see protocolo.select.ts.
  const selecao = selecionarProtocolo(result.body, num);
  if (!selecao.ok) {
    res.status(selecao.status).json({ message: selecao.message });
    return;
  }

  res.json(toProtocoloDto(selecao.protocolo));
}

/** `PUT /api/protocolos/protocolar/:id` — the ordinary submission. */
export async function putProtocolar(req: Request, res: Response): Promise<void> {
  replyWithDto(res, await protocolar(String(req.params.id), bearer(req)));
}

/** `PUT /api/protocolos/protocolar-as/:id` — the AS submission. */
export async function putProtocolarAs(req: Request, res: Response): Promise<void> {
  replyWithDto(res, await protocolarAs(String(req.params.id), bearer(req)));
}
