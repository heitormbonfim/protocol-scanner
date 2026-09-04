import { Router } from "express";
import {
  getProtocolo,
  putProtocolar,
  putProtocolarAs,
} from "./protocolo.controller.ts";

/** Mounted at `/api/protocolos` by `server/api.routes.ts`. */
export const protocoloRoutes = Router();

// `ENDPOINTS.lookup` — GET /api/protocolos?protocoloId=<15 digits>
protocoloRoutes.get("/", getProtocolo);

// `ENDPOINTS.protocol` / `ENDPOINTS.protocolAs`. The id is the last segment in
// both, and `protocolar-as` is a sibling of `protocolar` rather than a path
// under it, so neither can shadow the other — see src/lib/endpoints.ts.
protocoloRoutes.put("/protocolar/:id", putProtocolar);
protocoloRoutes.put("/protocolar-as/:id", putProtocolarAs);
