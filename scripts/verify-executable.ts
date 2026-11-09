import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, copyFile, chmod, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** Testa o binário sem fontes/dependências e sem permitir acesso à API real. */
export async function verifyExecutable(source: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "verificar executavel-"));
  const binary = join(directory, basename(source));
  const socket = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    socket.on("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      if (!address || typeof address === "string")
        return reject(new Error("Porta indisponível"));
      socket.close(() => resolve(address.port));
    });
  });
  let output = "";
  let child: ReturnType<typeof spawn> | undefined;
  let closed: Promise<void> | undefined;
  try {
    await copyFile(source, binary);
    await chmod(binary, 0o755);
    await writeFile(
      join(directory, ".env"),
      `PORT=${port}\nMOCK_API=true\nMAIS_CIDADAO_API_URL=http://127.0.0.1:1\nUPSTREAM_URL=http://127.0.0.1:1\n`,
    );
    const env = { ...process.env };
    // A configuração deve vir do .env junto ao binário, mesmo com outro cwd.
    for (const key of [
      "PORT",
      "MOCK_API",
      "MAIS_CIDADAO_API_URL",
      "UPSTREAM_URL",
    ])
      delete env[key];
    child = spawn(binary, ["--no-open", "--http"], {
      cwd: tmpdir(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    closed = new Promise<void>((resolve) =>
      child!.once("close", () => resolve()),
    );
    child.stdout?.on("data", (data) => {
      output += String(data);
    });
    child.stderr?.on("data", (data) => {
      output += String(data);
    });
    child.on("error", (error) => {
      output += error.message;
    });
    const base = `http://127.0.0.1:${port}`;
    let html = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(base, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          html = await response.text();
          break;
        }
      } catch {
        /* Aguarda somente o servidor local de teste. */
      }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!html.includes('<div id="root"'))
      throw new Error(`Frontend indisponível.\n${output}`);
    const asset = html.match(/src="([^"]+\.js)"/)?.[1];
    if (!asset) throw new Error("Bundle do frontend ausente no HTML.");
    const response = await fetch(new URL(asset, base));
    if (
      !response.ok ||
      !(response.headers.get("content-type") ?? "").includes("javascript")
    ) {
      throw new Error("O executável não serviu o JavaScript do frontend.");
    }
    const endpoint = basename(source).startsWith("mais-cidadao")
      ? "/api/config"
      : "/api/health";
    const health = await fetch(base + endpoint);
    if (!health.ok) throw new Error("A API local não respondeu.");
    console.log(
      `Executável validado: frontend, assets e API local (${process.platform}).`,
    );
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await closed;
    }
    await rm(directory, { recursive: true, force: true });
  }
}
