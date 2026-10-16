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
export { Checkbox, Switch } from "./Choice.tsx";
export type { CheckboxProps, SwitchProps } from "./Choice.tsx";
export { Radio, RadioGroup } from "./Radio.tsx";
export type { RadioGroupProps, RadioProps } from "./Radio.tsx";
export { Select, Slider } from "./Select.tsx";
export type { SelectProps, SliderProps } from "./Select.tsx";
export { TextArea } from "./TextArea.tsx";
export type { TextAreaProps } from "./TextArea.tsx";
export { Badge, ButtonGroup, Divider, ProgressBar, Spinner } from "./Display.tsx";
export type { BadgeProps, ButtonGroupProps, DividerProps, ProgressBarProps, SpinnerProps } from "./Display.tsx";
export { Card, Panel } from "./Surface.tsx";
export { Dialog, Drawer } from "./Overlay.tsx";
export type { DialogCloseReason, DialogProps, DrawerProps } from "./Overlay.tsx";
export { useStrataGpu } from "./Gpu.tsx";
export type { CardProps, PanelProps } from "./Surface.tsx";
export { Tab, TabList, TabPanel, Tabs } from "./Tabs.tsx";
export { Accordion, AccordionItem } from "./Accordion.tsx";
export { List, ListItem } from "./List.tsx";
export { Table } from "./Table.tsx";
export type { SortDirection, TableColumn, TableProps, TableRow, TableSort } from "./Table.tsx";
export type { ListItemProps, ListProps } from "./List.tsx";
export type { AccordionItemProps, AccordionProps } from "./Accordion.tsx";
export type { TabListProps, TabPanelProps, TabProps, TabsProps } from "./Tabs.tsx";
