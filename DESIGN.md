# Xuanying.world Design System

## Positioning

`xuanying.world` is a Chinese editorial-style personal growth archive: a quiet place for writing, notes, learning experiments, and questions that are still developing.

The site should feel personal and deliberate rather than like a résumé template, SaaS landing page, or generic portfolio.

## Visual direction

- **Mood:** quiet, warm, observant, and forward-looking.
- **Composition:** editorial grids, ruled lines, generous whitespace, asymmetric text-led hierarchy.
- **Material:** paper-like light background with restrained botanical green accents.
- **Personality:** real writing and concrete activity carry the identity; decoration stays secondary.
- **Motion:** small, purposeful transitions only. Never add motion that competes with reading.

## Tokens

```css
--paper: #F6F8F1;
--paper-deep: #EEF3EA;
--ink: #17251D;
--green: #3D8B68;
--green-deep: #246044;
--green-pale: #DDEBDD;
--muted: #5F7066;
--line: #D7E2D7;
```

- Headings use the system serif stack already present in the site.
- Body copy uses the system Chinese sans stack.
- The main content width is approximately `1120px`; reading width is approximately `720px`.
- Borders are thin and low-contrast. Avoid heavy shadows and excessive rounded cards.

## Hierarchy

1. The homepage introduces the person and points to writing.
2. `文章` contains longer, more complete pieces.
3. `手记` contains shorter observations and current reflections.
4. Series pages provide context and sequence for related writing.
5. Contact remains secondary to the writing itself.

## Interaction rules

- Every interactive element must have a visible `:focus-visible` state.
- Use semantic links for navigation and buttons for actions.
- Mobile navigation must be keyboard operable and closable with `Escape`.
- Respect `prefers-reduced-motion`.
- Images are lazy-loaded, decode asynchronously, and remain readable on narrow screens.
- Do not hide primary navigation links on mobile merely to save space.

## Content boundaries

- Preserve the distinction between facts, current activities, and exploration.
- Do not invent majors, jobs, credentials, metrics, or achievements.
- Keep uncertain future direction broad and time-local.
- Prefer specific lived activities over abstract personal-brand slogans.

## Do / Don't

### Do

- Let article titles, summaries, and real images lead.
- Use lines, spacing, typography, and small labels to create rhythm.
- Keep the site usable without JavaScript wherever practical.
- Test the generated `outputs/` directory, not only `site/` source files.

### Don't

- Add purple-blue gradients, generic dashboard cards, or stock-person imagery.
- Turn every section into a rounded card.
- Add decorative interaction without a reading or navigation purpose.
- Present a temporary plan as a permanent identity claim.
