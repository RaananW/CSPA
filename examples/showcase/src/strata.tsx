/**
 * Example 09, the Strata gallery: every Tier A, B and C component of `@underglass/ui`, from its React bindings, on
 * two Strata panels that are direct children of the Underglass root. `useStrataGpu` presents them on the GPU; with
 * GPU off they keep the CSS presentation. The bar's level and theme switches set `data-strata-level` and
 * `data-strata-theme` on the root, which the helper observes, so nothing is re-enrolled. Dialog and Drawer render
 * into the root as panels of their own; Tooltip, Toast, Popover and Menu live in the top layer, outside every layer.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGPUHost } from "@underglass/react";
import { strataBurst } from "@underglass/ui/gpu";
import {
  Accordion, AccordionItem, AppBar, Avatar, Badge, Breadcrumb, Button, ButtonGroup, Card, Carousel, Checkbox, Chip, Combobox, DatePicker, Dialog,
  Divider, Drawer, Field, IconButton, Link, List, ListItem, Menu, MessageBar, NavigationRail, Pagination, Panel, Popover, ProgressBar, Radio,
  RadioGroup, Rating, RatingDisplay, SegmentedControl, Select, Skeleton, Slider, Spinner, Stepper, Switch, Tab, Table, TabList, TabPanel, Tabs,
  TextArea, TextField, ToggleButton, Toolbar, Tooltip, TreeView, toast, useStrataGpu,
} from "@underglass/ui/react";
import { useSceneArt } from "./scene";

const levels = [["relief", "Relief"], ["objects", "Objects"], ["scene", "Scene"]] as const;
type Level = typeof levels[number][0];
const themes = [["light", "Light"], ["dark", "Dark"], ["contrast", "High contrast"]] as const;
type Theme = typeof themes[number][0];

const icon = (path: ReactNode) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;
const icons = {
  menu: icon(<path d="M3 4h10M3 8h10M3 12h10" />),
  close: icon(<path d="M4 4l8 8M12 4l-8 8" />),
  search: icon(<><circle cx="7" cy="7" r="4" /><path d="M10 10l3 3" /></>),
  star: icon(<path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 11l-3.4 1.9.7-3.8L2.5 6.5l3.8-.5z" />),
  inbox: icon(<path d="M2.5 9.5l1.5-6h8l1.5 6v3h-11zM2.5 9.5h3.5l1 1.5h2l1-1.5h3.5" />),
  draft: icon(<path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12zM9.5 4l2.5 2.5" />),
  send: icon(<path d="M2.5 7.5l11-5-4 11-2-4.5z" />),
};

const invoices = [
  { number: 1003, customer: "Alan Turing", amount: 42 },
  { number: 1001, customer: "Ada Lovelace", amount: 120 },
  { number: 1002, customer: "Grace Hopper", amount: 87.5 },
];

/** The gallery: an AppBar panel with the level and theme, and a panel of tabs over the component groups. */
export function StrataGallery() {
  const controller = useGPUHost();
  // The AppBar is a panel of its own, so it is presented as one slab across the top.
  const strata = useStrataGpu(controller, { panels: ".ug-panel, .ug-app-bar" });
  const [level, setLevel] = useState<Level>("relief");
  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTab] = useState("actions");
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [saves, setSaves] = useState(0);
  const celebrate = useRef<HTMLButtonElement>(null);
  // The root, read once the runtime has mounted (`container` throws during the first render): Dialog and Drawer render
  // into it.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  // No art for this example: its slot shrinks to one empty pixel under the bar.
  useSceneArt(() => ({ layout: { x: 0, y: 0, width: 1, height: 1, overflow: "hidden" }, content: null }), []);
  // The level and theme are scopes on the root, observed by the helper. They go when the example does.
  useEffect(() => {
    let element: HTMLElement | undefined;
    queueMicrotask(() => { element = controller.container; setRoot(element); });
    return () => { element?.removeAttribute("data-strata-level"); element?.removeAttribute("data-strata-theme"); };
  }, [controller]);
  useEffect(() => {
    root?.setAttribute("data-strata-level", level);
    root?.setAttribute("data-strata-theme", theme);
  }, [root, level, theme]);
  Object.assign(window, { strataShowcase: { level, theme, tab, saves, scene: (element: HTMLElement) => strata.current?.scene(element) } });
  return <>
    <AppBar id="strata-bar" className="strata-bar" title={<h3 className="strata-title">Strata</h3>}
      start={<Avatar name="Strata Gallery" size="small" decorative />}
      end={<>
        <ButtonGroup label="Presentation level">
          {levels.map(([value, label]) => <ToggleButton key={value} pressed={level === value} onPressedChange={() => setLevel(value)}>{label}</ToggleButton>)}
        </ButtonGroup>
        <Select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value as Theme)}>
          {themes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Tooltip id="celebrate-tip" content={level === "scene" ? "Bursts confetti over the UI, on the GPU" : "Confetti needs the Scene level and GPU mode"}>
          <Button ref={celebrate} variant="accent" onClick={() => void strataBurst(celebrate.current!)}>Celebrate</Button>
        </Tooltip>
      </>} />
    <Panel id="strata-gallery" className="strata-gallery" aria-label="Strata components">
      <Tabs id="strata-tabs" value={tab} onChange={setTab}>
        <TabList label="Component groups">
          <Tab value="actions">Actions</Tab>
          <Tab value="inputs">Inputs</Tab>
          <Tab value="choices">Choices</Tab>
          <Tab value="content">Content</Tab>
          <Tab value="feedback">Feedback</Tab>
          <Tab value="navigation">Navigation</Tab>
          <Tab value="structure">Structure</Tab>
        </TabList>
        <TabPanel value="actions"><Actions saves={saves} onSave={() => setSaves(count => count + 1)} /></TabPanel>
        <TabPanel value="inputs"><Inputs /></TabPanel>
        <TabPanel value="choices"><Choices /></TabPanel>
        <TabPanel value="content"><Content /></TabPanel>
        <TabPanel value="feedback"><Feedback onDialog={() => setDialog(true)} onDrawer={() => setDrawer(true)} /></TabPanel>
        <TabPanel value="navigation"><Navigation /></TabPanel>
        <TabPanel value="structure"><Structure /></TabPanel>
      </Tabs>
    </Panel>
    {root && <Dialog open={dialog} onClose={() => setDialog(false)} container={root} title="Discard changes?"
      description="Your edits to this draft will be lost." id="strata-dialog"
      actions={<><Button onClick={() => setDialog(false)}>Keep editing</Button><Button variant="accent" onClick={() => setDialog(false)}>Discard</Button></>} />}
    {root && <Drawer open={drawer} onClose={() => setDrawer(false)} container={root} side="end" closeOnScrim title="Filters"
      description="A click outside closes this drawer." id="strata-drawer" actions={<Button variant="accent" onClick={() => setDrawer(false)}>Done</Button>}>
      <Checkbox defaultChecked>Open issues</Checkbox>
      <Checkbox>Closed issues</Checkbox>
      <Field label="Owner"><TextField defaultValue="Ada" /></Field>
    </Drawer>}
  </>;
}

