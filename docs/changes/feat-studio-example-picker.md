## 2026-10-15 — Showcase: example picker in the live studio

- The live studio's header has an **Example** select listing every example. Choosing one switches
  in place through the same `#/id` hash route as the catalog cards, so visitors who jump straight
  to the studio ("Open the live studio") don't have to scroll back up to the catalog.
- Disabled after **Dispose example**, like the catalog cards. Wraps under the title on small screens.
- `npm run test:showcase` switches examples with it.
- Showcase only; no library change.
