# The rules

This is the payload of the kit. The CSS saves typing; the rules save you from
re-making the mistakes below, each of which was made and then found in a real
plugin.

A panel in this app is a **heads-up display for something you do with a guitar
in your hands**, not a preferences sheet in a settings app. Everything here
follows from that one sentence.

**Look at [`assets/gallery.html`](assets/gallery.html) before reading further.**
Every component in every state is on one page, and it carries the two buttons
that prove the rules the prose can only assert: *No devices* strips the glow,
the gradient and the shadows the way a glow-less shop skin does, and *Still*
kills the motion. Serve it from any consuming plugin:
`/api/plugins/<id>/assets/gallery.html`.

---

# Part 1 — Foundations

Three scales. Nothing in the kit uses a value that is not on one of them, and
a test reads the stylesheet and fails on any stray pixel.

Before them the CSS used 10, 11, 12, 13 and 20px type with 6, 7, 8, 9, 10, 11,
12 and 15px spacing, each picked per rule. That is exactly what "approximate"
looks like from a metre away, and it is invisible while you are writing it and
obvious the moment you see two rows side by side.

## 1.1 Type — five steps

| Token | Value | For |
| --- | --- | --- |
| `--fbk-t-display` | 22 / 800 / −0.01em | the one big number in a panel |
| `--fbk-t-value` | 16 / 800 / 0, tabular | inline readouts — a stepper's value, a meter's percentage |
| `--fbk-t-body` | 13 / 500 | prose, a plate's title |
| `--fbk-t-label` | 11 / 700 / 0.01em | control labels, button text |
| `--fbk-t-micro` | 10 / 800 / 0.1em, uppercase | section headings, key caps, units |

**No element may invent a sixth step.** A `font` shorthand cannot carry
letter-spacing, so each step is a pair — `--fbk-t-X` and `--fbk-t-X-track` —
and a component that needs one sets both. The five `.fbk-t-*` helper classes
exist for the rare element that is only type.

Two deliberate exceptions, both inside a component rather than free-floating:
a panel title and a button use the label step at 13/12px because a heading and
a button are not the same object as a form label, and a readout's unit borrows
the micro step's size and weight but **not** its 0.1em tracking — at that
tracking the trailing space pushed the unit away from its number and `85 %`
read as two things.

## 1.2 Space — a 2px base, six steps

`--fbk-s-1` 2 · `--fbk-s-2` 4 · `--fbk-s-3` 6 · `--fbk-s-4` 10 · `--fbk-s-5` 14
· `--fbk-s-6` 20

**No margin, padding or gap in the kit is a number.** Every one is
`var(--fbk-s-N)`.

## 1.3 Height — three, and no others

`--fbk-h-sm` 26 (chip, small button, icon button, meter row) ·
`--fbk-h-md` 32 (segmented cell, stepper, standard button, slider) ·
`--fbk-h-lg` 44 (the one primary)

**Every interactive control is exactly one of the three**, and `.fbk-row` has
`min-height: var(--fbk-h-md)` so a row holding only a label occupies the same
band as a row holding a stepper. That is where vertical rhythm comes from —
not from margins.

**On a coarse pointer the whole scale changes** — 32 · 44 · 52 — because a
fingertip is a different physical problem from a mouse, not the same one
larger. `src/theme.js` swaps it, so a consumer never asks: reference `h-md`
and the control is 32px under a mouse and 44px under a thumb. §17 has the
reasoning and the reason it is a scale swap rather than a per-control one.

## 1.4 One label column

`--fbk-label-w` is 62px and **every** inline label shares it. Before that, each
row's control started wherever its own label happened to end, and four
different start positions in a 336px panel read as sloppiness even when
nothing else was wrong.

A label that does not fit becomes a `.fbk-label` **above** its control. It does
not widen the column. (This is why Riff Repeater's "Playhead" row is labelled
`Mark`: the longer word did not fit, and shortening the word was the right fix
rather than moving the column for one row.)

## 1.5 Geometry is allowed to be geometry

A toggle's 13px knob inside its 19px track with a 15px travel, a slider's 6px
rail and 15px thumb, an 8px meter: those are **one shape each**, not three
spacing decisions, and putting them on the space scale would make the shape
wrong at every step but one. The test's allowlist names them, so adding a new
one is a deliberate act rather than a drift.

---

# Part 2 — The rules

## 1. One control family per meaning, and the families must not collide

Four families. There are no others.

