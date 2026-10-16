/**
 * `@underglass/ui/react`: Strata components for React 18 and 19. Each renders exactly the markup contract on its
 * anatomy page (`docs/ui-library/components`), forwards a ref to its root element, and passes `className`, `style`
 * and native attributes through, so it works without Underglass and can be enrolled as an app-owned layer.
 */
export { Button, IconButton, ToggleButton } from "./Button.tsx";
export type { ButtonProps, IconButtonProps, ToggleButtonProps } from "./Button.tsx";
export { Field, useFieldControl } from "./Field.tsx";
export type { FieldControl, FieldProps } from "./Field.tsx";
export { Link } from "./Link.tsx";
export type { LinkProps } from "./Link.tsx";
export { StrataProvider, StrataScope } from "./Provider.tsx";
export type { StrataProviderProps, StrataScopeProps } from "./Provider.tsx";
export { TextField } from "./TextField.tsx";
export type { TextFieldProps } from "./TextField.tsx";
export type { StrataLevel, StrataProps, StrataSize } from "./shared.ts";
