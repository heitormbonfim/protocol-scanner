import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packaged = Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
// Configuração e certificados ficam ao lado do executável; o frontend é embutido.
export const appRoot = packaged
  ? dirname(process.execPath)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const clientDirectory = packaged
  ? resolve(__dirname, "client")
  : resolve(appRoot, "dist");