/** Two equal columns with a gap, for each tab's content. */
function Columns({ children }: { children: ReactNode }) {
  return <div className="strata-columns">{children}</div>;
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="strata-group" aria-label={title}><h4>{title}</h4>{children}</section>;
}

function Actions({ saves, onSave }: { saves: number; onSave(): void }) {
  return <Columns>
    <div>
      <Group title="Buttons">
        <p className="ug-cluster">
          <Button id="strata-save" variant="accent" onClick={onSave}>Save</Button>
          <Button>Cancel</Button>
          <Button disabled>Disabled</Button>
          <Button busy icon={<Spinner decorative label="Saving" size="small" />}>Saving</Button>
          <Button size="large" material="lacquer">Lacquer</Button>
        </p>
        <p id="strata-saves" role="status">Saved {saves} {saves === 1 ? "time" : "times"}</p>
      </Group>
      <Group title="Icon and toggle buttons">
        <p className="ug-cluster">
          <IconButton label="Close" icon={icons.close} />
          <IconButton label="Search" icon={icons.search} />
          <ToggleButton defaultPressed>Bold</ToggleButton>
          <ToggleButton>Italic</ToggleButton>
          <IconButton label="Star" icon={icons.star} />
        </p>
      </Group>
      <Group title="Links">
        <p>Read the <Link href="#/strata">design language</Link>, or open <Link standalone href="#/strata">every anatomy page</Link>.</p>
      </Group>
    </div>
    <div>
      <Group title="Button group">
        <ButtonGroup label="Alignment"><Button>Left</Button><Button>Centre</Button><Button>Right</Button></ButtonGroup>
      </Group>
      <Group title="Toolbar">
        <Toolbar label="Formatting">
          <ToggleButton>Bold</ToggleButton><ToggleButton>Italic</ToggleButton><ToggleButton>Underline</ToggleButton>
          <Divider orientation="vertical" /><Button>Undo</Button><Button disabled>Redo</Button>
        </Toolbar>
      </Group>
    </div>
  </Columns>;
}

