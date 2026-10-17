# Instrument spec notes: provisional values

**Status:** working list (2026-10-17) for the Instrument level's spec, PR 3 of the
[Instrument plan](instrument.md#pull-request-sequence). The [design language](design-language.md) (DL below) marks
every provisional value with a dagger (†), and the [Rendering Model](rendering-model.md#2d-instrument-version-4) (RM)
names its provisional rules in the text. Each comes from
the first prototype iteration ([I1](instrument-phase0.md#i1-prototype)), a Phase I0 probe, or a range proposed while
writing the spec. The second prototype iteration (the look iteration the owner asked for on 2026-10-17) confirms or
replaces each one; this list says where it is defined and what the iteration must measure, so the follow-up is a
mechanical edit. When a value is settled, its dagger goes and its row goes from this list.

**Rule for the follow-up:** change the value in the place named, remove its dagger, and record the change in the
design language's change log (or the Rendering Model's, for its rows). A changed value that alters an expected colour
of `instrument-4.json` is regenerated with the suite.

## Look values (the v2 prototype)

| Value | Where | Now | Source | What v2 confirms |
| --- | --- | --- | --- | --- |
| Instrument fill strength | DL §3, *Light at the Instrument level* | 0.35 (against `light.ambient` 0.55) | I1 | Whether Instrument needs its own fill default or scales `light.ambient` |
| `base.direct` of the metal presets | DL §3, §4 *Presets*, §19 | 0.2 | I1 | Brushed tops no longer vary with size and position, and still catch the key |
| `emitter.height` | DL §3 *Emitters* | lamp 0.7, LED 0.8 lens diameters; range 0.25–2 | I0.3 (20 px over 28, 8 over 10) | The pool's look on the face and bezel; the range |
| `emitter.strength` | DL §3 | lamp 3,200, LED 520; range 0–32,000 | I0.3 | Pool brightness on both themes, guard boxes not visible |
| `emitter.guardFeather` | DL §3; RM 2D.1 `protected.feather` | 4 px; range 0–16 | I0.3 | Protected text boxes read greyer under strong pools on the light theme: a wider feather or a dimmer near-text cap |
| Face-pool outset | DL §3 | 48 px | I0.3 | Whether 48 px cuts light visibly; a larger outset's cost |
| `glowOn` colour | DL §3, §4 roles | (255, 146, 40) | I1 lit ring | I0.3's lamp used (1, 0.72, 0.38), about (255, 184, 97): pick one amber for lamps and rings |
| `pointerLight.strength`, `radius`, `height`, `colour` | DL §3 *The pointer light* | 16,000; 360 px; 120 px; white; ranges 0–32,000, 60–1,000, 20–400 | I0.3 | Not on the I1 page at all (I0.6 could not measure it): add it, judge the pool and the travelling highlight |
| Studio tokens | DL §4 *Environment*; RM 2D.5 | key 12, keyRadius 0.24 rad, fill 1.2, front 0.12, strip 2.5, floor 0.03, ceiling 0.25, with their ranges | I0.4 `studioTokens` | Carried into the prototype as the owner asked; I1's own studio differs (a grey sweep, key 2.5, strip 0.7) |
| Page reflection on light faceplates | DL §4 *Environment* | Cube as I0.4 | I0.8 | Metal caps reflect a light faceplate almost white and erase the knob pointer: tune materials or the probe's strength |
| `lacquer` at Instrument | DL §4 *Presets* | (29, 29, 31), roughness 0.5, coat 1 at 0.03 | I0.4 | I1 used (16, 16, 18), roughness 0.38 |
| `glass` at Instrument | DL §4 *Presets*, *Glass*; RM 2D.5 defaults | `dispersion` 0.5 (spread 0.05), reflection roughness 0.02, rim tint (209, 230, 224) at 0.9 | I0.4 | Glass reads as glass: reflection in the refraction shader, magnification, rim, fringe; I1's dark glass cap (20, 24, 29) read as a smoked dome |
| `metal` (brushed aluminium) | DL §4 *Presets* | (239, 240, 241), roughness 0.3, `brush` 0.9, hairline `grain` 0.15 | I0.4 | I1 used (236, 237, 239) and brush 0.45; flat linear-brushed tops read too bright |
| `polished` | DL §4 *Presets* | (244, 245, 247), roughness 0.08 | I1 | — |
| `gunmetal` | DL §4 *Presets* | (104, 107, 114), roughness 0.36, `brush` 0.6 | I1 | — |
| `gold` | DL §4 *Presets* | (255, 219, 147), roughness 0.18 | I0.4 | I1 used (246, 214, 150), roughness 0.30, brush 0.6 |
| `chrome` | DL §4 *Presets* | (250, 250, 252), roughness 0.04 | I0.4 | — |
| Instrument role defaults | DL §4 roles; §19 *Premium* | `knobCap`, `faderCap`, `lever`, `rockerPlate` → `metal`; `knobSkirt` → `polished`; `plate` → `metal` light, `gunmetal` dark | I1 (moving parts in the cap material, fixed parts in the skirt material) | I1's bezels took `polished`, not the `plate` role's material: decide which role bezels follow |
| Knob numbers | DL §6 *Instrument object table* | Skirt Ø64, 2.5 high, 0.8 edge break; cap 0.8 × skirt, 16 high; chamfer 1.4; pointer 2 wide, 0.3–0.8 of r; dial box skirt + 76; ticks r + 5, numerals r + 20; 11 detents; detented 0.8 × size | I1 | Chamfer about 2 px (1.4 reads soft) |
| Fader numbers | DL §6 table | Travel 180; carriage 30 × 42, 12 high, taper 2.5, radius 3; box 46 wide; slot 5 | I1 | The carriage's brushed top too bright, white on dark |
| Slide numbers | DL §6 table | Box 64 × 28; block 24 × 20, 6 high, taper 1.5; travel 28 | I1 | Block top too bright |
| Rocker numbers | DL §6 table | Box 38 × 62; bezel 2 high; paddle 28 × 50, facets 10 / 5; ±11.3° | I1 | State reads only through facet shading head-on |
| Bat numbers | DL §6 table | Box 44 × 68; nut Ø22, 3 high; bushing Ø13, 7 high; lever 28, pivot 5, ball r 3.6; ±30° | I1 | A larger lever, or accept `slide` as the default |
| Wall numbers | DL §6 table | Box 66 × 92; plate 3 high, radius 6; paddle 30 × 54, 6 high; ±6° | I1 | Visible paddle motion head-on |
| Push-button numbers | DL §6 table | Box 56; cap Ø40, 6 high, taper 1.2; travel 2.5 held, 1.2 latched; bezel r 27 → 22.6; ring r 22.6 → 20.6 | I1 | Travel visible head-on (only the ring's brightness tells held from latched now) |
| Lamp and LED lens sizes | DL §6 table | 28 and 10 | I0.3 | Proportions in premium |
| Meter segments | DL §6 table | 16 | I0.1 | Set with the Meter component (Phase I4) |
| Objects per layer | DL §6 *Part budgets* | 256 | The plan's provisional budget; I0.1 settled parts, not objects | Measure with the 250-control page |
| `shadow.map.darkness` | DL §7; RM 2D.7 | 0.1, in the range 0–0.15 | I0.5 | A mapped shadow reads lighter than the face shadow beside it |
| Softness where a mapped streak meets the face shadow | DL §7 | Open | I0.5 | A visible change of softness at a plate's edge |
| I1's contact line (0.22 over 1.6 px) | Not in the spec | — | I1 | Whether an analytic contact line is part of the face shadow, or contact shadows stay a post option |
| Instrument hover | DL §11 | No pose change | Not prototyped | Whether premium hardware needs a hover cue beyond the cursor |
| Instrument disabled | DL §11 | Flattened to the face, as Objects | Not prototyped | Whether a disabled knob keeps its cap, dimmed |
| Springs | DL §12 | knob 420 / 41, detent 900 / 42, fader 420 / 41, slide 600 / 49, rocker 1,200 / 58, bat 1,400 / 45, wall 1,200 / 58, button 1,600 / 80 | I1 | **With poses clamped at the stops** (below) |
| Spring ranges | DL §12 | stiffness 50–4,000, damping 5–200 | Proposed | — |
| Premium defaults | DL §19 | Switch `slide`; faceplate by theme; lit ring plain emissive | I1 | The look sign-off |

## Proposed ranges (no measurement behind them)

These are the ranges a token needs for validation; they were proposed while writing the spec. The v2 prototype's
tuning bar should be able to reach both ends without breaking containment or the guard.

| Token | Range | Where |
| --- | --- | --- |
| `emitter.height`, `emitter.strength`, `emitter.guardFeather` | 0.25–2 diameters; 0–32,000; 0–16 px | DL §3 |
| `pointerLight.strength`, `radius`, `height` | 0–32,000; 60–1,000 px; 20–400 px | DL §3 |
| `studio.*` | As in the table | DL §4 |
| `knob.sweep`, `knob.dragPx`, `knob.fine`, `knob.tapSlop` | 90–330°; 50–1,000 px; 0.01–1; 1–12 px (the defaults are I0.7's, settled) | DL §14 |
| `spring.*` | stiffness 50–4,000; damping 5–200 | DL §12 |

## Rules the spec chose that the prototypes did not test

| Rule | Where | Why it needs a check |
| --- | --- | --- |
| **Poses are clamped at the stops,** and the velocity into a stop is dropped | DL §12; RM 2D.2 | I1's springs are not clamped: bat (damping ratio 0.60), detent (0.70), rocker and wall (0.84) overshoot their stops, and I1 checked containment only at rest. Clamping changes how a throw lands; v2 judges the look and re-runs containment mid-motion |
| **The guard limits the whole face change** in protected rects | DL §3; RM 2D.4 | I0.3 capped emitter light alone (text moved up to 0.44 levels beyond `interior.max`) |
| **A failing object is drawn as its Relief primitive** | DL §6; RM 2D.9 | The plan said "one level down"; an Instrument layer has one renderer |
| **Camera rule inset less 0.5 px** | DL §6; RM 2D.3 | Keeps 2D.9's 0.5 px margin by construction; at 1920 × 1080 the box rule's +1 px margin leaves `D` at 2,400 |
| **Part shadows and relief shadows combine by product** | RM 2D.7 | As the I0.5 probe drew them (analytic quads on the mesh pass over the relief result) |
| **Windows subtract the flat-pane Fresnel** and reflect only in finish zones and on the rim | DL §4 *Glass*; RM 2D.6 | The owner asked for reflection inside the refraction shader; I0.4 had a separate shell |
| **A layer with more than 64 text runs protects its whole box** | DL §3; RM 2D.1 | I0.3 never exceeded 10 runs per panel |
| **Custom parts take their material from their role;** a failing custom part is replaced by the built-in part | DL §6 *Custom parts* | Core work item 5 has not started |
| **The sampled tolerance, 12,** and the sample-placement rule (3 px, 4 levels per px, 24 levels apart) | RM 2D.10 | First checked when core's Instrument material runs `instrument-4.json` against Lite |

## Not yet measured (hardware and scale)

- **A low-end GPU:** the part budgets (2,048 per layer, 6,000 per stage, about 16 kinds), the 64-emitter budget, the
  default post chain's cost and the adjust policy's defaults (VAL-009) were measured on one RTX 3080 only.
- **The pointer light across gaps without a stage layer** (the probe lit a full-stage layer).
- **`subsurface`** has not been probed on Lite.
- **Emitter light on captured caps** (not lit in I0.3), and the pointer light's specular at Relief and Objects.