| Family | Question it answers | Class |
| --- | --- | --- |
| **Segmented** | pick **one** of a small fixed set | `.fbk-seg` |
| **Chips** | pick a **subset**, possibly many | `.fbk-chips` |
| **Toggle** | a boolean | `.fbk-toggle` |
| **Stepper** | a number you nudge | `.fbk-stepper` |

> **Found the hard way.** Riff Repeater 0.2 drew the drill's speed *ladder* (a
> subset) and the playback *speed* (one of a set) as the same rail of pills
> carrying the same five numbers. Two different things wearing one costume is
> the single most confusing thing a panel can do, and no amount of labelling
> fixed it — the shapes had to differ.

**No text inputs.** A number you type reads as a form; a number you nudge reads
as a game option. Values a stepper cannot reach belong on the plugin's settings
page, which is a form and should look like one.

## 2. One lit primary, on its own line

Exactly one thing in a panel is accent-filled and glowing: the action the panel
exists for. Everything else is a quiet secondary or a text button.

It goes on its own line. Sharing a row with two siblings makes it read weaker
than whatever segmented control sits above it — which is what happened, and
what a reviewer reported.

When the primary's job inverts (Start → Stop), the replacement takes **the same
slot and the same size** and only changes hue. The thing you press to stop must
be exactly as findable as the thing you pressed to start.

## 3. A data signal never looks like a selection signal

Pick one channel per meaning and do not reuse it:

- **selection** → an outline, a bracket, or a filled segment
- **measured data** (accuracy, progress) → a fill or a meter, using
  `--fbk-meter-fill` and the good/mid/bad roles
- **cleared / reached the target** → green, and **nothing else is green**

> **Found the hard way.** Section chips carried an accuracy underline in
> green/amber/red while selection was an accent border. A reviewer read the
> amber underline as a second kind of "selected" and counted it among "five
> different button styles". Colour was doing two jobs on one element.

## 4. No paragraph of explanation, and no box drawn to hold one

- a caveat is a **badge** with the sentence in its `title`
- a *blocked* action explains itself on the control it blocks, plus a status
  dot for the input it needs
- a *failed* action gets a line that clears itself, because a failure is an
  event and not a state
- everything else goes in a `title`

Vertical space in a panel you read while playing is the scarcest thing you
have. Riff Repeater lost 144px of height and two bordered boxes by moving four
paragraphs into tooltips, and read better for it.

## 5. Turn settings into readouts wherever they overlap

The best control in Riff Repeater is its speed ladder, because it does two jobs
with one widget: idle it is the setting (tick the speeds to climb), running it
is the progress display (the current rung filled, cleared rungs green, the rest
waiting). One extra CSS class, no second widget, and the panel stops being a
form the moment anything is happening.

Look for this everywhere. A setting that can show its own state should.

## 6. Devices live in slots, and `none` is a legal value

This is the app's own rule, from `docs/host-theme-contract.md`, and the kit
implements it because the host has not yet:

> A feature may reference a colour **role** or a recipe **slot**. It may never
> write a raw device — no literal glow `box-shadow`, no literal
> `linear-gradient`, no hex.

So: never write `box-shadow: 0 0 12px #0ea5e9`. Write
`box-shadow: var(--fbk-emph-halo)`. The default fills that slot with a glow,
because the app's default look is a neon-ish sky-on-navy. A glow-less skin
(the shop sells one) fills it with `none` and a solid border instead — and the
control degrades **intentionally** rather than vanishing.

The slots are listed in `assets/kit.css`. The rule they enforce: a device that
resolves to `none` must leave its control still legible and still obviously
interactive.

## 7. Numbers big, words few

Body text 13px, labels 11px, and **numbers a readout**: 18–22px, tabular, with
the unit small beside them. A HUD is read at a glance from a metre away with
your hands full. The first version of Riff Repeater set everything at 10–12px
and looked like a form because of it, before a single control changed.

## 8. Match the app's furniture

The app is already game-shaped and the kit should not invent a second
language:

- the player rail is a column of **circular icon buttons** — so the kit's
  steppers and icon buttons are circles
- the transport is **pills** and one big round play button
- the player is a near-black **stage** with a lit highway — so a panel over it
  is an object with depth: a top inner light line and a real shadow, not a
  1px hairline
- accuracy is green / amber / red in the host's own palette (`good` / `mid` /
  `low`) — use those roles, do not invent thresholds

## 9. The panel is parked, never anchored

