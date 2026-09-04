import { callUpstream, type UpstreamResult } from "../shared/upstream.ts";

/**
 * The one upstream call the auth module makes.
 *
 * `POST {UPSTREAM}/usuario/login` with `{ email, senha }`. No bearer token —
 * this is the call that produces one.
 */
export function login(email: string, senha: string): Promise<UpstreamResult> {
  return callUpstream({
    method: "POST",
    path: "/usuario/login",
    body: { email, senha },
  });
}
