/**
 * The most human-readable explanation an upstream error body offers.
 *
 * Twin of `readDetail` in `src/lib/api.ts` — deliberately duplicated rather
 * than shared, because that module is browser code full of `import.meta.env`
 * and cannot be imported from Node. If you change the field list in one, change
 * it in the other.
 *
 * The government service's own wording is far more actionable than a status
 * code, so it is worth digging one level into a JSON envelope for it. Returns
 * '' when the body says nothing useful — `{}` and an HTML error page alike — so
 * the caller falls back to its own message rather than forwarding a fragment of
 * a Railway error page to someone's phone.
 */

function parse(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function readDetail(text: string): string {
  const body = parse(text);

  if (typeof body === "string") {
    // Anything with markup in it is a proxy's error page, not a message.
    return body.includes("<") ? "" : body.slice(0, 140).trim();
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message =
      record.message ??
      record.Message ??
      record.mensagem ??
      record.error ??
      record.erro ??
      record.detail;
    if (typeof message === "string") return message.slice(0, 140).trim();
  }

  return "";
}