Top-right, `64px / 12px`, portalled to `<body>`, above `#player`. Not because
it looks better there but because the two plugins that tried anchoring both
came back:

- a panel inside the player's scrolling `<main>` is **clipped by that element**
  rather than by the screen
- a panel pinned by one edge can only grow from the other, so changing a
  control **moves the whole thing**
- and anchored to the rail it sits **over the notes**

Three plugins in the same corner read as one app. The kit's `panel.js` does it
and deletes the placement code.

**Layer, measured not guessed:** `#player` is `position: fixed; inset: 0;
z-index: 100`, so anything under 100 at body level is *behind the player* —
a panel at z-45 is positioned perfectly and invisible. Rail popovers are 40,
minigames 60, the guided-tour menu 200/201, `note_detect`'s drill HUD 210, the
tuner button 1001. The kit parks at **150**: over the player, under everything
that must cover it.

## 10. No animation a panel's legibility depends on

The kit fades nothing in. An opacity transition on a panel left one frozen at
0.8 opacity in an embedded webview — indefinitely, with the highway showing
through its text. Transitions are for hover and for state on small controls,
where not completing costs nothing.

`--fbk-motion` is the only place decorative timing is named, and it resolves to
`none` under `prefers-reduced-motion` so no consumer can forget the gate.

---

# Part 3 — Component reference

Every class, its height, its type step, and — the part that matters — when
**not** to reach for it.

## Shell

| Class | | |
| --- | --- | --- |
| `.fbk-panel` | 336px, `76vh` max, z-150, parked top-right | not for anything that must scroll with the page |
| `.fbk-head` | sticky, `h-md`-ish, holds `.fbk-title` + `.fbk-subtitle` + `.fbk-x` | the subtitle truncates; do not put a control in it |
| `.fbk-body` | `s-4`/`s-5` padding | |
| `.fbk-section` + `.fbk-section-title` + `.fbk-section-rule` | micro step, hairline finishes the row | a section per three-or-more rows; two rows do not need one |

## Structure

| Class | | |
| --- | --- | --- |
| `.fbk-row` | `min-height: h-md`, `gap: s-3`, wraps | |
| `.fbk-row-tight` | no min-height | for a row of `-small` buttons under a primary |
| `.fbk-label` | micro, block, above its control | when the label is long or the control is full-width |
| `.fbk-label-inline` | micro, fixed `label-w` | when it fits; never widen the column for one row |
| `.fbk-push` | `margin-left: auto` | |
| `.fbk-note` | body step at 11px, dim | **only** to explain a control that is not working |
| `.fbk-fold` | a heading whose body is shut, value in the head | **only** for policy — never for the job the panel is for |
| `.fbk-field` | label line above a full-width control | when the control is one of a stack of same-shaped rows and the rhythm is worth more |
| `.fbk-slider-full` | the track at 100%, value on the label line | a slider that is one field among several — keep the row shape there |

## The four families

| Class | Height | Question | Not for |
| --- | --- | --- | --- |
| `.fbk-seg` / `.fbk-seg-btn` + `.fbk-on` | `h-md` | pick **one** of a small fixed set | more than about five cells — use chips |
| `.fbk-chips` / `.fbk-chip` + `.fbk-on` `.fbk-now` `.fbk-done` | `h-sm` | pick a **subset** | a mutually-exclusive choice — that is segmented |
| `.fbk-chips-rail` | | the same, on a track, doubling as progress | an unordered set: a rail implies sequence |
| `.fbk-toggle` | `h-sm` | a boolean | a choice with a default worth naming — use segmented |
| `.fbk-stepper` / `.fbk-step` | `h-md` / `h-sm` circles | a number you nudge | a range you sweep — use the slider |
| `.fbk-stepper-wide` | | the same, with room for a word unit | |

The chips' four states must stay visually ranked: `now` loudest (filled +
halo), `done` green, `on` an accent outline, unset a quiet outline. A reader
has to be able to order them at a glance.

## Values

| Class | | |
| --- | --- | --- |
| `.fbk-slider` | `h-md`, a real `<input type="range">` | keep it an input — that is what a keyboard operates |
| `.fbk-readout` + `-value` + `-unit` | value step, tabular | |
| `.fbk-readout-lg` | display step | **one** per panel, or it stops being the big number |
| `.fbk-plate` + `-title` + `-meta` | body / label | the facts about whatever is selected |
| `.fbk-meter` + `[data-band]` + `--fbk-fill` | 8px | measured data only, never selection |
| `.fbk-meter-row` + `-name` + `-value` | `h-sm` | clickable by default; give it an `onClick` or use a `div` |

