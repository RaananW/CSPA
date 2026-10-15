// Prepack step for `@underglass/react`: copies the repository's `docs/distribution.md` into
// `packages/react/docs/` so the packed tarball ships it (it is listed in the manifest's
// `files`). Run by the package's `prepack` script after `npm run build`; it takes no arguments.
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const docs = fileURLToPath(new URL("../docs/", import.meta.url));
await mkdir(docs, { recursive: true });
await copyFile(new URL("../../../docs/distribution.md", import.meta.url), `${docs}/distribution.md`);
