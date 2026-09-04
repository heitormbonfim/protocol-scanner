import type { Request, Response } from "express";
import { login } from "./auth.service.ts";
import { toSessionDto } from "./auth.dto.ts";

/**
 * Exchange a username and password for a session.
 *
 * Replaces the build-time `VITE_AUTH_TOKEN` the app used to carry: that token
 * was baked into the bundle, identical for everyone, and readable by anyone
 * with the app. Now each operator logs in as themselves, which is also what
 * makes it possible to say who filed what.
 */
export async function postLogin(req: Request, res: Response): Promise<void> {
  const { email, senha } = (req.body ?? {}) as Record<string, unknown>;

  // Checked here rather than upstream: a blank field is a UI mistake, and a
  // round trip to a government service is a silly way to find that out.
  if (typeof email !== "string" || typeof senha !== "string" || !email || !senha) {
    res.status(400).json({ message: "Informe usuário e senha" });
    return;
  }

  const result = await login(email, senha);

  if (!result.ok) {
    /*
     * A 401 from the login call means "wrong credentials", not "session
     * expired" — which is what `upstream.ts` phrases every 401 as, because that
     * is what it means on every other route. Reword it here, where we know
     * which call it was.
     */
    const message =
      result.status === 401 ? "Usuário ou senha inválidos" : result.message;
    res.status(result.status).json({ message });
    return;
  }

  const dto = toSessionDto(result.body);

  // An upstream 200 with no token is not a login. Better a clear failure than
  // a session the client thinks it has and cannot use.
  if (!dto.token) {
    res.status(502).json({ message: "Serviço remoto não devolveu um token" });
    return;
  }

  res.json(dto);
}