## Buttons

| Class | Height | |
| --- | --- | --- |
| `.fbk-btn` | `h-md` | the secondary tier — the default |
| `.fbk-btn-primary` + `.fbk-btn-label` | `h-lg`, full width | **one per panel**, on its own line |
| `.fbk-btn-stop` | `h-lg`, full width | the primary's inverse: same slot, same size, different hue |
| `.fbk-btn-small` | `h-sm` | a supporting row |
| `.fbk-btn-quiet` | | borderless until hover — never for anything you want found |

A primary carrying a status dot and a key cap lays them out
`space-between`: dot leading, `.fbk-btn-label` centred, cap trailing. Without
the label class all three huddle in the middle of an empty bar.

## Small parts

| Class | | |
| --- | --- | --- |
| `.fbk-badge` / `.fbk-badge-bad` | 20px, `cursor: help` | a caveat, with the sentence in `title`. Never a box of prose |
| `.fbk-dot` `[data-state=ready\|warn\|off]` | 8px | the state of an input, inside the control that needs it |
| `.fbk-kbd` | 18px | a shortcut that is really registered with `window.registerShortcut` |
| `.fbk-flash` | | why something just **failed**. Clears itself |
| `.fbk-empty` | | nothing to show yet — not an error, so quiet |

## Disabled

One treatment for everything: `opacity: var(--fbk-disabled-opacity)`, no halo,
no filter. It was per-component before — `opacity: 0.4` here,
`filter: saturate(0.4)` there — and the disabled primary came out a muddy
grey-blue that read as broken rather than as unavailable.

---

## Checklist before shipping a panel

- [ ] exactly one accent-filled control, on its own line
- [ ] no `<input type="text">` or `type="number"` anywhere in it
- [ ] no two families used for the same kind of question
- [ ] colour used for one meaning per element
- [ ] no bordered box containing a paragraph
- [ ] every device written as `var(--fbk-*)`, no literal glow or gradient
- [ ] still legible with every recipe slot set to `none`
- [ ] still legible with `prefers-reduced-motion`
- [ ] the panel's own scroll is the only scroll
- [ ] shortcuts registered with `window.registerShortcut`, and checked against
      `window.getAllShortcuts()` first — the player scope already owns Space,
      the arrows, `[`, `]`, `+` and `-`
- [ ] no value that is not on the type, space or height scale
- [ ] every inline label inside `--fbk-label-w`, or promoted to a block label
- [ ] seen in `assets/gallery.html`, with *No devices* and *Still* both on
- [ ] every click target at least 11px, measured on a real chart — not on the
      one you happened to be testing with

---

## 11. `hidden` has to actually hide

Any control given an explicit `display` in CSS makes `el.hidden = true` a
no-op, because the browser's `[hidden] { display: none }` is a UA rule at the
same specificity as a class selector — and an author rule wins at equal
specificity.

`assets/kit.css` carries a scoped `[hidden] { display: none !important }` for
the panel and the rail button, so a consumer can keep using `el.hidden` as the
one way to show and hide. Do not remove it, and do not toggle visibility with
`style.display` instead: two mechanisms for one job is how one of them gets
forgotten.

> **Found the hard way.** Riff Repeater showed "Start drill" and "End drill" at
> the same time, with `endBtn.hidden === true` and `display: inline-flex`
> computed. The JS was right; the stylesheet was quietly overruling it.

---

## 12. A proportional strip needs hit targets, not just fills

Any control whose geometry means something — a timeline, a waveform, a
progress map — has two jobs that pull apart, and they need two sets of
numbers:

- **the fill** has to be honest. A section's width is its share of the song
  and nothing else, or the thing stops being a map.
- **the hit target** has to be reachable. Give every item a target at least
  **11px** wide, grown symmetrically about its own centre, and resolve a click
  to the target whose **centre is nearest**. A wide item keeps everything
  except the few pixels closest to a thin neighbour's middle; the thin one
  becomes clickable. Nothing moves on screen.

> **Found the hard way.** Riff Repeater's timeline draws 21 section markers in
> a 296px strip. **Nine of them come out under 10px wide**, three under 5px,
> and the thinnest — `Outro 1`, 1.9px — has fourteen notes in it: a legitimate
> thing to drill that no one can click. The fill was right; the hit test was
> the fill.

