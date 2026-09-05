# Changelog (fee[dB]ack plugin kit)

All notable changes to the kit are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and it follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-05
The first version published anywhere. The numbers before it were working
markers on an unreleased branch, not releases, the kit was extracted from two
plugins that had each written the same panel differently, and it only became a
thing worth having a version at all once both were drawing from it.

### The rules

[DESIGN.md](DESIGN.md) is the point of this repository; the code just saves
typing. Three parts, the foundations (type, space and height scales), the
twenty-three rules, and a component reference that says when *not* to use each
class.

Two rules earn their keep more than the rest:

- **§24, the control-choice table.** A boolean gets a toggle, up to four
  options a segmented control, more than four a native select, a short range a
  stepper and a long one a slider. The shape of the value picks the control, so
  adding a setting is no longer a design decision.
- **§15, tense.** How to spot a control that is in the wrong one, a button
  that describes a state instead of an action, a readout that looks pressable.

### What is in it

- `assets/kit.css`: the panel, the four control families, meters, badges, key
  caps. No literal colour, no literal glow, no literal gradient and no literal
  measurement: three tests read the file and enforce it.
- `src/theme.js`: the token bridge, host `--fb-*` roles to `--fbk-*` roles.
- `src/panel.js`: the parked panel and its button in the player's plugin
  control slot, including the heartbeat that puts the button back when the
  host rebuilds its rail.
- `src/controls.js`, `src/shortcuts.js`, `src/settings-mount.js`: the
  builders, `registerShortcut` with teardown, and the settings-panel retry
  dance.
- `assets/gallery.html`: every component in every state on one page, with two
  switches that prove what prose can only assert: *No devices* strips the glow,
  the gradient and the shadows the way a glow-less shop skin does, and *Still*
  kills the motion. Nothing may vanish under either.

### Vendored, not depended on

A consuming plugin copies the kit in rather than importing it at runtime. Any
plugin can be disabled and there is no load order to rely on, so a panel that
fails to draw because somebody turned off a dependency is a panel that fails at
the worst possible moment. The cost, copies drift until somebody re-vendors,
is the one worth paying.
