// Vite configuration of the fixture app: the compiler plugin with the default `underglass.config.json`,
// and source maps so the adapter's map handling is exercised.
import { underglass } from "@underglass/css-compiler/vite";
export default {
  plugins: [underglass()],
  build: { sourcemap: true },
};
