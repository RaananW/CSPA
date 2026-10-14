## 2026-10-14 — Pond: smooth splash, visible koi, X-ray

- Water updates keep one running clock, so a pebble splash (and any slider change) no
  longer restarts the ripple. A pebble now rises over 0.14 s and eases back to the calm
  ripple over about 2.5 s instead of dropping from 12 px in one step.
- Fed koi gather in a slowly turning ring just outside the lily pad and face it, instead
  of hiding underneath.
- **X-ray** labels the plain HTML under the water (`<span>` koi, `<p>` text, `<i>`
  pebbles); the labels are refracted along with everything else.
