import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const docs = fileURLToPath(new URL("../docs/", import.meta.url));
await mkdir(docs, { recursive: true });
await copyFile(new URL("../../../docs/distribution.md", import.meta.url), `${docs}/distribution.md`);
