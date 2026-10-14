/**
 * Base URLs of the Vite dev server and the Vite preview server that browser tests load pages from.
 * Override with `CANVAS_TEST_DEV_URL` and `CANVAS_TEST_PREVIEW_URL`.
 */
export const developmentURL = process.env.CANVAS_TEST_DEV_URL ?? "http://127.0.0.1:5173";
export const previewURL = process.env.CANVAS_TEST_PREVIEW_URL ?? "http://127.0.0.1:5174";
