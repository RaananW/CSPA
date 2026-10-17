/**
 * Strata React check page (`ui-react.html`): the Tier A components and Tabs from `@underglass/ui/react`, in plain React
 * with no Underglass. `#contracts` renders each component exactly as its anatomy page's markup example, so the browser
 * test can compare them; the panels below are live controls the test drives with real input through
 * `window.strataBinding`.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Accordion, AccordionItem, AppBar, Avatar, Badge, Breadcrumb, Button, ButtonGroup, Card, Carousel, Checkbox, Chip, Dialog, Divider, Drawer, Field, IconButton, Link, List, ListItem, MessageBar, Menu, NavigationRail, Pagination, Panel, Popover, ProgressBar, Radio, RadioGroup, Rating, RatingDisplay, SegmentedControl, Select, Skeleton, Stepper, Slider, Spinner, StrataProvider, StrataScope, Switch, Tab, Table, TabList, TabPanel, Tabs, TextArea, TextField, ToggleButton, Toolbar, Tooltip, TreeView, toast } from "@underglass/ui/react";

const close = <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>;

/** Each anatomy page's markup example, rendered by the binding. */
function Contracts() {
  // A Dialog and a Drawer render only while open, so the test opens them (`window.strataOverlays`) to compare.
  const [overlays, setOverlays] = useState(false);
  const [tooltipHost, setTooltipHost] = useState<HTMLElement | null>(null);
  const [popoverHost, setPopoverHost] = useState<HTMLElement | null>(null);
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [dialogHost, setDialogHost] = useState<HTMLElement | null>(null), [drawerHost, setDrawerHost] = useState<HTMLElement | null>(null);
  useEffect(() => { Object.assign(window, { strataOverlays: setOverlays }); }, []);
  return (
    <div id="contracts" hidden>
      <div data-contract="button.md"><Button variant="accent" icon={null}>Save</Button></div>
      <div data-contract="icon-button.md"><IconButton label="Close" icon={null} /></div>
      <div data-contract="toggle-button.md"><ToggleButton>Bold</ToggleButton></div>
      <div data-contract="link.md"><Link href="/docs">Read the guide</Link></div>
      <div data-contract="field.md">
        <Field label="Email" controlId="email" help="We only use it for receipts." error="enter an address like name@example.com." required>
          <TextField />
        </Field>
      </div>
      <div data-contract="text-field.md"><TextField type="email" id="email" name="email" autoComplete="email" /></div>
      <div data-contract="text-field.md#2"><TextField icon={null} type="search" id="q" /></div>
      <div data-contract="text-area.md"><TextArea id="notes" name="notes" rows={3} /></div>
      <div data-contract="checkbox.md"><Checkbox name="news">Send me the newsletter</Checkbox></div>
      <div data-contract="radio.md">
        <RadioGroup legend="Plan" name="plan" defaultValue="free" help="You can change it later." error="choose a plan.">
          <Radio value="free">Free</Radio>
          <Radio value="pro">Pro</Radio>
        </RadioGroup>
      </div>
      <div data-contract="switch.md"><Switch name="wifi">Wi-Fi</Switch></div>
      <div data-contract="select.md">
        <Select id="size" name="size" defaultValue="">
          <option value="" disabled>Choose a size</option>
          <option value="s">Small</option>
          <option value="m">Medium</option>
        </Select>
      </div>
      <div data-contract="button-group.md"><ButtonGroup label="Alignment"><Button>Left</Button><Button>Centre</Button><Button>Right</Button></ButtonGroup></div>
      <div data-contract="divider.md"><Divider /><Divider orientation="vertical" /></div>
      <div data-contract="badge.md"><Badge variant="success">Active</Badge></div>
      <div data-contract="spinner.md"><Spinner label="Loading" /></div>
      <div data-contract="progress-bar.md"><label htmlFor="upload">Upload</label><ProgressBar id="upload" value={40} max={100} /></div>
      <div data-contract="card.md"><Card title="Latency" titleId="card-1-title" footer={null}>…</Card></div>
      <div data-contract="panel.md"><Panel title="Settings" titleId="settings-title" /></div>
      <div data-contract="dialog.md" ref={setDialogHost}>
        {dialogHost && (
          <Dialog open={overlays} container={dialogHost} title="Discard changes?" titleId="discard-title" description="Your edits will be lost." descriptionId="discard-description"
            actions={<Button data-strata-close="">Keep editing</Button>} />
        )}
      </div>
      <div data-contract="drawer.md" ref={setDrawerHost}>
        {drawerHost && (
          <Drawer open={overlays} container={drawerHost} title="Filters" titleId="filters-title" description="Narrow the list." descriptionId="filters-description"
            actions={<Button data-strata-close="">Done</Button>} />
        )}
      </div>
      <div data-contract="tabs.md">
        <Tabs id="account" defaultValue="profile">
          <TabList label="Account">
            <Tab value="profile">Profile</Tab>
            <Tab value="security">Security</Tab>
            <Tab value="billing" disabled>Billing</Tab>
          </TabList>
          <TabPanel value="profile"><p>Your name and photo.</p></TabPanel>
          <TabPanel value="security"><p>Your password and two-step sign-in.</p></TabPanel>
          <TabPanel value="billing"><p>Your plan and invoices.</p></TabPanel>
        </Tabs>
      </div>
      <div data-contract="accordion.md">
        <Accordion name="faq">
          <AccordionItem title="Shipping" defaultOpen><p>Orders ship within two days.</p></AccordionItem>
          <AccordionItem title="Returns"><p>Return any item within 30 days.</p></AccordionItem>
        </Accordion>
      </div>
      <div data-contract="list.md">
        <List label="Mailboxes">
          <ListItem href="/inbox" current="page" start="" primary="Inbox" secondary="12 unread" end="Now" />
          <ListItem primary="Archive" onClick={() => {}} />
          <ListItem primary="Storage" secondary="4.2 GB of 15 GB used" />
        </List>
      </div>
      <div data-contract="table.md"><Table caption="Invoices" columns={[{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true }, { key: "amount", header: "Amount", numeric: true }]} rows={[{ number: "1001", customer: "Ada Lovelace", amount: "120.00" }, { number: "1002", customer: "Grace Hopper", amount: "87.50" }]} defaultSort={{ key: "number", direction: "ascending" }} /></div>
      <div data-contract="table.md#2"><Table caption="Invoices" columns={[{ key: "number", header: "Number" }, { key: "customer", header: "Customer" }, { key: "amount", header: "Amount", numeric: true }]} rows={[{ number: "1001", customer: "Ada Lovelace", amount: "120.00" }]} sort={{ key: "number", direction: "ascending" }} /></div>
      <div data-contract="breadcrumb.md"><Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Settings", href: "/settings" }, { label: "Profile", href: "/settings/profile" }]} /></div>
      <div data-contract="avatar.md"><Avatar name="Ada Lovelace" /><Avatar name="Grace Hopper" src="/people/grace.jpg" /><Avatar name="Alan Turing" decorative /></div>
      <div data-contract="segmented-control.md"><SegmentedControl label="View" name="view" defaultValue="day" options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }]} /></div>
      <div data-contract="rating.md"><Rating label="Your rating" name="score" max={3} defaultValue={2} /><RatingDisplay value={4.5} /></div>
      <div data-contract="stepper.md"><Stepper label="Checkout progress" steps={["Cart", "Shipping", "Payment"]} current={1} /></div>
      <div data-contract="navigation-rail.md"><NavigationRail label="Main" items={[{ label: "Inbox", href: "/inbox" }, { label: "Drafts", href: "/drafts" }]} current="/inbox" /></div>
      <div data-contract="tree-view.md"><TreeView label="Files" items={[{ value: "src", label: "src", children: [{ value: "src/index.ts", label: "index.ts" }] }, { value: "readme", label: "README.md" }]} defaultExpanded={["src"]} defaultSelected="src/index.ts" /></div>
      <div data-contract="carousel.md"><Carousel label="Featured" slides={[<p>First</p>, <p>Second</p>, <p>Third</p>]} /></div>
      <div data-contract="chip.md"><Chip>Design</Chip><Chip defaultPressed>Remote</Chip><Chip onRemove={() => {}}>ada@example.com</Chip></div>
      <div data-contract="skeleton.md"><Skeleton shape="circle" /><Skeleton lines={3} /><Skeleton shape="rect" width="100%" height={120} /></div>
      <div data-contract="message-bar.md">
        <MessageBar intent="warning" title="Storage almost full" actions={<Button>Upgrade</Button>} onDismiss={() => {}}>You have used 95% of your space.</MessageBar>
      </div>
      <div data-contract="pagination.md"><Pagination page={4} count={10} href={page => `/items?page=${page}`} /></div>
      <div data-contract="toolbar.md">
        <Toolbar label="Formatting"><ToggleButton>Bold</ToggleButton><ToggleButton>Italic</ToggleButton><Divider orientation="vertical" /><Button>Undo</Button></Toolbar>
      </div>
      <div data-contract="app-bar.md">
        <AppBar title="Underglass" start={<IconButton label="Menu" icon={null} />} end={<Button>Sign in</Button>} />
      </div>
      <div data-contract="tooltip.md" ref={setTooltipHost}>
        {tooltipHost && <Tooltip id="copy-tip" content="Copies the address to the clipboard" container={tooltipHost}><IconButton label="Copy link" icon={null} /></Tooltip>}
      </div>
      <div data-contract="popover.md" ref={setPopoverHost}>
        {popoverHost && <Popover id="filters-popover" title="Filters" container={popoverHost} trigger={<Button>Filters</Button>} />}
      </div>
      <div data-contract="menu.md" ref={setMenuHost}>
        {menuHost && <Menu id="actions-menu" label="Actions" container={menuHost} trigger={<Button>Actions</Button>} items={[{ label: "Rename" }, "separator", { label: "Delete", disabled: true }]} />}
      </div>
      <div data-contract="slider.md"><Slider min={0} max={100} step={1} defaultValue={40} aria-label="Volume" /></div>
    </div>
  );
}