function Inputs() {
  const [email, setEmail] = useState("ada@");
  const [volume, setVolume] = useState(40);
  const invalid = email.length > 0 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return <Columns>
    <div>
      <Field label="Email" help="We only use it for receipts." error={invalid ? "enter an address like name@example.com." : undefined} required>
        <TextField id="strata-email" type="email" value={email} onChange={event => setEmail(event.target.value)} />
      </Field>
      <Field label="Search" help="Titles and tags."><TextField type="search" icon={icons.search} placeholder="Find a component" /></Field>
      <Field label="Locked" disabled><TextField defaultValue="Read only" /></Field>
      <Field label="Fruit" help="Type one, or choose a suggestion."><Combobox options={["Apple", "Apricot", "Banana", "Cherry"]} defaultValue="Apricot" /></Field>
    </div>
    <div>
      <Field label="Size">
        <Select defaultValue="m"><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></Select>
      </Field>
      <Field label="Volume" help={`${volume} of 100.`}>
        <Slider min={0} max={100} step={5} value={volume} onChange={event => setVolume(Number(event.target.value))} />
      </Field>
      <Field label="Notes"><TextArea rows={3} defaultValue="Strata is one design language for CSS and the GPU." resize="none" /></Field>
      <Field label="Due date"><DatePicker min="2026-01-01" max="2026-12-31" defaultValue="2026-10-17" /></Field>
    </div>
  </Columns>;
}

function Choices() {
  const [chips, setChips] = useState(["ada@example.com", "grace@example.com"]);
  const [score, setScore] = useState(4);
  return <Columns>
    <div>
      <Group title="Checkboxes and switches">
        <Checkbox defaultChecked>Send me the newsletter</Checkbox>
        <Checkbox indeterminate>Select all</Checkbox>
        <Checkbox disabled>Unavailable</Checkbox>
        <Switch defaultChecked>Wi-Fi</Switch>
        <Switch>Airplane mode</Switch>
      </Group>
      <SegmentedControl label="View" options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} defaultValue="week" />
    </div>
    <div>
      <RadioGroup legend="Plan" name="strata-plan" defaultValue="pro" help="You can change it later.">
        <Radio value="free">Free</Radio>
        <Radio value="pro">Pro</Radio>
        <Radio value="team" disabled>Team</Radio>
      </RadioGroup>
      <Group title="Chips and tags">
        <p className="ug-cluster">
          <Chip>Design</Chip>
          <Chip defaultPressed>Remote</Chip>
          <Chip defaultPressed={false}>Full time</Chip>
          {chips.map(chip => <Chip key={chip} onRemove={() => setChips(current => current.filter(item => item !== chip))}>{chip}</Chip>)}
        </p>
      </Group>
      <p className="ug-cluster"><Rating label="Your rating" value={score} onChange={setScore} /><RatingDisplay value={score} /></p>
    </div>
  </Columns>;
}

function Content() {
  const [loading, setLoading] = useState(false);
  return <Columns>
    <div>
      <Card title="Latency" footer={<Button>Details</Button>}>
        <p className="ug-cluster">p95 is 41 ms. <Badge variant="success">Healthy</Badge> <Badge variant="accent" count={120} /></p>
      </Card>
      <Divider />
      <p className="ug-cluster">
        <Avatar name="Ada Lovelace" size="small" /><Avatar name="Grace Hopper" /><Avatar name="Alan Turing" size="large" />
        <Switch checked={loading} onChange={event => setLoading(event.target.checked)}>Loading</Switch>
      </p>
      {loading
        ? <div aria-busy="true" className="ug-cluster"><Skeleton shape="circle" /><Skeleton lines={2} style={{ flex: 1 }} /></div>
        : <List label="Folders">
          <ListItem href="#/strata" current="page" primary="Inbox" secondary="12 unread" end="Now" />
          <ListItem primary="Archive" onClick={() => toast({ message: "Archive opened." })} />
          <ListItem primary="Storage" secondary="4.2 GB of 15 GB used" />
        </List>}
    </div>
    <div>
      <Table caption="Invoices" columns={[{ key: "number", header: "Number", sortable: true }, { key: "customer", header: "Customer", sortable: true },
        { key: "amount", header: "Amount", numeric: true, sortable: true }]} rows={invoices} />
    </div>
  </Columns>;
}

