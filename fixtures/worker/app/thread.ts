// Worker entry for the fixture: runs the compositor inside this worker. Loaded by `main.tsx` through `new Worker`.
import { startWorkerCompositor } from "@underglass/react/experimental-worker/thread";
startWorkerCompositor(self);
