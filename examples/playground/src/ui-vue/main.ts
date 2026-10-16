/**
 * Strata Vue check page (`ui-vue.html`): the Tier A components from `@underglass/ui/vue`, in plain Vue with no
 * Underglass. It mirrors the React check page (`ui-react.html`) element for element: `#contracts` renders each
 * anatomy page's markup example, and the panels below are live controls with the same ids, names and state, exposed
 * through `window.strataBinding`, so one browser test drives both bindings.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, reactive, ref, toRaw, type VNode } from "vue";
import {
  Accordion, AccordionItem, Avatar, Badge, Breadcrumb, Button, ButtonGroup, Card, Checkbox, Chip, Dialog, Divider, Drawer, Field, IconButton, Link, List, ListItem, MessageBar, Panel, ProgressBar, Radio, RadioGroup, Select, Skeleton, Slider,
  Spinner, StrataProvider, StrataScope, Switch, Tab, Table, TabList, TabPanel, Tabs, TextArea, TextField, ToggleButton,
} from "@underglass/ui/vue";

const close = () => h("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }, [h("path", { d: "M4 4l8 8M12 4l-8 8" })]);
const text = (value: string) => () => value;
const option = (value: string, label: string, extra: Record<string, unknown> = {}) => h("option", { value, ...extra }, label);
const contract = (name: string, children: VNode | VNode[]) => h("div", { "data-contract": name }, children);

// A Dialog and a Drawer render only while open, so the test opens them (`window.strataOverlays`) to compare.
const overlays = ref(false);
Object.assign(window, { strataOverlays: (open: boolean) => { overlays.value = open; } });

/** Each anatomy page's markup example, rendered by the binding. */
const Contracts = () => h("div", { id: "contracts", hidden: true }, [
  contract("button.md", h(Button, { variant: "accent" }, { icon: () => [], default: text("Save") })),
  contract("icon-button.md", h(IconButton, { label: "Close" })),
  contract("toggle-button.md", h(ToggleButton, null, { default: text("Bold") })),
  contract("link.md", h(Link, { href: "/docs" }, { default: text("Read the guide") })),
  contract("field.md", h(Field, { label: "Email", controlId: "email", help: "We only use it for receipts.", error: "enter an address like name@example.com.", required: true }, { default: () => h(TextField) })),
  contract("text-field.md", h(TextField, { type: "email", id: "email", name: "email", autocomplete: "email" })),
  contract("text-field.md#2", h(TextField, { type: "search", id: "q" }, { icon: () => [] })),
  contract("text-area.md", h(TextArea, { id: "notes", name: "notes", rows: 3 })),
  contract("checkbox.md", h(Checkbox, { name: "news" }, { default: text("Send me the newsletter") })),
  contract("radio.md", h(RadioGroup, { legend: "Plan", name: "plan", defaultValue: "free", help: "You can change it later.", error: "choose a plan." }, {
    default: () => [h(Radio, { value: "free" }, { default: text("Free") }), h(Radio, { value: "pro" }, { default: text("Pro") })],
  })),
  contract("switch.md", h(Switch, { name: "wifi" }, { default: text("Wi-Fi") })),
  contract("table.md", h(Table, { caption: "Invoices", columns: [{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true }, { key: "amount", header: "Amount", numeric: true }], rows: [{ number: "1001", customer: "Ada Lovelace", amount: "120.00" }, { number: "1002", customer: "Grace Hopper", amount: "87.50" }], defaultSort: { key: "number", direction: "ascending" } })),
  contract("table.md#2", h(Table, { caption: "Invoices", columns: [{ key: "number", header: "Number" }, { key: "customer", header: "Customer" }, { key: "amount", header: "Amount", numeric: true }], rows: [{ number: "1001", customer: "Ada Lovelace", amount: "120.00" }], sort: { key: "number", direction: "ascending" } })),
  contract("avatar.md", [h(Avatar, { name: "Ada Lovelace" }), h(Avatar, { name: "Grace Hopper", src: "/people/grace.jpg" }), h(Avatar, { name: "Alan Turing", decorative: true })]),
  contract("chip.md", [h(Chip, null, { default: text("Design") }), h(Chip, { defaultPressed: true }, { default: text("Remote") }), h(Chip, { onRemove: () => {} }, { default: text("ada@example.com") })]),
  contract("message-bar.md", h(MessageBar, { intent: "warning", title: "Storage almost full", onDismiss: () => {} }, {
    default: text("You have used 95% of your space."), actions: () => h(Button, null, { default: text("Upgrade") }),
  })),
  contract("skeleton.md", [h(Skeleton, { shape: "circle" }), h(Skeleton, { lines: 3 }), h(Skeleton, { shape: "rect", width: "100%", height: 120 })]),
  contract("breadcrumb.md", h(Breadcrumb, { items: [{ label: "Home", href: "/" }, { label: "Settings", href: "/settings" }, { label: "Profile", href: "/settings/profile" }] })),
  contract("list.md", h(List, { label: "Mailboxes" }, {
    default: () => [
      h(ListItem, { href: "/inbox", current: "page", primary: "Inbox", secondary: "12 unread", end: "Now" }, { start: () => [] }),
      h(ListItem, { primary: "Archive", button: true }),
      h(ListItem, { primary: "Storage", secondary: "4.2 GB of 15 GB used" }),
    ],
  })),
  contract("accordion.md", h(Accordion, { name: "faq" }, {
    default: () => [
      h(AccordionItem, { title: "Shipping", defaultOpen: true }, { default: () => h("p", null, "Orders ship within two days.") }),
      h(AccordionItem, { title: "Returns" }, { default: () => h("p", null, "Return any item within 30 days.") }),
    ],
  })),
  contract("tabs.md", h(Tabs, { id: "account", defaultValue: "profile" }, {
    default: () => [
      h(TabList, { label: "Account" }, { default: () => [
        h(Tab, { value: "profile" }, { default: text("Profile") }),
        h(Tab, { value: "security" }, { default: text("Security") }),
        h(Tab, { value: "billing", disabled: true }, { default: text("Billing") }),
      ] }),
      h(TabPanel, { value: "profile" }, { default: () => h("p", null, "Your name and photo.") }),
      h(TabPanel, { value: "security" }, { default: () => h("p", null, "Your password and two-step sign-in.") }),
      h(TabPanel, { value: "billing" }, { default: () => h("p", null, "Your plan and invoices.") }),
    ],
  })),
  contract("select.md", h(Select, { id: "size", name: "size", defaultValue: "" }, {
    default: () => [option("", "Choose a size", { disabled: true }), option("s", "Small"), option("m", "Medium")],
  })),
  contract("button-group.md", h(ButtonGroup, { label: "Alignment" }, { default: () => ["Left", "Centre", "Right"].map(label => h(Button, null, { default: text(label) })) })),
  contract("divider.md", [h(Divider), h(Divider, { orientation: "vertical" })]),
  contract("badge.md", h(Badge, { variant: "success" }, { default: text("Active") })),
  contract("spinner.md", h(Spinner, { label: "Loading" })),
  contract("progress-bar.md", [h("label", { for: "upload" }, "Upload"), h(ProgressBar, { id: "upload", value: 40, max: 100 })]),
  contract("card.md", h(Card, { title: "Latency", titleId: "card-1-title" }, { default: text("…"), footer: () => [] })),
  contract("panel.md", h(Panel, { title: "Settings", titleId: "settings-title" })),
  contract("dialog.md", h(Dialog, { open: overlays.value, container: '[data-contract="dialog.md"]', title: "Discard changes?", titleId: "discard-title", description: "Your edits will be lost.", descriptionId: "discard-description" }, {
    actions: () => h(Button, { "data-strata-close": "" }, { default: text("Keep editing") }),
  })),
  contract("drawer.md", h(Drawer, { open: overlays.value, container: '[data-contract="drawer.md"]', title: "Filters", titleId: "filters-title", description: "Narrow the list.", descriptionId: "filters-description" }, {
    actions: () => h(Button, { "data-strata-close": "" }, { default: text("Done") }),
  })),
  contract("slider.md", h(Slider, { min: 0, max: 100, step: 1, defaultValue: 40, "aria-label": "Volume" })),
]);

