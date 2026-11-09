import { build } from "esbuild";
import { exec } from "@yao-pkg/pkg";
import {
  cp,
  mkdir,
  writeFile,
  copyFile,
  access,
  rm,
  chmod,
} from "node:fs/promises";
import { resolve } from "node:path";
import { verifyExecutable } from "./verify-executable.ts";

async function main() {
  const name = "protocol-scanner";
  const requested = process.argv[2];
  if (requested && !["linux", "windows"].includes(requested)) {
    throw new Error(
      "Use npm run package, npm run package:linux ou npm run package:windows.",
    );
  }
  const platforms = requested ? [requested] : ["linux", "windows"];
  const staging = resolve(".package");
  await mkdir(staging, { recursive: true });
  await rm(resolve(staging, "client"), { recursive: true, force: true });
  await cp(resolve("dist"), resolve(staging, "client"), { recursive: true });
  // O bundle inclui somente o servidor. Nunca incluir .env, certs ou referências privadas.
  await build({
    entryPoints: ["server/index.ts"],
    outfile: resolve(staging, "server.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: false,
    minify: false,
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": "__moduleUrl",
    },
    banner: {
      js: 'const __moduleUrl = require("node:url").pathToFileURL(__filename).href;',
    },
    external: [],
  });
  // Bootstrap captura falhas antes dos imports (incluindo .env inválido) no duplo clique.
  await writeFile(
    resolve(staging, "launcher.cjs"),
    `
process.on('uncaughtException', error => {
  console.error('Não foi possível iniciar: ' + error.message);
  console.error('Confira o .env ao lado do programa e se a porta já está em uso.');
  console.error('Pressione Enter para fechar.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
});
require('./server.cjs');
`,
  );
  await writeFile(
    resolve(staging, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        bin: "launcher.cjs",
        pkg: { assets: ["client/**/*", "server.cjs"] },
      },
      null,
      2,
    ),
  );
  for (const platform of platforms) {
    const directory = resolve("release", `${platform}-x64`);
    const filename = `${name}${platform === "windows" ? ".exe" : ""}`;
    await mkdir(directory, { recursive: true });
    await exec([
      resolve(staging, "package.json"),
      "--targets",
      `node22-${platform === "windows" ? "win" : "linux"}-x64`,
      "--output",
      resolve(directory, filename),
      "--no-bytecode",
      "--public-packages",
      "*",
      "--public",
    ]);
    if (platform === "linux") {
      await chmod(resolve(directory, filename), 0o755);
      await writeFile(
        resolve(directory, "iniciar.sh"),
        `#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
# Ao executar pelo gerenciador de arquivos, abra uma janela de terminal.
if [ ! -t 0 ]; then
  for terminal in x-terminal-emulator gnome-terminal konsole xfce4-terminal xterm; do
    if command -v "$terminal" >/dev/null 2>&1; then
      case "$terminal" in
        gnome-terminal) exec "$terminal" -- sh "$PWD/iniciar.sh" "$@" ;;
        xfce4-terminal) exec "$terminal" --disable-server -x sh "$PWD/iniciar.sh" "$@" ;;
        *) exec "$terminal" -e sh "$PWD/iniciar.sh" "$@" ;;
      esac
    fi
  done
  echo "Abra um terminal nesta pasta e execute: sh iniciar.sh" >&2
  exit 1
fi
printf '\nServidor ${name}\nPara encerrar, pressione Ctrl+C nesta janela.\nFechar a página do navegador não encerra o servidor.\n\n'
# Substituir o shell garante que os sinais do terminal cheguem ao servidor.
exec "./${filename}" "$@"
`,
        { mode: 0o755 },
      );
    } else {
      await writeFile(
        resolve(directory, "iniciar.cmd"),
        [
          `@echo off`,
          `cd /d "%~dp0"`,
          `"%~dp0${filename}" %*`,
          `if errorlevel 1 pause`,
          "",
        ].join("\r\n"),
      );
    }
    if (
      (platform === "linux" && process.platform === "linux") ||
      (platform === "windows" && process.platform === "win32")
    ) {
      await verifyExecutable(resolve(directory, filename));
    } else {
      console.log(
        `Gerado para ${platform}; valide a execução em uma máquina dessa plataforma.`,
      );
    }
    await copyFile(".env.example", resolve(directory, ".env.example"));
    // Reempacotar não sobrescreve configurações já personalizadas pelo operador.
    try {
      await access(resolve(directory, ".env"));
    } catch {
      await copyFile(".env.example", resolve(directory, ".env"));
    }
    await writeFile(
      resolve(directory, "LEIA-ME.txt"),
      `
protocol-scanner — servidor local (${platform}, x64)

1. Extraia/copie esta pasta para um local com permissão de escrita.
2. Configure o .env ao lado do programa. O arquivo distribuído contém apenas um exemplo.
3. Windows: dê dois cliques em iniciar.cmd (mantém erros visíveis).
   Linux: execute iniciar.sh (opção Executar como programa no gerenciador de arquivos).
   Ele abre um terminal visível. Também pode executar sh iniciar.sh em um terminal.
4. Para outros computadores, utilize o endereço de rede local exibido no terminal.
   O servidor abre o navegador automaticamente. Mantenha a janela do servidor aberta.
5. Para encerrar, pressione Ctrl+C na janela do servidor. Fechar o navegador não encerra o servidor.

Não precisa instalar Node.js, npm ou dependências. O frontend está embutido.
Use --no-open para iniciar sem abrir o navegador.
No Linux, duplo clique depende das permissões e do gerenciador de arquivos.
Não abra dois servidores na mesma porta. Edite PORT no .env se necessário.
Windows pode exibir SmartScreen porque este executável não tem assinatura digital.
Protocolo: .env precisa de UPSTREAM_URL. Para usar câmera em celulares na rede, copie certificados válidos para certs/ ao lado do executável; eles NÃO são incluídos. A CA precisa ser confiável no celular. Use --http para acesso local sem HTTPS.
`,
    );
    console.log(`Executável criado: ${resolve(directory, filename)}`);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
