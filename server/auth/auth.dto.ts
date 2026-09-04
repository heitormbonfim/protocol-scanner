/**
 * The login whitelist.
 *
 * The upstream login response carries the user's e-mail, their internal ids
 * (`id`, `pessoaid`, `usuariogrupoid`), the entities they belong to, and the
 * full raw `permissoes` array. None of that has any use in a barcode scanner,
 * so none of it crosses.
 *
 * ## Built by construction, never by deletion
 *
 * Every field in the returned object is written out literally below. The
 * tempting alternative — take the upstream object and `delete` the sensitive
 * keys — works exactly until the day upstream adds a field nobody here knows
 * about, and then it leaks in silence. A whitelist fails the other way: a new
 * upstream field simply does not appear, and someone has to make a conscious
 * decision to add it.
 *
 * `auth.dto.test.ts` pins this. If you add a field and that test fails, the
 * test is working. See "The DTO boundary" in the README.
 */

/** What the browser is allowed to know about whoever is logged in. */
export type SessionDto = {
  /**
   * The upstream JWT, forwarded so the browser can send it back on later calls.
   *
   * Not personal data: its payload is `{ id_usuario, pessoa_id, iat, exp }`.
   * The browser holds it only to prove who it is; every request carrying it
   * still passes through this server and its DTOs.
   */
  token: string;
  usuario: {
    /** First name only — what the header shows as "Usuário: Heitor". */
    nome: string;
    /** Verbatim upstream label, e.g. "Atendente". Shown next to the name. */
    nivel_permissao: string;
    /**
     * Whether this user may file protocols at all.
     *
     * Derived here precisely so the raw `permissoes` array — 18 entries
     * describing every screen of a system this app is not — never has to leave.
     * camelCase, unlike `nivel_permissao`, to mark it as ours rather than a
     * passthrough.
     */
    podeProtocolar: boolean;
  };
};

/** Either permission is enough to file a protocol. */
const PODE_PROTOCOLAR = ["PROTOCOLO_CRIAR", "PROTOCOLO_GERENCIAR"];

export function toSessionDto(raw: unknown): SessionDto {
  const user = (raw ?? {}) as Record<string, unknown>;
  const permissoes = Array.isArray(user.permissoes) ? user.permissoes : [];

  return {
    token: String(user.token ?? ""),
    usuario: {
      nome: String(user.nome ?? ""),
      nivel_permissao: String(user.nivel_permissao ?? ""),
      podeProtocolar: PODE_PROTOCOLAR.some((p) => permissoes.includes(p)),
    },
  };
}
