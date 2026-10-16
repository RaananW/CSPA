/**
 * MessageBar for Vue 3 (anatomy page `message-bar.md`): an inline message on a raised slab, a live region whose role
 * follows its intent, with an optional `actions` slot and a dismiss button (a `dismiss` listener).
 */
import { defineComponent, getCurrentInstance, h, type PropType } from "vue";
import { messageRole, type MessageIntent } from "../shared/message.ts";
import { strataAttributes, strataProps } from "./shared.ts";

export const MessageBar = defineComponent({
  name: "StrataMessageBar",
  props: {
    intent: { type: String as PropType<MessageIntent>, default: "info" },
    title: { type: String, default: undefined },
    dismissLabel: { type: String, default: "Dismiss" },
    ...strataProps,
  },
  emits: { dismiss: () => true },
  setup(props, { slots, emit }) {
    // A declared event's listener is not in `attrs`: the bar is dismissible when its vnode has a `dismiss` listener.
    const instance = getCurrentInstance();
    return () => h("div", {
      class: ["ug-message-bar", `ug-message-bar--${props.intent}`], "data-strata-face": "raised", role: messageRole(props.intent), ...strataAttributes(props),
    }, [
      h("span", { class: "ug-message-bar__icon", "aria-hidden": "true" }),
      h("div", { class: "ug-message-bar__content" }, [
        props.title !== undefined && h("p", { class: "ug-message-bar__title" }, props.title),
        h("p", { class: "ug-message-bar__body" }, slots.default?.()),
      ]),
      slots.actions && h("div", { class: "ug-message-bar__actions" }, slots.actions()),
      instance?.vnode.props?.onDismiss && h("button", { class: "ug-message-bar__dismiss", type: "button", "aria-label": props.dismissLabel, onClick: () => emit("dismiss") }),
    ]);
  },
});
