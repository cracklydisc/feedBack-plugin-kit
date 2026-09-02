# fee[dB]ack plugin kit

The shared look and the shared plumbing for [fee[dB]ack](https://github.com/got-feedback)
plugins. **Vendored, not depended on.**

The rules it enforces are in **[DESIGN.md](DESIGN.md)** — that file is the point
of this repository. The code just saves typing.

---

## Why it exists

Four plugins had each written the same things, differently:

| | Where it was written | Cost |
| --- | --- | --- |
| the token bridge — read `feedBack.theme.get()`, write prefixed vars, follow `theme:changed`, gate reduced motion | `tidy/src/theme.js` 62 lines · `riffrepeater/src/theme.js` 65 lines · Live Tab's `ink()`/`inkOn()` building inline style strings | three times, three shapes |
| the parked panel and its rail-slot button | `riffrepeater/src/ui/mount.js` 155 lines · Live Tab ~410 lines across `mountControls`/`panelCSS`/`repaintControls` | twice, one after two bug reports |
| the settings-panel retry dance | `tidy/settings.html:98` and `riffrepeater/settings.html:231` | **identical line for line** |
| the control taxonomy | Riff Repeater in CSS · Live Tab as `style.cssText` strings · Crate its own way | three languages for the same controls |

And the same class of bug kept recurring in each of them. `Number(null)` is `0`
and `0` passes `Number.isFinite`, so "absent" silently became "zero" — a stored
best of 0% on a never-measured passage, an accuracy band colouring red for
"never played", a stepper jumping to its minimum when handed null. Four
instances across two repositories. There is now one `num()` in
`src/controls.js` and every number in the kit goes through it.

## Why it is copied and not imported

There is no shared-library mechanism in this host: no import maps, no
guaranteed plugin load order, and a plugin can be disabled or simply not
installed. A runtime dependency on another plugin means every consumer breaks
when one of them is switched off.

So the kit is **copied into each plugin** and its version is stamped in the
header of every file. A plugin stays self-contained: install it, it works.

## Vendoring it

```bash
# from the plugin's root
mkdir -p src/kit
cp -r ../feedBack-plugin-kit/src/*.js       src/kit/
cp    ../feedBack-plugin-kit/assets/kit.css assets/kit.css
```

Or as a subtree, if you would rather `git` tracked it:

```bash
git subtree add --prefix src/kit https://github.com/cracklydisc/feedBack-plugin-kit main --squash
# later
git subtree pull --prefix src/kit https://github.com/cracklydisc/feedBack-plugin-kit main --squash
```

Either way `assets/kit.css` has to be a real file in the plugin, because
`install()` loads it from the **plugin's own** asset route — which is exactly
why there is no cross-plugin dependency to break.

## Using it

```js
import * as kit from './kit/index.js';

kit.install({ id: 'myplugin', version: '1.2.0' });   // stylesheet + theme bridge

const panel = kit.createPanel({
    id: 'myplugin',
    label: '⏱ My Plugin',
    title: 'What this does',
});
panel.attach();

const { controls: c } = kit;
panel.body.appendChild(c.section('What to loop'));

const mode = c.segmented(
    [{ value: 'a', label: 'Section' }, { value: 'b', label: 'Bars' }],
    (v) => setMode(v),
    'Loop grain',
);
panel.body.appendChild(mode.el);
mode.set('a');

const off = kit.shortcuts.register(
    [{ key: 'd', description: 'do the thing', handler: doTheThing }],
    { name: 'My Plugin', scope: 'player' },
);

// teardown, for plugin-runtime-idempotent.v1
off();
panel.detach();
kit.uninstall('myplugin');
```

### The manifest

A plugin manifest's `styles` takes one path, so keep declaring your own sheet;
`install()` injects the kit's alongside it:

```json
{ "styles": "assets/myplugin.css", "scriptType": "module" }
```

Bump the plugin's `version` whenever either stylesheet changes — both are
cache-busted with `?v=<version>`.

## What is in it

| File | |
| --- | --- |
| `DESIGN.md` | **the rules.** Read this one. |
| `src/theme.js` | the token bridge: host `--fb-*` roles → `--fbk-*` roles, plus the Layer 2 device recipes the host has proposed but not yet shipped |
| `assets/kit.css` | the panel, the four control families, meters, badges, key caps. No literal colour, no literal glow, no literal gradient — a test enforces that |
| `src/panel.js` | the parked panel and the button in the player's plugin-control slot |
| `src/controls.js` | builders for the four families, plus `num()`, `band()`, readouts and meter rows |
| `src/shortcuts.js` | `window.registerShortcut` with teardown, and `taken()` so you can check before choosing a key |
| `src/settings-mount.js` | the settings-panel retry dance |

## Tests

```bash
node --test tests/*.test.js
```

23 tests, no dependencies, no build step, no jsdom — the DOM the builders need
is a stub small enough to read. What is pinned is the logic: which control
lights up for which state, that an absent number never colours as a failure,
that a stepper cannot leave its bounds, and — by reading the source — that no
device is written as a literal.

## Forward-compatible with the host

Every role in `src/theme.js` derives from `feedBack.theme.get()`, and every
device is a slot named the way core's own `docs/host-theme-contract.md`
proposes. When the host finally ships `static/v3/theme-contract.css`, the kit's
Layer 2 becomes a thin alias layer rather than code to throw away. It is not a
fork of the app's design system; it is an early implementation of it.

## License

AGPL-3.0-or-later, matching fee[dB]ack. See [LICENSE](LICENSE).
