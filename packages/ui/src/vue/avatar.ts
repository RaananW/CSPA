/**
 * Avatar for Vue 3 (anatomy page `avatar.md`): a raised coin with initials (`role="img"`, named by `name`) or a
 * picture whose `alt` is the name. `decorative` hides it, for an avatar beside the name in text.
 */
import { defineComponent, h } from "vue";
import { avatarInitials } from "../shared/avatar.ts";
import { strataAttributes, strataProps } from "./shared.ts";

export const Avatar = defineComponent({
  name: "StrataAvatar",
  props: {
    /** The person's or entity's name: the picture's `alt`, or the initials and the name. */
    name: { type: String, required: true },
    /** A picture; initials when absent. */
    src: { type: String, default: undefined },
    /** Hidden from assistive technology, for an avatar beside the name in text. */
    decorative: { type: Boolean, default: false },
    ...strataProps,
  },
  setup(props) {
    return () => h("span", {
      class: "ug-avatar", "data-strata-face": "raised",
      ...(props.src === undefined && !props.decorative ? { role: "img", "aria-label": props.name } : {}),
      "aria-hidden": props.decorative ? "true" : undefined, ...strataAttributes(props),
    }, props.src !== undefined
      ? h("img", { class: "ug-avatar__image", src: props.src, alt: props.decorative ? "" : props.name })
      : h("span", { class: "ug-avatar__initials", "aria-hidden": props.decorative ? undefined : "true" }, avatarInitials(props.name)));
  },
});
