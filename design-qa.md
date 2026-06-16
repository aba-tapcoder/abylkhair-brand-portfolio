# Design QA

## Visual truth

- Homepage prototype: `qa/reference-home-v2.png`
- Case prototype: `qa/reference-case.png`
- Implemented homepage: `qa/home-desktop-cdp.png`
- Implemented Dala Camp case: `qa/dala-case-full-cdp.png`
- Side-by-side evidence: `qa/comparison-home.png`, `qa/comparison-case.png`

## Viewports and states

- Desktop: 1440 x 1100
- Mobile: 390 x 844
- Mobile navigation: closed and open
- Languages: Russian and Kazakh
- Case route: Russian and matching Kazakh route

## Surface review

- Typography: editorial serif display type and restrained sans-serif UI type match the approved direction.
- Layout: strong grid, large hero, compact metadata rows, alternating case compositions, and generous vertical rhythm are consistent across pages.
- Color: warm paper, black, muted gray, and project-specific accents are applied consistently.
- Imagery: optimized source assets remain sharp at their rendered sizes; project imagery is not stretched or distorted.
- Content: positioning avoids unsupported growth guarantees, presents the 4K method, and keeps the offer focused on building a usable brand system.

## Focused checks

- Homepage hero and project grid: passed.
- 4K method and deliverables: passed.
- Case research, strategy, and identity gallery: passed.
- Before/after, next project, and final WhatsApp CTA: passed.
- Mobile menu, language switch, and path preservation: passed.
- WhatsApp URL and prefilled localized messages: passed.
- Broken images and horizontal overflow: none found.

## Fixes made

- Removed mobile horizontal overflow at 390 px.
- Verified the mobile navigation opens, locks page scrolling, and closes correctly.
- Disabled reveal transitions only in the QA capture script so full-page screenshots represent the final rendered state.

## Result

Passed. No P0, P1, or P2 visual issues remain.