/** What the dialog check reads: the live Dialog's panel (the exposed ref) and the reasons it was asked to close. */
const strataDialog = { panel: null as HTMLElement | null, reasons: [] as string[] };
Object.assign(window, { strataDialog });

const App = defineComponent({
  setup() {
    const liveOpen = ref(false);
    const liveRef = ref<{ panel: HTMLElement | null } | null>(null);
    const clicks = reactive({ save: 0, blocked: 0, disabled: 0, close: 0, submit: 0 });
    const italic = ref(true), email = ref(""), accent = ref<string | undefined>(undefined), tab = ref("general");
    const faq = reactive({ delivery: false, warranty: true });
    const rows = reactive({ archive: 0, locked: 0 });
    const messages = reactive({ upgrades: 0, dismissed: false });
    const chips = reactive({ remote: false, removed: [] as string[] });
    const sort = ref<{ key: string; direction: "ascending" | "descending" } | undefined>(undefined);
    const choices = reactive({ terms: false, mixed: true, wifi: true, plan: "", size: "m", volume: 40, notes: "" });
    const buttonRef = ref<{ $el: HTMLElement } | null>(null), inputRef = ref<{ input: HTMLInputElement } | null>(null), wrappedRef = ref<{ input: HTMLInputElement } | null>(null);
    const count = (key: keyof typeof clicks) => () => { clicks[key]++; };
    Object.assign(window, {
      strataBinding: {
        get clicks() { return { ...toRaw(clicks) }; },
        get italic() { return italic.value; },
        get email() { return email.value; },
        get choices() { return { ...toRaw(choices) }; },
        get liveDialog() { return liveRef.value?.panel ?? null; },
        get refs() { return { button: buttonRef.value?.$el ?? null, input: inputRef.value?.input ?? null, wrapped: wrappedRef.value?.input ?? null }; },
        setAccent: (value: string | undefined) => { accent.value = value; },
        get tab() { return tab.value; },
        setTab: (value: string) => { tab.value = value; },
        get faq() { return { ...toRaw(faq) }; },
        get rows() { return { ...toRaw(rows) }; },
        get sort() { return sort.value; },
        get messages() { return { ...toRaw(messages) }; },
        get chips() { return { remote: chips.remote, removed: [...chips.removed] }; },
        setSort: (value: { key: string; direction: "ascending" | "descending" } | undefined) => { sort.value = value; },
        setFaq: (value: { delivery: boolean; warranty: boolean }) => { Object.assign(faq, value); },
      },
    });
    return () => {
      const invalid = email.value.length > 0 && !email.value.includes("@");
      return h(StrataProvider, { theme: accent.value ? { colour: { accent: accent.value } } : undefined }, {
        default: () => [
          Contracts(),
          h("main", { style: { display: "grid", gap: "24px", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", padding: "24px" } }, [
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Buttons" }, [
              h("form", { onSubmit: (event: Event) => { event.preventDefault(); clicks.submit++; }, style: { display: "flex", flexWrap: "wrap", gap: "12px" } }, [
                h(Button, { ref: buttonRef, variant: "accent", id: "save", class: "extra", style: { marginRight: "4px" }, "data-testid": "save", onClick: count("save") }, { default: text("Save") }),
                h(Button, { id: "blocked", "aria-disabled": "true", onClick: count("blocked") }, { default: text("Unavailable") }),
                h(Button, { id: "disabled", disabled: true, onClick: count("disabled") }, { default: text("Disabled") }),
                h(Button, { id: "busy", busy: true }, { default: text("Saving") }),
                h(IconButton, { id: "close", label: "Close", onClick: count("close") }, { default: close }),
                h(ToggleButton, { id: "bold", defaultPressed: false }, { default: text("Bold") }),
                h(ToggleButton, { id: "italic", pressed: italic.value, "onUpdate:pressed": (value: boolean) => { italic.value = value; } }, { default: text("Italic") }),
                h(Button, { id: "large", size: "large", material: "lacquer" }, { default: text("Large") }),
              ]),
              h("p", null, ["Read the ", h(Link, { id: "inline-link", href: "#guide" }, { default: text("guide") }), ", or ", h(Link, { id: "standalone-link", standalone: true, href: "#more" }, { default: text("more") }), "."]),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Fields" }, [
              h(Field, { label: "Email", help: "We only use it for receipts.", error: invalid ? "enter an address like name@example.com." : undefined, required: true, id: "email-field" }, {
                default: () => h(TextField, { ref: inputRef, type: "email", modelValue: email.value, "onUpdate:modelValue": (value: string) => { email.value = value; } }),
              }),
              h(Field, { label: "Name" }, { default: () => h(TextField, { "^value": "Ada" }) }),
              h(Field, { label: "Search", help: "Titles and tags." }, { default: () => h(TextField, { ref: wrappedRef, type: "search" }, { icon: close }) }),
              h(Field, { label: "Locked", disabled: true }, { default: () => h(TextField, { "^value": "Read only" }) }),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Choices" }, [
              h(Field, { help: "Required to continue.", error: choices.terms ? undefined : "accept the terms." }, {
                default: () => h(Checkbox, { id: "terms", modelValue: choices.terms, "onUpdate:modelValue": (value: boolean) => { choices.terms = value; } }, { default: text("I accept the terms") }),
              }),
              h(Checkbox, { id: "mixed", indeterminate: choices.mixed, onChange: () => { choices.mixed = false; } }, { default: text("Select all") }),
              h(Switch, { id: "wifi", modelValue: choices.wifi, "onUpdate:modelValue": (value: boolean) => { choices.wifi = value; } }, { default: text("Wi-Fi") }),
              h(Switch, { id: "airplane", disabled: true, reverse: true }, { default: text("Airplane mode") }),
              h(RadioGroup, { legend: "Plan", modelValue: choices.plan, "onUpdate:modelValue": (value: string) => { choices.plan = value; }, help: "You can change it later.", error: choices.plan ? undefined : "choose a plan.", required: true }, {
                default: () => [
                  h(Radio, { value: "free" }, { default: text("Free") }),
                  h(Radio, { value: "pro" }, { default: text("Pro") }),
                  h(Radio, { value: "team", disabled: true }, { default: text("Team") }),
                  h(Radio, { value: "enterprise" }, { default: text("Enterprise") }),
                ],
              }),
              h(Field, { label: "Size" }, {
                default: () => h(Select, { modelValue: choices.size, "onUpdate:modelValue": (value: string) => { choices.size = value; } }, { default: () => [option("s", "Small"), option("m", "Medium"), option("l", "Large")] }),
              }),
              h(Field, { label: "Volume", help: "0 to 100." }, {
                default: () => h(Slider, { min: 0, max: 100, step: 5, modelValue: choices.volume, "onUpdate:modelValue": (value: number) => { choices.volume = value; } }),
              }),
              h(Field, { label: "Notes" }, {
                default: () => h(TextArea, { modelValue: choices.notes, "onUpdate:modelValue": (value: string) => { choices.notes = value; }, resize: "none" }),
              }),
            ]),
            h(Panel, { title: "Status", id: "status-panel" }, {
              default: () => [
                h(Card, { title: "Latency", id: "latency-card" }, { default: text("p95 is 41 ms."), footer: () => h(Button, { id: "details" }, { default: text("Details") }) }),
                h(Divider, { id: "rule" }),
                h("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, [
                  h(ButtonGroup, { label: "View", orientation: "vertical", id: "view-group" }, { default: () => [h(Button, null, { default: text("List") }), h(Button, null, { default: text("Grid") })] }),
                  h(Divider, { orientation: "vertical", id: "vertical-rule" }),
                  h(Badge, { id: "inbox", variant: "accent", count: 120 }),
                  h(Badge, { id: "few", count: 7 }),
                ]),
                h(Spinner, { id: "loading", label: "Loading results", showLabel: true }),
                h(Button, { id: "saving", variant: "accent", busy: true }, { icon: () => h(Spinner, { decorative: true, label: "Saving", size: "small" }), default: text("Saving") }),
                h(Field, { label: "Upload", controlId: "upload-progress" }, { default: () => h(ProgressBar, { value: 40 }) }),
                h(ProgressBar, { id: "sync-progress", "aria-label": "Syncing" }),
              ],
            }),
            h(StrataScope, { depth: 0.1, density: "compact", size: "small", id: "scope", "aria-label": "Compact scope", role: "region" }, {
              default: () => h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Scoped" }, [h(Button, { id: "scoped" }, { default: text("Scoped") })]),
            }),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Tabs" }, [
              h(Tabs, { id: "live-tabs", modelValue: tab.value, "onUpdate:modelValue": (value: string) => { tab.value = value; } }, {
                default: () => [
                  h(TabList, { label: "Preferences" }, { default: () => [
                    h(Tab, { value: "general" }, { default: text("General") }),
                    h(Tab, { value: "privacy" }, { default: text("Privacy") }),
                    h(Tab, { value: "advanced", disabled: true }, { default: text("Advanced") }),
                    h(Tab, { value: "help" }, { default: text("Help") }),
                  ] }),
                  h(TabPanel, { value: "general" }, { default: text("General settings.") }),
                  h(TabPanel, { value: "privacy" }, { default: text("Privacy settings.") }),
                  h(TabPanel, { value: "advanced" }, { default: text("Advanced settings.") }),
                  h(TabPanel, { value: "help" }, { default: text("Help and feedback.") }),
                ],
              }),
              h(Tabs, { id: "manual-tabs", defaultValue: "one", orientation: "vertical", activation: "manual" }, {
                default: () => [
                  h(TabList, { label: "Manual" }, { default: () => [h(Tab, { value: "one" }, { default: text("One") }), h(Tab, { value: "two" }, { default: text("Two") })] }),
                  h(TabPanel, { value: "one" }, { default: text("First.") }),
                  h(TabPanel, { value: "two" }, { default: text("Second.") }),
                ],
              }),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Tables" }, [
              h(Table, { id: "live-table", caption: "Payments", columns: [{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true }, { key: "amount", header: "Amount", numeric: true, sortable: true }], rows: [{ number: 1003, customer: "Alan Turing", amount: 42 }, { number: 1001, customer: "Ada Lovelace", amount: 120 }, { number: 1002, customer: "Grace Hopper", amount: 87.5 }] }),
              h(Table, { id: "controlled-table", caption: "Controlled", columns: [{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true }, { key: "amount", header: "Amount", numeric: true, sortable: true }], rows: [{ number: 1003, customer: "Alan Turing", amount: 42 }, { number: 1001, customer: "Ada Lovelace", amount: 120 }, { number: 1002, customer: "Grace Hopper", amount: 87.5 }], sort: sort.value, "onUpdate:sort": (value: { key: string; direction: "ascending" | "descending" }) => { sort.value = value; } }),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Navigation" }, [
              h("p", { style: { display: "flex", gap: "12px", alignItems: "center", margin: "0" } }, [
                h(Avatar, { id: "avatar-small", name: "Ada Lovelace", size: "small" }), h(Avatar, { id: "avatar-medium", name: "Plato" }),
                h(Avatar, { id: "avatar-large", name: "  grace   brewster hopper ", size: "large" }),
                h("span", null, [h(Avatar, { id: "avatar-decorative", name: "Alan Turing", decorative: true, size: "small" }), " Alan Turing"]),
              ]),
              h("p", { style: { display: "flex", gap: "8px", alignItems: "center", margin: "0" } }, [
                h(Chip, { id: "tag-chip" }, { default: text("Design") }),
                h(Chip, { id: "remote-chip", pressed: chips.remote, "onUpdate:pressed": (value: boolean) => { chips.remote = value; } }, { default: text("Remote") }),
                h(Chip, { id: "locked-chip", defaultPressed: false, disabled: true }, { default: text("Locked") }),
                !chips.removed.includes("ada") && h(Chip, { id: "ada-chip", onRemove: () => { chips.removed.push("ada"); } }, { default: text("ada@example.com") }),
              ]),
              ...(["info", "success", "warning", "danger"] as const).map(intent => h(MessageBar, { key: intent, id: `message-${intent}`, intent }, { default: text(`A message of intent ${intent}.`) })),
              !messages.dismissed && h(MessageBar, { id: "message-live", intent: "danger", title: "Payment failed", onDismiss: () => { messages.dismissed = true; } }, {
                default: text("The card was declined."), actions: () => h(Button, { id: "message-retry", onClick: () => { messages.upgrades++; } }, { default: text("Retry") }),
              }),
              h("div", { id: "loading-region", "aria-busy": "true", style: { display: "flex", gap: "12px", alignItems: "center" } }, [
                h(Skeleton, { id: "skeleton-circle", shape: "circle" }), h(Skeleton, { id: "skeleton-lines", lines: 2, style: { flex: "1" } }),
              ]),
              h(Breadcrumb, { id: "live-breadcrumb", items: [{ label: "Home", href: "#home" }, { label: "Reports", href: "#reports" }, { label: "Latency", href: "#latency" }] }),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Lists" }, [
              h(List, { label: "Folders", id: "live-list" }, {
                default: () => [
                  h(ListItem, { href: "#inbox", current: "page", primary: "Inbox", secondary: "12 unread", end: "Now" }),
                  h(ListItem, { id: "archive-row", primary: "Archive", onClick: () => { rows.archive++; } }),
                  h(ListItem, { id: "locked-row", primary: "Locked", disabled: true, onClick: () => { rows.locked++; } }),
                  h(ListItem, { id: "storage-row", primary: "Storage", secondary: "4.2 GB of 15 GB used" }),
                ],
              }),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Accordions" }, [
              h(Accordion, { exclusive: true, id: "live-accordion" }, {
                default: () => [
                  h(AccordionItem, { id: "delivery", title: "Delivery", open: faq.delivery, "onUpdate:open": (open: boolean) => { faq.delivery = open; } }, { default: text("Two days.") }),
                  h(AccordionItem, { id: "warranty", title: "Warranty", open: faq.warranty, "onUpdate:open": (open: boolean) => { faq.warranty = open; } }, { default: text("Two years.") }),
                ],
              }),
              h(Accordion, { id: "free-accordion" }, {
                default: () => [
                  h(AccordionItem, { id: "first", title: "First", defaultOpen: true }, { default: text("One.") }),
                  h(AccordionItem, { id: "second", title: "Second" }, { default: text("Two.") }),
                ],
              }),
            ]),
            h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Overlays" }, [
              h(Button, { id: "open-live", onClick: () => { liveOpen.value = true; } }, { default: text("Open live dialog") }),
            ]),
          ]),
          h(Dialog, {
            ref: liveRef, open: liveOpen.value, title: "Live dialog", description: "Controlled by state.", class: "extra", id: "live-dialog",
            onClose: (reason: string) => { strataDialog.reasons.push(reason); liveOpen.value = false; },
          }, {
            default: () => h(TextField, { "aria-label": "Live field", id: "live-field" }),
            actions: () => h(Button, { id: "live-done", onClick: () => { liveOpen.value = false; } }, { default: text("Done") }),
          }),
        ],
      });
    };
  },
});

createApp(App).mount("#root");
