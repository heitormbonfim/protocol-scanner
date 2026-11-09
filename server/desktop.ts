import { spawn } from "node:child_process";
import { packaged } from "./paths.ts";

export function openBrowser(url: string) {
  if (!packaged || process.argv.includes("--no-open")) return;
  const child = spawn(
    process.platform === "win32" ? "rundll32.exe" : "xdg-open",
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
    { detached: true, stdio: "ignore" },
  );
  child.on("error", () => console.log(`Abra manualmente: ${url}`));
  child.unref();
}
