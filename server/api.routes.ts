import { Router } from "express";
import { authRoutes } from "./auth/auth.routes.ts";
import { protocoloRoutes } from "./protocolo/protocolo.routes.ts";
import { config } from "./config.ts";

/**
 * Everything under `/api`, and the terminal 404 that closes it.
 *
 * The client's own copy of these paths is `src/lib/endpoints.ts`. Keep the two
 * in step — and note this side is the one that polices the HTTP method.
 */
export const apiRoutes = Router();

/**
 * `ENDPOINTS.health` — is the server up, and what is it pointed at.
 *
 * The app never calls this. It exists for two reasons: `docs/IPHONE.md` opens
 * with a single `curl` against it, so nobody starts installing certificates to
 * fix what is really a server that is not running; and it makes the upstream
 * target visible from anywhere on the network, without reading a terminal.
 */
apiRoutes.get("/health", (_req, res) => {
  res.json({ ok: true, upstream: config.upstream });
});

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/protocolos", protocoloRoutes);

/**
 * Anything else under `/api`: 404, as JSON.
 *
 * **This must stay last, and it must stay here.** Without it an unmatched
 * `/api/...` path falls through to the SPA fallback in `shared/static.ts`,
 * which answers **200 with index.html** — and `submit()` in `src/lib/api.ts`
 * treats any 2xx as success. A renamed or mistyped endpoint would then be
 * reported to the operator as "Protocolo protocolado (HTTP 200)" for a
 * submission that never left this machine.
 *
 * JSON rather than text because every error this API emits is
 * `{ "message": … }` — that is the shape `readDetail` in `src/lib/api.ts`
 * knows how to read, so the reason reaches the phone instead of a blank.
 */
apiRoutes.use((_req, res) => {
  res.status(404).json({ message: "Rota de API inexistente" });
});
