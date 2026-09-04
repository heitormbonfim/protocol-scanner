import { Router } from "express";
import { postLogin } from "./auth.controller.ts";

/** Mounted at `/api/auth` by `server/api.routes.ts`. */
export const authRoutes = Router();

// `ENDPOINTS.login` — POST /api/auth/login
authRoutes.post("/login", postLogin);
