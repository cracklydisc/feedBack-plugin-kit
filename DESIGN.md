# The rules

This is the payload of the kit. The CSS saves typing; the rules save you from
re-making the mistakes below, each of which was made and then found in a real
plugin.

A panel in this app is a **heads-up display for something you do with a guitar
in your hands**, not a preferences sheet in a settings app. Everything here
follows from that one sentence.

---

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
