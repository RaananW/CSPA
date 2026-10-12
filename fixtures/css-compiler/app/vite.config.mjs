import { canvasSPA } from "@canvas-spa/css-compiler/vite";
export default {
  plugins: [canvasSPA()],
  build: { sourcemap: true },
};