function Feedback({ onDialog, onDrawer }: { onDialog(): void; onDrawer(): void }) {
  const [progress, setProgress] = useState(40);
  return <Columns>
    <div>
      {(["info", "success", "warning"] as const).map(intent => <MessageBar key={intent} intent={intent}>A message of intent {intent}.</MessageBar>)}
      <MessageBar intent="danger" title="Payment failed" actions={<Button onClick={() => toast({ message: "Retrying the payment.", intent: "info" })}>Retry</Button>}>
        The card was declined.</MessageBar>
    </div>
    <div>
      <Group title="Progress">
        <p className="ug-cluster"><Spinner label="Loading results" showLabel /></p>
        <Field label="Upload" help={`${progress}%`}><ProgressBar value={progress} /></Field>
        <p className="ug-cluster"><Button onClick={() => setProgress(value => (value >= 100 ? 0 : value + 20))}>Advance</Button></p>
      </Group>
      <Group title="Overlays">
        <p className="ug-cluster">
          <Button onClick={() => toast({ message: "Message sent.", intent: "success", action: { label: "Undo", onAction: () => toast({ message: "Undone." }) } })}>Show a toast</Button>
          <Tooltip id="share-tip" content="Shares this page with your team"><Button>Share</Button></Tooltip>
          <Button onClick={onDialog}>Open dialog</Button>
          <Button onClick={onDrawer}>Open drawer</Button>
          <Popover trigger={<Button>Filters</Button>} title="Filters"><Checkbox defaultChecked>Open only</Checkbox></Popover>
        </p>
      </Group>
    </div>
  </Columns>;
}

function Navigation() {
  const [page, setPage] = useState(4);
  const [step, setStep] = useState(1);
  return <Columns>
    <div>
      <Group title="Breadcrumb">
        <Breadcrumb items={[{ label: "Home", href: "#/layers" }, { label: "Examples", href: "#examples" }, { label: "Strata", href: "#/strata" }]} />
      </Group>
      <Group title="Pagination">
        <Pagination page={page} count={12} onPageChange={setPage} />
      </Group>
      <Group title="Stepper">
        <Stepper label="Checkout progress" steps={["Cart", "Shipping", "Payment", "Review"]} current={step} />
        <p className="ug-cluster">
          <Button onClick={() => setStep(current => Math.max(0, current - 1))}>Back</Button>
          <Button onClick={() => setStep(current => Math.min(3, current + 1))}>Next</Button>
          <Menu trigger={<Button>Actions</Button>} label="Actions" items={[{ label: "Rename", onSelect: () => toast({ message: "Renamed." }) },
            { label: "Duplicate", onSelect: () => toast({ message: "Duplicated." }) }, "separator", { label: "Delete", disabled: true }]} />
        </p>
      </Group>
    </div>
    <div>
      <Accordion exclusive>
        <AccordionItem title="What is Strata?" defaultOpen><p>One 3D design language for CSS and the GPU, from the same tokens.</p></AccordionItem>
        <AccordionItem title="Does it need Underglass?"><p>No. Without it, every component is plain HTML and CSS.</p></AccordionItem>
        <AccordionItem title="What does the GPU add?"><p>Lit faces, objects that travel when pressed, and a scene around them.</p></AccordionItem>
      </Accordion>
    </div>
  </Columns>;
}

function Structure() {
  const [place, setPlace] = useState("#inbox");
  return <Columns>
    <div className="strata-structure">
      <NavigationRail label="Mail" current={place} onNavigate={(href, event) => { event.preventDefault(); setPlace(href); }}
        items={[{ label: "Inbox", href: "#inbox", icon: icons.inbox }, { label: "Drafts", href: "#drafts", icon: icons.draft }, { label: "Sent", href: "#sent", icon: icons.send }]} />
      <TreeView label="Files" defaultExpanded={["src"]} defaultSelected="src/index.ts" items={[
        { value: "src", label: "src", children: [{ value: "src/index.ts", label: "index.ts" }, { value: "src/theme.ts", label: "theme.ts" }] },
        { value: "docs", label: "docs", children: [{ value: "docs/guide.md", label: "guide.md" }] },
        { value: "readme", label: "README.md" },
      ]} />
    </div>
    <div>
      <Carousel label="Featured" slides={[
        <Card key="relief" title="Relief"><p>Faces lit from one light, from the tokens.</p></Card>,
        <Card key="objects" title="Objects"><p>Keys that travel when pressed.</p></Card>,
        <Card key="scene" title="Scene"><p>A lit stage around the panels.</p></Card>,
      ]} />
    </div>
  </Columns>;
}
