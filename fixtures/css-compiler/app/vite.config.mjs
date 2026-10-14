import { underglass } from "@underglass/css-compiler/vite";
export default {
  plugins: [underglass()],
  build: { sourcemap: true },
};
