/** MessageBar intents (anatomy page `message-bar.md`) and the live region role each takes. */
export type MessageIntent = "info" | "success" | "warning" | "danger";

/** `status` (polite) for information and success, `alert` (assertive) for warnings and errors. */
export const messageRole = (intent: MessageIntent): "status" | "alert" => (intent === "warning" || intent === "danger" ? "alert" : "status");