And a target you cannot see is still no use, so **name what is under the
cursor**. Sweeping the strip should report whatever the hit test would choose,
somewhere already on screen, with a visible difference between *would get* and
*have got* — a dashed border rather than a solid one. That turns a strip you
have to aim at into one you scrub.

Do not solve this by giving thin items a minimum **visual** width. It fixes
the clicking and breaks the map: the items no longer sum to the whole, and the
playhead drifts away from the blocks it is supposed to be inside.

---

## 13. The kit is a base layer, and it has to lose every tie

`.fbk-row { flex-wrap: wrap }` in the kit and `.rr-pick { flex-wrap: nowrap }`
in a consumer are both single-class selectors. Specificity is identical, so
**source order alone decides** — and the kit's stylesheet is injected by
`install()` while a plugin's own is injected by the host, which put the kit
last and made it win.

`install()` **prepends** its `<link>` for that reason. A consumer must be able
to override the kit at equal specificity, without inventing selectors or
reaching for `!important`.

> **Found the hard way.** The first override anyone wrote — one row that had
> to stay on a single line — silently did nothing, three times in a row,
> through a version bump and two server restarts spent looking for a cache
> problem that was not there.

And the lesson inside the lesson, worth its own line because it is not
obvious: **a wrapping flex container breaks the line before it shrinks
anything.** `flex-shrink: 1` and `min-width: 0` are both powerless while
`flex-wrap: wrap` is in force. A row that must stay on one line says
`.fbk-row-nowrap` and puts `min-width: 0` on whichever child gives.

## 15. A control in a HUD must command the passage, not the preference

The hardest defect to see in a panel is a control that is in the wrong
**tense**. Two shapes of it, and Riff Repeater shipped both:

**A control that reports rather than commands.** Its mode tabs read
`Section / Phrase / Bars` and looked like the panel's first decision. But the
`Section` side gated no controls at all, the `Bars` side gated a preference
that already had a home, and **seven other gestures wrote to the field** — a
timeline click, a drag, `A`, `B`, the chevrons, `Practice weakest`, a section
change. A field that seven things overwrite is not taking your instruction; it
is displaying the last thing you did, in the costume of a button.

**A control that looks per-task and writes a global.** The same panel's
`Climb`, `Goal` and `Widen` sat two rows under the passage you had just picked,
so they read as "for this passage" — and every one of them went straight to
`localStorage`. Lowering the ladder for one solo lowered it for every passage
of every song, with no signal but a chip that stayed lit.

The tell is the same in both cases and it is not visual, so no amount of
looking at the panel finds it: **follow the write.** For each control, ask who
else writes that field, and how far the write reaches. If other gestures write
it, it is a readout — draw it as one or delete it. If the write outlives the
task, it is policy — and policy goes in a `fold`.

That is what `fold()` is for, and the reason it keeps the value in its head:
policy has to stay *visible* (you need to know the ladder before you press
start) without being *in the way* (you did not open a practice HUD to
configure it). A fold is the answer to "this belongs here but not now".

Corollary: **one setting, one domain.** The goal percentage had three floors —
5% in `normalizeGoal`, 10% in the settings page's field, 50% in the panel's
stepper. Three legal ranges for one number, depending on where you touched it.
Clamp once, in the layer every writer passes through.

## 16. A signal has to survive its own background

A hue is only a signal against a ground it contrasts with, and the ground a
panel most often forgets is **its own filled primary**.

Riff Repeater's start button carried an 8px status dot in
`--fbk-good` green and a key cap on `--fbk-bg / 0.35`, both on a saturated sky
fill. Measured against that fill the cap's plate came out at **1.05 : 1**, so
what reached the screen was white letters floating in nothing at 10px; the
green dot sat at a similar luminance to the cyan under it and read as a
smudge. Reported, accurately, as "the green disappears and you can't make out
the D".

Two rules come out of it:

**A small element on a filled control is inverted, never washed.** A
translucent dark plate under the fill's own ink is the shape of the mistake:
both halves move together, so the contrast between them never improves. Flip
it — near-white plate, panel-ground ink — and it reads on any hue a button
might be filled with. Use **roles** for it and not device slots, because
`--fbk-emph-on` is allowed to be `none` and a `none` background deletes the
element.

