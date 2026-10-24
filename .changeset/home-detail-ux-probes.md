---
'@verdaccio/e2e-ui': minor
---

Add `homeDetailUxTests`, probes for the 9.x web UI: the home toolbar (filter kept in `?q=`, `?scope=`, no-match message), the package tab kept in `?tab=`, the step-by-step welcome card, `bun` and the `.npmrc` line in the install box, copy feedback, search results grouped by origin, the version link of each home list item and the "Publishing" tab of the settings dialog. Every test is off by default; enable them with `features.homeDetailUx`, or with `HOME_DETAIL_UX=true` in the bundled spec.

Existing tests now also pass against the 9.x UI while still passing against released ones: the sidebar keywords test scrolls the list into view (the install box is taller), the settings test expects at least two tabs, the language switch clicks the card's action area when it has one, and the change-password tests type a username only when the form asks for it.