/** What the dialog check reads: the live Dialog's panel (the forwarded ref) and the reasons it was asked to close. */
const strataDialog = { panel: null as HTMLElement | null, reasons: [] as string[] };
Object.assign(window, { strataDialog });

function App() {
  const [liveOpen, setLiveOpen] = useState(false);
  const [clicks, setClicks] = useState({ save: 0, blocked: 0, disabled: 0, close: 0, submit: 0 });
  const [italic, setItalic] = useState(true);
  const [email, setEmail] = useState("");
  const [accent, setAccent] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState("general");
  const [faq, setFaq] = useState({ delivery: false, warranty: true });
  const [rows, setRows] = useState({ archive: 0, locked: 0 });
  const [page, setPage] = useState(1);
  const [appBar, setAppBar] = useState(0);
  const [toasts, setToasts] = useState(0);
  const [range, setRange] = useState("day");
  const [score, setScore] = useState(3);
  const [step, setStep] = useState(1);
  const [rail, setRail] = useState("#rail-inbox");
  const [popover, setPopover] = useState({ open: false, applied: 0 });
  const [tree, setTree] = useState<{ expanded: string[]; selected?: string }>({ expanded: ["docs"] });
  const [slide, setSlide] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [messages, setMessages] = useState({ upgrades: 0, dismissed: false });
  const [chips, setChips] = useState({ remote: false, removed: [] as string[] });
  const [sort, setSort] = useState<{ key: string; direction: "ascending" | "descending" } | undefined>(undefined);
  const [choices, setChoices] = useState({ terms: false, mixed: true, wifi: true, plan: "", size: "m", volume: 40, notes: "" });
  const choose = <K extends keyof typeof choices>(key: K, value: (typeof choices)[K]) => setChoices(current => ({ ...current, [key]: value }));
  const buttonRef = useRef<HTMLButtonElement>(null), inputRef = useRef<HTMLInputElement>(null), wrappedRef = useRef<HTMLInputElement>(null);
  const count = (key: keyof typeof clicks) => () => setClicks(current => ({ ...current, [key]: current[key] + 1 }));
  const invalid = email.length > 0 && !email.includes("@");
  Object.assign(window, { strataBinding: { clicks, italic, email, choices, refs: { button: buttonRef.current, input: inputRef.current, wrapped: wrappedRef.current }, setAccent, tab, setTab, faq, setFaq, rows, sort, setSort, chips, messages, page, setPage, appBar, toasts, range, score, rail, popover, tree, slide, chosen } });
  return (
    <StrataProvider theme={accent ? { colour: { accent } } : undefined}>
      <Contracts />
      <AppBar id="live-app-bar" style={{ margin: "24px 24px 0" }} title="Strata check" start={<IconButton id="app-menu" label="Menu" icon={close} />}
        end={<Button id="app-sign-in" onClick={() => setAppBar(current => current + 1)}>Sign in</Button>} />
      <main style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", padding: 24 }}>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Buttons">
          <form onSubmit={event => { event.preventDefault(); count("submit")(); }} className="ug-cluster">
            <Button ref={buttonRef} variant="accent" id="save" className="extra" style={{ marginRight: 4 }} data-testid="save" onClick={count("save")}>Save</Button>
            <Button id="blocked" aria-disabled="true" onClick={count("blocked")}>Unavailable</Button>
            <Button id="disabled" disabled onClick={count("disabled")}>Disabled</Button>
            <Button id="busy" busy>Saving</Button>
            <IconButton id="close" label="Close" icon={close} onClick={count("close")} />
            <ToggleButton id="bold" defaultPressed={false}>Bold</ToggleButton>
            <ToggleButton id="italic" pressed={italic} onPressedChange={setItalic}>Italic</ToggleButton>
            <Button id="large" size="large" material="lacquer">Large</Button>
          </form>
          <p>Read the <Link id="inline-link" href="#guide">guide</Link>, or <Link id="standalone-link" standalone href="#more">more</Link>.</p>
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Fields">
          <Field label="Email" help="We only use it for receipts." error={invalid ? "enter an address like name@example.com." : undefined} required id="email-field">
            <TextField ref={inputRef} type="email" value={email} onChange={event => setEmail(event.target.value)} />
          </Field>
          <Field label="Name">
            <TextField defaultValue="Ada" />
          </Field>
          <Field label="Search" help="Titles and tags.">
            <TextField ref={wrappedRef} type="search" icon={close} />
          </Field>
          <Field label="Locked" disabled>
            <TextField defaultValue="Read only" />
          </Field>
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Choices">
          <Field help="Required to continue." error={choices.terms ? undefined : "accept the terms."}>
            <Checkbox id="terms" checked={choices.terms} onChange={event => choose("terms", event.target.checked)}>I accept the terms</Checkbox>
          </Field>
          <Checkbox id="mixed" indeterminate={choices.mixed} onChange={() => choose("mixed", false)}>Select all</Checkbox>
          <Switch id="wifi" checked={choices.wifi} onChange={event => choose("wifi", event.target.checked)}>Wi-Fi</Switch>
          <Switch id="airplane" disabled reverse>Airplane mode</Switch>
          <RadioGroup legend="Plan" value={choices.plan} onChange={value => choose("plan", value)} help="You can change it later." error={choices.plan ? undefined : "choose a plan."} required>
            <Radio value="free">Free</Radio>
            <Radio value="pro">Pro</Radio>
            <Radio value="team" disabled>Team</Radio>
            <Radio value="enterprise">Enterprise</Radio>
          </RadioGroup>
          <Field label="Size">
            <Select value={choices.size} onChange={event => choose("size", event.target.value)}>
              <option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option>
            </Select>
          </Field>
          <Field label="Volume" help="0 to 100.">
            <Slider min={0} max={100} step={5} value={choices.volume} onChange={event => choose("volume", Number(event.target.value))} />
          </Field>
          <Field label="Notes">
            <TextArea value={choices.notes} onChange={event => choose("notes", event.target.value)} resize="none" />
          </Field>
        </section>
        <Panel title="Status" id="status-panel">
          <Card title="Latency" id="latency-card" footer={<Button id="details">Details</Button>}>p95 is 41 ms.</Card>
          <Divider id="rule" />
          <div className="ug-cluster">
            <ButtonGroup label="View" orientation="vertical" id="view-group"><Button>List</Button><Button>Grid</Button></ButtonGroup>
            <Divider orientation="vertical" id="vertical-rule" />
            <Badge id="inbox" variant="accent" count={120} />
            <Badge id="few" count={7} />
          </div>
          <Spinner id="loading" label="Loading results" showLabel />
          <Button id="saving" variant="accent" busy icon={<Spinner decorative label="Saving" size="small" />}>Saving</Button>
          <Field label="Upload" controlId="upload-progress"><ProgressBar value={40} /></Field>
          <ProgressBar id="sync-progress" aria-label="Syncing" />
        </Panel>
        <StrataScope depth={0.1} density="compact" size="small" id="scope" aria-label="Compact scope" role="region">
          <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Scoped">
            <Button id="scoped">Scoped</Button>
          </section>
        </StrataScope>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Tabs">
          <Tabs id="live-tabs" value={tab} onChange={setTab}>
            <TabList label="Preferences">
              <Tab value="general">General</Tab>
              <Tab value="privacy">Privacy</Tab>
              <Tab value="advanced" disabled>Advanced</Tab>
              <Tab value="help">Help</Tab>
            </TabList>
            <TabPanel value="general">General settings.</TabPanel>
            <TabPanel value="privacy">Privacy settings.</TabPanel>
            <TabPanel value="advanced">Advanced settings.</TabPanel>
            <TabPanel value="help">Help and feedback.</TabPanel>
          </Tabs>
          <Tabs id="manual-tabs" defaultValue="one" orientation="vertical" activation="manual">
            <TabList label="Manual">
              <Tab value="one">One</Tab>
              <Tab value="two">Two</Tab>
            </TabList>
            <TabPanel value="one">First.</TabPanel>
            <TabPanel value="two">Second.</TabPanel>
          </Tabs>
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Accordions">
          <Accordion exclusive id="live-accordion">
            <AccordionItem id="delivery" title="Delivery" open={faq.delivery} onOpenChange={open => setFaq(current => ({ ...current, delivery: open }))}>Two days.</AccordionItem>
            <AccordionItem id="warranty" title="Warranty" open={faq.warranty} onOpenChange={open => setFaq(current => ({ ...current, warranty: open }))}>Two years.</AccordionItem>
          </Accordion>
          <Accordion id="free-accordion">
            <AccordionItem id="first" title="First" defaultOpen>One.</AccordionItem>
            <AccordionItem id="second" title="Second">Two.</AccordionItem>
          </Accordion>
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Tables">
          <Table id="live-table" caption="Payments" columns={[{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true }, { key: "amount", header: "Amount", numeric: true, sortable: true }]} rows={[{ number: 1003, customer: "Alan Turing", amount: 42 }, { number: 1001, customer: "Ada Lovelace", amount: 120 }, { number: 1002, customer: "Grace Hopper", amount: 87.5 }]} />
          <Table id="controlled-table" caption="Controlled" columns={[{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true }, { key: "amount", header: "Amount", numeric: true, sortable: true }]} rows={[{ number: 1003, customer: "Alan Turing", amount: 42 }, { number: 1001, customer: "Ada Lovelace", amount: 120 }, { number: 1002, customer: "Grace Hopper", amount: 87.5 }]} sort={sort} onSortChange={setSort} />
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Navigation">
          <p className="ug-cluster">
            <Avatar id="avatar-small" name="Ada Lovelace" size="small" /><Avatar id="avatar-medium" name="Plato" /><Avatar id="avatar-large" name="  grace   brewster hopper " size="large" />
            <span><Avatar id="avatar-decorative" name="Alan Turing" decorative size="small" /> Alan Turing</span>
          </p>
          <p className="ug-cluster">
            <Chip id="tag-chip">Design</Chip>
            <Chip id="remote-chip" pressed={chips.remote} onPressedChange={remote => setChips(current => ({ ...current, remote }))}>Remote</Chip>
            <Chip id="locked-chip" defaultPressed={false} disabled>Locked</Chip>
            {!chips.removed.includes("ada") && <Chip id="ada-chip" onRemove={() => setChips(current => ({ ...current, removed: [...current.removed, "ada"] }))}>ada@example.com</Chip>}
          </p>
          {(["info", "success", "warning", "danger"] as const).map(intent => <MessageBar key={intent} id={`message-${intent}`} intent={intent}>A message of intent {intent}.</MessageBar>)}
          {!messages.dismissed && (
            <MessageBar id="message-live" intent="danger" title="Payment failed"
              actions={<Button id="message-retry" onClick={() => setMessages(current => ({ ...current, upgrades: current.upgrades + 1 }))}>Retry</Button>}
              onDismiss={() => setMessages(current => ({ ...current, dismissed: true }))}>The card was declined.</MessageBar>
          )}
          <div id="loading-region" aria-busy="true" className="ug-cluster">
            <Skeleton id="skeleton-circle" shape="circle" /><Skeleton id="skeleton-lines" lines={2} style={{ flex: 1 }} />
          </div>
          <p className="ug-cluster">
            <Button id="notify" onClick={() => toast({ message: "Message sent.", intent: "success", duration: 1500,
              action: { label: "Undo", onAction: () => setToasts(current => current + 1) } })}>Notify</Button>
            <Tooltip id="share-tip" content="Shares this page with your team"><Button id="share">Share</Button></Tooltip>
            <Menu id="live-menu" label="Actions" trigger={<Button id="menu-open">Actions</Button>} items={[{ label: "Rename", onSelect: () => setChosen(current => [...current, "Rename"]) }, { label: "Duplicate", onSelect: () => setChosen(current => [...current, "Duplicate"]) }, "separator", { label: "Archive", onSelect: () => setChosen(current => [...current, "Archive"]) }, { label: "Delete", disabled: true, onSelect: () => setChosen(current => [...current, "Delete"]) }]} />
            <Popover id="live-popover" title="Filters" trigger={<Button id="popover-open">Filters</Button>} onOpenChange={open => setPopover(current => ({ ...current, open }))}>
              <Checkbox id="popover-only">Open only</Checkbox>
              <Button id="popover-apply" onClick={() => setPopover(current => ({ ...current, applied: current.applied + 1 }))}>Apply</Button>
            </Popover>
          </p>
          <Toolbar label="Editing" id="live-toolbar">
            <Button id="tool-cut">Cut</Button><Button id="tool-copy" disabled>Copy</Button><Button id="tool-paste" aria-disabled="true">Paste</Button>
            <Divider orientation="vertical" /><ToggleButton id="tool-wrap">Wrap</ToggleButton>
          </Toolbar>
          <Pagination id="live-pagination" page={page} count={12} onPageChange={setPage} />
          <form id="range-form" onSubmit={event => event.preventDefault()}>
            <SegmentedControl id="live-segmented" label="Range" name="range" value={range} onChange={setRange} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }, { value: "year", label: "Year" }]} />
          </form>
          <form id="score-form" onSubmit={event => event.preventDefault()} className="ug-cluster" style={{ alignItems: "end" }}>
            <Rating id="live-rating" label="Quality" name="quality" value={score} onChange={setScore} />
            <RatingDisplay id="live-rating-display" value={score} />
          </form>
          <Stepper id="live-stepper" label="Checkout progress" steps={["Cart", "Shipping", "Payment", "Review"]} current={step} />
          <p className="ug-cluster">
            <Button id="stepper-back" onClick={() => setStep(current => Math.max(0, current - 1))}>Back</Button>
            <Button id="stepper-next" onClick={() => setStep(current => Math.min(3, current + 1))}>Next</Button>
          </p>
          <Stepper id="vertical-stepper" label="Setup" orientation="vertical" steps={["Account", "Team", "Billing"]} current={1} />
          <NavigationRail id="live-rail" label="Sections" current={rail} onNavigate={(href, event) => { event.preventDefault(); setRail(href); }}
            items={[{ label: "Inbox", href: "#rail-inbox", icon: close }, { label: "Drafts", href: "#rail-drafts", icon: close }, { label: "Sent", href: "#rail-sent" }]} />
          <Breadcrumb id="live-breadcrumb" items={[{ label: "Home", href: "#home" }, { label: "Reports", href: "#reports" }, { label: "Latency", href: "#latency" }]} />
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Lists">
          <List label="Folders" id="live-list">
            <ListItem href="#inbox" current="page" primary="Inbox" secondary="12 unread" end="Now" />
            <ListItem id="archive-row" primary="Archive" onClick={() => setRows(current => ({ ...current, archive: current.archive + 1 }))} />
            <ListItem id="locked-row" primary="Locked" disabled onClick={() => setRows(current => ({ ...current, locked: current.locked + 1 }))} />
            <ListItem id="storage-row" primary="Storage" secondary="4.2 GB of 15 GB used" />
          </List>
          <TreeView id="live-tree" label="Project" items={[{ value: "src", label: "src", children: [{ value: "src/app.ts", label: "app.ts" }, { value: "src/ui", label: "ui", children: [{ value: "src/ui/button.ts", label: "button.ts" }] }] }, { value: "docs", label: "docs", children: [{ value: "docs/guide.md", label: "guide.md" }] }, { value: "readme", label: "README.md" }]} expanded={tree.expanded} selected={tree.selected}
            onExpandedChange={expanded => setTree(current => ({ ...current, expanded }))} onSelect={selected => setTree(current => ({ ...current, selected }))} />
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Carousels">
          <Carousel id="live-carousel" label="Stories" index={slide} onIndexChange={setSlide}
            slides={[<p>Strata lights every face.</p>, <p>Objects travel when pressed.</p>, <p>Scenes settle with a spring.</p>]} />
        </section>
        <section className="ug-panel ug-stack" data-strata-face="raised" aria-label="Overlays">
          <Button id="open-live" onClick={() => setLiveOpen(true)}>Open live dialog</Button>
        </section>
      </main>
      <Dialog
        ref={element => { strataDialog.panel = element; }}
        open={liveOpen} onClose={reason => { strataDialog.reasons.push(reason); setLiveOpen(false); }}
        title="Live dialog" description="Controlled by state." className="extra" id="live-dialog"
        actions={<Button id="live-done" onClick={() => setLiveOpen(false)}>Done</Button>}
      >
        <TextField aria-label="Live field" id="live-field" />
      </Dialog>
    </StrataProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