**A status hue does not go on a filled control at all.** Ask what it says when
the control is enabled: for that button the dot was *always* "ready", because
being blocked is exactly what disables it — so on the state where it was
visible it carried nothing, and on the state where it carried something the
button was dimmed and the reason was already in the tooltip. It went, and the
blocked reason became a visible sentence in a `.fbk-note`. §15's question
again: follow what the signal actually varies with.

## 17. The height scale is a pointer question, not a control question

26px was the stepper's height for four versions. It is under WCAG 2.5.8's
24×24 floor once the border is counted, nowhere near 2.5.5's 44×44, and these
are the buttons a player nudges **while playing**.

The wrong fix is to grow the control that was complained about. Do that twice
and a row has a 44px stepper beside a 26px chip, the shared band is gone, and
every subsequent row is a negotiation. **Swap the scale instead**: `h-sm`
26→32, `h-md` 32→44, `h-lg` 44→52 when `(pointer: coarse)` matches. One
change, in `theme.js`, and every family grows together because every family
already referenced the scale rather than a number.

`h-sm` goes to 32 rather than 44 deliberately — it is the height of things
that live in groups, where the row's own padding contributes and a five-rung
ladder at 44px would stand taller than the primary.

Two details that are easy to get wrong:

- **Watch the query, do not read it once.** A convertible laptop changes
  pointer with the panel open, and folding the keyboard back is precisely when
  the controls need to grow.
- **`min-width`, not `width`.** At 44px a one-character glyph is still one
  character, so a square box is right — but a caller who puts `A` or `12` in a
  stepper should get a wider box, not a clipped one.

And the shape changed with the size: a circle is a pill that happens to be
square, so the stepper and the chip were sharing `radius-pill` — two of the
four families in one geometry, which is §1's mistake arriving slowly. A
stepper is a rounded square with a glyph; a chip is a pill with a word in it.

## 18. Refactoring UI, applied by measurement rather than by quotation

Three of that book's rules earned changes here, and the useful part is *how
each one was decided* — every one of them started as a count, not an opinion,
because "use fewer borders" and "labels are a last resort" will justify almost
any edit if you let them.

**Use fewer borders — where a boundary is drawn twice.** The panel was
measured: **41 bordered elements** in 336px. That sounds damning until you
look at what they are — 10 steppers, 5 chips, 4 buttons, a toggle track, a
segmented track: in the four families the border *is* the control, and
removing it removes the affordance. Ten more are the 1px separators between
timeline blocks, which are the only thing distinguishing one block from the
next. What was actually wrong was three **containers** carrying a hairline on
top of a background that already separated them — a border over a fill is what
makes a layout read as boxes inside boxes. Those three went; the 38 stayed.
The rule is not "fewer borders", it is *one signal per boundary*.

**Balance weight and contrast — which sometimes means MORE contrast.** The
book's usual advice is that a heavy element needs lower contrast. A fold's
chevron is the opposite case: a small, light glyph that is the only signal the
row does anything, so it needs more contrast than the heading beside it, not
less. It had less. Moving it to the front of the row fixed the other half of
the same problem — an affordance at the far end of a 296px row, away from the
text it belongs to.

**Use fewer alignments.** Three values in the panel had three right edges:
−14px (the body padding, correct), −26px and −59px. The −26 was the fold's
summary, short by exactly the trailing chevron's width plus its gap — so
moving the chevron to the front put that value on the same pixel as the
slider's readout for free. The −59 is inside the plate, between two chevrons,
and cannot reach the edge; that one is structural and stays.

The rules this panel does **not** take from the book are worth naming too.
Its section headings keep their hairlines: replacing four of them with
whitespace would need more vertical space than the panel has, and they are
also the app's own device (§8). And the four uppercase micro headings stay
labels rather than being absorbed into their controls, because each one names
a *group* of controls rather than a single value — "labels are a last resort"
is about a label on one field, and applying it to a group heading just
deletes the structure.

## 14. Bump the version, and restart the server

The host reads `plugin.json` **once at startup**. A plugin's `styles` link is
cache-busted with `?v=<manifest version>`, so during development:

- the `src/` tree live-edits fine — it is served no-cache with ETags
- **a stylesheet change needs a version bump AND a server restart**, or the
  browser is handed the version the server read when it booted

Half an hour was spent on a layout bug that was three separate things wearing
one appearance: a stale `?v=`, then a real cascade problem, then a test that
compared the `top` of a zero-height spacer against its siblings and called it
a wrap. Measure the thing itself, one layer at a time.
