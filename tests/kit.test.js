/*
 * The kit's own tests.
 *
 * There is no jsdom here — the plugins ship no dependencies and neither does
 * this. So the DOM the builders need is a small stub, which is enough because
 * the builders only ever createElement, set text, add classes and attach
 * listeners. What is actually worth pinning is the LOGIC: which control lights
 * up for which state, that `Number(null)` does not colour a never-measured
 * value as a failure, and that a stepper cannot walk outside its bounds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ── a DOM small enough to keep honest ────────────────────────────────────

function makeNode(tag) {
    const node = {
        tagName: String(tag).toUpperCase(),
        /* Real elements have this, and the kit now branches on it: a segmented
           option's label may be a NODE rather than a string. A stub without it
           reads every node as a string and the branch is never tested. */
        nodeType: 1,
        children: [],
        dataset: {},
        style: {
            _props: {},
            setProperty(k, v) { this._props[k] = v; },
            removeProperty(k) { delete this._props[k]; },
            getPropertyValue(k) { return this._props[k]; },
        },
        _attrs: {},
        _listeners: {},
        /*
         * `textContent` CLEARS THE CHILDREN, as the real thing does.
         *
         * It was a plain string property, so `node.textContent = ''` — which
         * every rebuild in this kit uses to empty a container — left the old
         * children in place and the new ones appended after them. A rail
         * rebuilt from 3 rungs to 11 reported 14, and any test that counted
         * children after a rebuild was measuring the stub rather than the
         * code. Worth fixing rather than working around: a stub that lies
         * about this hides exactly the class of bug it exists to catch.
         */
        _text: '',
        get textContent() { return this._text; },
        set textContent(v) {
            this._text = v === null || v === undefined ? '' : String(v);
            if (this._text === '') this.children.length = 0;
        },
        className: '',
        disabled: false,
        hidden: false,
        title: '',
        type: '',
        checked: false,
        value: '',
        min: '',
        max: '',
        step: '',
        classList: {
            _set: new Set(),
            add(...c) { c.forEach((x) => this._set.add(x)); },
            remove(...c) { c.forEach((x) => this._set.delete(x)); },
            contains(c) { return this._set.has(c); },
            toggle(c, on) {
                const want = (on === undefined) ? !this._set.has(c) : !!on;
                if (want) this._set.add(c); else this._set.delete(c);
                return want;
            },
        },
        appendChild(c) { c._parent = this; this.children.push(c); return c; },
        removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
        remove() { if (this._parent) this._parent.removeChild(this); },
        focus() { this._focused = true; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return this._attrs[k]; },
        addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
        removeEventListener() {},
        click() { for (const fn of (this._listeners.click || [])) fn({ stopPropagation() {} }); },
        fire(type, e = {}) { for (const fn of (this._listeners[type] || [])) fn(e); },
        /*
         * A REAL `querySelector`, for tag names and single classes.
         *
         * It used to return null and an empty list unconditionally, which is
         * worse than missing: `assert.equal(body.querySelectorAll('button')
         * .length, 0)` passed because the stub could not answer, not because
         * the body held no buttons. A stub that always says "nothing" turns
         * every absence assertion into a tautology.
         *
         * Only what the kit actually uses: `tag` and `.class`, descendants
         * included, in document order.
         */
        querySelectorAll(sel) {
            const want = String(sel || '').trim();
            const byClass = want.startsWith('.');
            const key = byClass ? want.slice(1) : want.toLowerCase();
            const out = [];
            const walk = (n) => {
                for (const c of n.children) {
                    const cls = String(c.className || '').split(/\s+/);
                    if (byClass ? cls.includes(key) : String(c.tagName || '').toLowerCase() === key) out.push(c);
                    walk(c);
                }
            };
            walk(this);
            return out;
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        contains(other) {
            if (other === this) return true;
            const walk = (n) => n.children.some((c) => c === other || walk(c));
            return walk(this);
        },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; },
    };
    // classList's Set has to be per-node, not shared through the literal.
    node.classList._set = new Set();
    return node;
}

globalThis.document = {
    createElement: makeNode,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    body: makeNode('body'),
    head: makeNode('head'),
    activeElement: null,
};
globalThis.window = {
    feedBack: null,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false }),
};

const controls = await import('../src/controls.js');
const theme = await import('../src/theme.js');
const shortcuts = await import('../src/shortcuts.js');
const panel = await import('../src/panel.js');

// ── bands: the one that bit twice ────────────────────────────────────────

test('band splits at the app own accuracy thresholds', () => {
    assert.equal(controls.band(0.95), 'good');
    assert.equal(controls.band(0.9), 'good');
    assert.equal(controls.band(0.7), 'mid');
    assert.equal(controls.band(0.5), 'mid');
    assert.equal(controls.band(0.49), 'bad');
});

test('a never-measured value has NO band, not a bad one', () => {
    // `Number(null)` is 0 and 0 is finite, so a bare isFinite check colours
    // "never played" exactly like "missed every note". This cost three bugs
    // in one afternoon across two files.
    assert.equal(controls.band(null), null);
    assert.equal(controls.band(undefined), null);
    assert.equal(controls.band(''), null);
    assert.equal(controls.band(NaN), null);
});

// ── segmented: exactly one lit ───────────────────────────────────────────

test('a segmented control lights exactly one cell', () => {
    const picked = [];
    const seg = controls.segmented([
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
    ], (v) => picked.push(v));

    seg.set('b');
    assert.equal(seg.node('a').classList.contains('fbk-on'), false);
    assert.equal(seg.node('b').classList.contains('fbk-on'), true);
    assert.equal(seg.node('c').classList.contains('fbk-on'), false);

    seg.set('c');
    assert.equal(seg.node('b').classList.contains('fbk-on'), false);
    assert.equal(seg.node('c').classList.contains('fbk-on'), true);
});

test('a segmented cell reports its state to a screen reader', () => {
    const seg = controls.segmented([{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], () => {});
    seg.set('a');
    assert.equal(seg.node('a').getAttribute('aria-pressed'), 'true');
    assert.equal(seg.node('b').getAttribute('aria-pressed'), 'false');
});

test('clicking a segmented cell reports its value', () => {
    const picked = [];
    const seg = controls.segmented([{ value: 'x', label: 'X' }], (v) => picked.push(v));
    seg.node('x').click();
    assert.deepEqual(picked, ['x']);
});

// ── chips: four states, and no rebuild unless the set changed ────────────

test('chips carry the four states, one at a time', () => {
    const c = controls.chips([
        { value: 50, label: '50' },
        { value: 80, label: '80' },
        { value: 100, label: '100' },
    ], () => {}, { rail: true });

    c.set({ 50: 'done', 80: 'now', 100: 'on' });
    assert.equal(c.node(50).classList.contains('fbk-done'), true);
    assert.equal(c.node(50).classList.contains('fbk-now'), false);
    assert.equal(c.node(80).classList.contains('fbk-now'), true);
    assert.equal(c.node(100).classList.contains('fbk-on'), true);
});

test('a chip with no state carries none of the classes', () => {
    const c = controls.chips([{ value: 1, label: '1' }], () => {});
    c.set({ 1: 'on' });
    c.set({});
    const n = c.node(1);
    assert.equal(n.classList.contains('fbk-on'), false);
    assert.equal(n.classList.contains('fbk-now'), false);
    assert.equal(n.classList.contains('fbk-done'), false);
});

test('chips rebuild only when the signature changes', () => {
    // A rebuilt chip is a chip that cannot be clicked, and a panel that
    // re-renders twice a second would rebuild them mid-click.
    const c = controls.chips([{ value: 1, label: '1' }], () => {});
    assert.equal(c.rebuild('sig-a', [{ value: 2, label: '2' }]), true);
    assert.equal(c.rebuild('sig-a', [{ value: 3, label: '3' }]), false);
    assert.equal(c.node(2) !== null, true);
    assert.equal(c.node(3), null);
    assert.equal(c.rebuild('sig-b', [{ value: 3, label: '3' }]), true);
    assert.equal(c.node(3) !== null, true);
});

// ── stepper: bounded, and no text input anywhere ─────────────────────────

test('a stepper cannot walk outside its bounds', () => {
    const seen = [];
    const s = controls.stepper({ value: 85, step: 5, min: 50, max: 100, onChange: (v) => seen.push(v) });
    s.set(100);
    s.el.children[2].click();          // the "+"
    assert.equal(s.get(), 100);
    assert.deepEqual(seen, []);        // nothing changed, nothing reported
    s.set(50);
    s.el.children[0].click();          // the "−"
    assert.equal(s.get(), 50);
});

test('a stepper steps by its step and reports each change', () => {
    const seen = [];
    const s = controls.stepper({ value: 80, step: 5, min: 50, max: 100, onChange: (v) => seen.push(v) });
    s.el.children[2].click();
    s.el.children[2].click();
    assert.equal(s.get(), 90);
    assert.deepEqual(seen, [85, 90]);
});

test('a stepper ignores junk', () => {
    const s = controls.stepper({ value: 80, min: 0, max: 100 });
    s.set('nonsense');
    assert.equal(s.get(), 80);
    s.set(null);
    assert.equal(s.get(), 80);
});

test('a stepper clamps a programmatic value', () => {
    const s = controls.stepper({ value: 80, min: 50, max: 100 });
    s.set(9999);
    assert.equal(s.get(), 100);
    s.set(-1);
    assert.equal(s.get(), 50);
});

// ── toggle ───────────────────────────────────────────────────────────────

test('a toggle keeps a real checkbox for the keyboard', () => {
    const t = controls.toggle('Widen', 'hint', () => {});
    assert.equal(t.input.type, 'checkbox');
    t.set(true);
    assert.equal(t.input.checked, true);
    t.disable(true);
    assert.equal(t.input.disabled, true);
});

// ── theme: roles, recipes, and the contrast pick ─────────────────────────

test('every role has a default, so a host with no theme API still looks right', () => {
    assert.ok(theme.roles.length >= 14);
    for (const role of theme.roles) {
        const value = theme.ink(role);
        assert.match(value, /^rgb\(\d+ \d+ \d+\)$/, `${role} -> ${value}`);
    }
});

test('ink takes an alpha', () => {
    assert.match(theme.ink('accent', 0.5), /^rgb\(\d+ \d+ \d+ \/ 0\.5\)$/);
});

test('inkOn picks dark on a light fill and light on a dark one', () => {
    // The host's palette pairs on-accent with its accent and says nothing
    // about the rest, so white-on-amber is one careless line away.
    assert.equal(theme.inkOn('text'), 'rgb(9 12 20)');           // near-white fill
    assert.equal(theme.inkOn('bg'), 'rgb(232 238 252)');         // the well
    assert.equal(theme.inkOn('gold'), 'rgb(9 12 20)');           // light gold
});

test('the ink on the accent actually passes contrast against it', () => {
    /*
     * The one pairing a palette gets wrong by habit, and it is not a matter
     * of taste — it is arithmetic. `--fbk-accent` is a LIGHT blue, so:
     *
     *     white  #E8EEFC on it   2.22 : 1
     *     pure white on it       2.58 : 1
     *     the well #05070C on it 7.43 : 1
     *
     * 2.22 fails 4.5 for text, fails 3.0 for large text, and fails 3.0 for a
     * UI component. Every version of this palette drew the primary with white
     * ink, and this test is here so the next one cannot.
     */
    const rgbOf = (role) => theme.roleDefaults[role].split(/\s+/).map(Number);
    const lum = (c) => {
        const f = c.map((v) => {
            const n = v / 255;
            return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const ratio = (a, b) => {
        const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (l1 + 0.05) / (l2 + 0.05);
    };

    const onAccent = ratio(rgbOf('onAccent'), rgbOf('accent'));
    assert.ok(onAccent >= 4.5, `ink on accent is ${onAccent.toFixed(2)}:1, needs 4.5`);
    // And the ink the palette does NOT use there would have failed, which is
    // the whole point of pinning this.
    const white = ratio(rgbOf('text'), rgbOf('accent'));
    assert.ok(white < 3, `white on accent is ${white.toFixed(2)}:1 — if this ever passes, revisit`);
});

test('text and dim clear AA on every surface in the ramp', () => {
    const rgbOf = (role) => theme.roleDefaults[role].split(/\s+/).map(Number);
    const lum = (c) => {
        const f = c.map((v) => {
            const n = v / 255;
            return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const ratio = (a, b) => {
        const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (l1 + 0.05) / (l2 + 0.05);
    };
    // `dim` carries body copy at 11px, so it needs 4.5 and not 3.
    for (const surface of ['bg', 'surface', 'plate', 'surface2']) {
        for (const ink of ['text', 'dim']) {
            const r = ratio(rgbOf(ink), rgbOf(surface));
            assert.ok(r >= 4.5, `${ink} on ${surface} is ${r.toFixed(2)}:1`);
        }
    }
});

test('emphasis is never fully off, so a primary cannot be flat', () => {
    // The contract's rule: a theme must emphasise somehow. At least one of
    // fill / border / halo has to be a real value.
    assert.ok(theme.slots.includes('emph-fill'));
    assert.ok(theme.slots.includes('emph-border'));
    assert.ok(theme.slots.includes('emph-halo'));
    assert.ok(theme.slots.includes('meter-fill'));
});

/*
 * The one pair of tests that read source rather than behaviour.
 *
 * DESIGN.md §6 is a rule about how the code is WRITTEN — devices live in slots
 * and are expressed in terms of roles. A literal hex in the recipe table would
 * still render correctly and would silently stop an equipped theme from
 * recolouring it, so behaviour cannot catch it. Looking can.
 */
// ── fold ─────────────────────────────────────────────────────────────────

test('a fold starts shut, and shut means hidden', () => {
    const f = controls.fold({ title: 'How you drill', summary: '80 → 90 → 100' });
    assert.equal(f.isOpen(), false);
    assert.equal(f.body.hidden, true);
    // `hidden` and not a class, so section 0's law is what keeps it shut and a
    // consumer cannot re-open it with a `display`.
    assert.equal(f.el.dataset.open, 'false');
    assert.equal(f.head.getAttribute('aria-expanded'), 'false');
});

test('the head is the target, and it toggles', () => {
    const f = controls.fold({ title: 'Policy' });
    // A chevron is a 14px hit area for a job with a whole row available
    // (DESIGN.md §12), so the click listener has to be on the head itself.
    assert.equal(f.head.tagName, 'BUTTON');
    f.head.click();
    assert.equal(f.isOpen(), true);
    assert.equal(f.body.hidden, false);
    assert.equal(f.head.getAttribute('aria-expanded'), 'true');
    f.head.click();
    assert.equal(f.isOpen(), false);
    assert.equal(f.body.hidden, true);
});

test('a fold can be born open', () => {
    const f = controls.fold({ title: 'Policy', open: true });
    assert.equal(f.isOpen(), true);
    assert.equal(f.body.hidden, false);
});

test('the summary survives a nullish value as empty, not as "null"', () => {
    // The summary is built from live settings, so the one thing it must not do
    // is print the word "null" into a heading.
    const f = controls.fold({ title: 'Policy', summary: 'x' });
    const sum = f.parts.summary;
    f.setSummary(null);
    assert.equal(sum.textContent, '');
    f.setSummary(undefined);
    assert.equal(sum.textContent, '');
    f.setSummary(0);
    assert.equal(sum.textContent, '0');
});

test('the chevron LEADS, and the summary is the last cell', () => {
    /*
     * Order is the contract the stylesheet reads, and this order is the fix
     * for "it isn't clear that the section expands": the affordance sits
     * where the eye enters the row instead of 200px away at the lowest
     * contrast in it, and the summary can then right-align against the
     * panel's other values.
     */
    const f = controls.fold({ title: 'How you drill', summary: 'goal 85%' });
    assert.equal(f.head.children.length, 3);
    assert.equal(f.head.children[0].className, 'fbk-fold-chev');
    assert.equal(f.head.children[1].textContent, 'How you drill');
    assert.equal(f.head.children[2].textContent, 'goal 85%');
    // And the named handles agree with the DOM, so a consumer never counts.
    assert.equal(f.parts.chev, f.head.children[0]);
    assert.equal(f.parts.title, f.head.children[1]);
    assert.equal(f.parts.summary, f.head.children[2]);
});

// ── slider shapes ────────────────────────────────────────────────────────

test('a slider is label, value, then track — in that order', () => {
    /*
     * The order is the whole design. Value AFTER the track leaves the track
     * 42% of the row; a label line ABOVE it costs a row and separates the
     * label from its own value. Beside the label, they read as one thing and
     * the track takes the rest.
     */
    const sl = controls.slider({ label: 'Chart', unit: '%' });
    assert.equal(sl.el.className, 'fbk-row fbk-slider-row');
    const kids = sl.el.children;
    assert.equal(kids.length, 3);
    assert.equal(kids[0].textContent, 'Chart');
    assert.equal(kids[1].className, 'fbk-readout');
    assert.equal(kids[2], sl.input);
    // The label drops the fixed 62px column: a 40px word in it would put 22px
    // of nothing between the label and the value it belongs to.
    assert.match(kids[0].className, /fbk-slider-label/);
});

test('a slider with no label is track then value', () => {
    /*
     * The order flips, and the reason is which thing the value pairs with.
     * WITH a label it sits beside the word that names it, so they read as one
     * unit. WITHOUT one it is inside a `field` whose legend already names it —
     * nothing to pair with on the left — and putting it there anyway left the
     * track 62px short of the field's right edge, which is exactly the
     * "difficulty bar does not go all the way" report.
     */
    const sl = controls.slider({ unit: '%' });
    assert.equal(sl.label, null);
    assert.equal(sl.el.children.length, 2);
    assert.equal(sl.el.children[0], sl.input);
    assert.equal(sl.el.children[1].className, 'fbk-readout');
});

test('a slider refuses a nullish value rather than jumping to its minimum', () => {
    const sl = controls.slider({ label: 'x', min: 0, max: 100 });
    sl.input.value = '40';
    sl.set(null);
    assert.equal(sl.input.value, '40');
});

// ── the touch scale ──────────────────────────────────────────────────────

test('a coarse pointer gets the bigger height scale', () => {
    // The scale is swapped rather than individual controls grown: grow one
    // twice and a row has a 44px stepper beside a 26px chip with no shared
    // band left (DESIGN.md §17).
    const seen = {};
    const realRoot = globalThis.document.documentElement;
    globalThis.document.documentElement = {
        style: { setProperty: (k, v) => { seen[k] = v; }, removeProperty: () => {} },
    };
    const realMM = globalThis.window.matchMedia;
    globalThis.window.matchMedia = (q) => ({ matches: /pointer: coarse/.test(q) });
    try {
        theme.follow();
        assert.equal(seen['--fbk-h-sm'], '32px');
        assert.equal(seen['--fbk-h-md'], '48px');
        assert.equal(seen['--fbk-h-lg'], '64px');
    } finally {
        theme.unfollow();
        globalThis.window.matchMedia = realMM;
        globalThis.document.documentElement = realRoot;
    }
});

test('a fine pointer keeps the mouse scale', () => {
    const seen = {};
    const realRoot = globalThis.document.documentElement;
    globalThis.document.documentElement = {
        style: { setProperty: (k, v) => { seen[k] = v; }, removeProperty: () => {} },
    };
    const realMM = globalThis.window.matchMedia;
    globalThis.window.matchMedia = () => ({ matches: false });
    try {
        theme.follow();
        // 40 for a mouse is already the rack scale: anything pressed during
        // play, not "a stepper is 32 because it is a stepper".
        assert.equal(seen['--fbk-h-md'], '40px');
        assert.equal(seen['--fbk-h-lg'], '56px');
    } finally {
        theme.unfollow();
        globalThis.window.matchMedia = realMM;
        globalThis.document.documentElement = realRoot;
    }
});

// ── the sticky footer ────────────────────────────────────────────────────

test('a panel has a footer, and it is empty until something is put in it', () => {
    const p = panel.createPanel({ id: 'test', label: 'Test' });
    assert.equal(p.foot.className, 'fbk-foot');
    assert.equal(p.foot.children.length, 0);
    // `.fbk-foot:empty` collapses it in kit.css, so a panel with no single
    // action pays nothing — asserted on the source, since the stub has no
    // cascade.
    const css = source('../assets/kit.css');
    assert.match(css, /\.fbk-foot:empty\s*\{[^}]*padding:\s*0/);
});

test('the panel is head, body, footer, and a folded slot after them', () => {
    /*
     * Order is part of the contract: the body is the one scrolling child
     * between two fixed ones, and the folded slot comes last because it is a
     * SIZE of the same panel rather than another region of it — shown by
     * `fold(true)`, which hides the other three.
     */
    const p = panel.createPanel({ id: 'test', label: 'Test' });
    assert.deepEqual(p.root.children.map((k) => k.className),
        ['fbk-head', 'fbk-body', 'fbk-foot', 'fbk-folded-slot']);
    assert.equal(p.folded.hidden, true);
});

test('folding hides the rack and shows the strip — and refuses when empty', () => {
    const p = panel.createPanel({ id: 'test', label: 'Test' });
    /*
     * An empty slot cannot be folded INTO: it would hide every control and
     * show nothing, which is a panel that has vanished. So `fold` reports what
     * it actually did rather than assuming it worked.
     */
    assert.equal(p.fold(true), false, 'nothing to fold into');
    assert.equal(p.body.hidden, false);

    p.folded.appendChild(controls.el('div', 'strip'));
    assert.equal(p.fold(true), true);
    assert.equal(p.isFolded(), true);
    assert.equal(p.body.hidden, true);
    assert.equal(p.foot.hidden, true);
    assert.equal(p.root.dataset.folded, 'true');

    p.fold(false);
    assert.equal(p.isFolded(), false);
    assert.equal(p.body.hidden, false);
    assert.equal(p.foot.hidden, false);
});

test('the primary loses its margins in the footer', () => {
    // The footer's padding is the spacing there; a 10px margin inside a 6px
    // padding is how a pinned bar reads loose at the top and tight below.
    const css = source('../assets/kit.css');
    assert.match(css, /\.fbk-foot \.fbk-btn-primary[\s\S]{0,80}margin:\s*0/);
});

// ── the stepper's label ──────────────────────────────────────────────────

test('a stepper stacks its label over its value, inside itself', () => {
    /*
     * The spec's rule: the label names the unit. Two steppers side by side
     * with their legends in a separate label column is two rows plus a guess
     * about which legend belongs to which — and it is what lets `A · ±1 bar`
     * exist, since no external legend has room for both what the control is
     * and what one press does.
     */
    const st = controls.stepper({ label: 'START', unit: '%', value: 80 });
    assert.equal(st.el.children.length, 3);
    const stack = st.el.children[1];
    assert.equal(stack.className, 'fbk-stepper-stack');
    assert.equal(stack.children[0].textContent, 'START');
    assert.equal(stack.children[1].className, 'fbk-readout');
    assert.equal(st.label, stack.children[0]);
});

test('a stepper with no label is just a value between two buttons', () => {
    const st = controls.stepper({ unit: '%', value: 80 });
    assert.equal(st.label, null);
    assert.equal(st.el.children[1].children.length, 1);
});

test('the emph flag marks the value that drives the drill', () => {
    // On a rack of steppers one holds the live number and the rest are policy.
    const st = controls.stepper({ label: 'START', emph: true, value: 80 });
    assert.equal(st.el.children[1].children[1].dataset.emph, '1');
});

// ── the rack ─────────────────────────────────────────────────────────────

test('a rack has a label row, an aside for a value, and a body', () => {
    const r = controls.rack({ label: 'Loop' });
    assert.equal(r.el.tagName, 'SECTION');
    const head = r.el.children[0];
    assert.equal(head.className, 'fbk-rack-head');
    assert.equal(r.el.children[1], r.body);
    r.setAside('INTRO 1 · BEST 58%');
    assert.equal(head.children[2].textContent, 'INTRO 1 · BEST 58%');
});

test('the aside prints nothing for a nullish value, not "null"', () => {
    // It is built from live state every tick, so the one thing it must never
    // do is put the word "null" in a rack's legend.
    const r = controls.rack({ label: 'Loop' });
    for (const v of [null, undefined]) {
        r.setAside(v);
        assert.equal(r.el.children[0].children[2].textContent, '');
    }
    r.setAside(0);
    assert.equal(r.el.children[0].children[2].textContent, '0');
});

// ── the rail ─────────────────────────────────────────────────────────────

test('the rail marks cleared, current and ahead, and fills to the current', () => {
    const rl = controls.rail();
    rl.set([
        { value: 80, state: 'done' },
        { value: 85, state: 'on' },
        { value: 90, state: 'next' },
        { value: 95, state: 'next' },
        { value: 100, state: 'next' },
    ]);
    const cells = rl.el.children[1].children;
    assert.equal(cells.length, 5);
    // The dot lives INSIDE its cell: the cell divides the rail into equal
    // shares so a number lands under its dot, the dot is a fixed circle.
    assert.deepEqual([...cells].map((c) => c.children[0].dataset.state),
        ['done', 'on', 'next', 'next', 'next']);
    // The current rung is index 1 of 5, so the fill is a quarter of the line —
    // progress as a LENGTH, not as a number of green dots to count.
    assert.equal(rl.el.children[0].style.getPropertyValue('--fbk-fill'), '25%');
});

test('the rail rebuilds only when the rungs change shape', () => {
    const rl = controls.rail();
    rl.set([{ value: 80, state: 'on' }, { value: 100, state: 'next' }]);
    const first = rl.el.children[1].children[0].children[0];
    rl.set([{ value: 80, state: 'done' }, { value: 100, state: 'on' }]);
    // Same nodes, new states: an idle tick has to be a class swap, because
    // this renders twice a second while a drill runs.
    assert.equal(rl.el.children[1].children[0].children[0], first);
    assert.equal(first.dataset.state, 'done');
});

test('a dense ladder keeps every dot and thins only the labels', () => {
    /*
     * A step of +2 from 60 is 21 rungs. The dots are the ladder — the shape of
     * the climb is the information, so none may go — while the numbers are a
     * convenience, and 21 of them in 330px is a smear.
     */
    const rl = controls.rail();
    const many = [];
    for (let v = 60; v <= 100; v += 2) many.push({ value: v, label: String(v), state: v === 66 ? 'on' : 'next' });
    rl.set(many);

    assert.equal(rl.el.children[1].children.length, 21, 'every dot has its cell');
    assert.equal(rl.el.dataset.dense, 'true');
    const labelled = [...rl.el.children[2].children].filter((m) => m.textContent).length;
    assert.ok(labelled < 21 && labelled >= 5, `labelled ${labelled} of 21`);

    // The rung you are ON is never one of the ones dropped: "which speed am I
    // playing at" is the question the rail exists to answer.
    const onMark = [...rl.el.children[2].children][many.findIndex((r) => r.state === 'on')];
    assert.equal(onMark.textContent, '66');
});

test('a dot and its number are PLACED at the same fraction of a fixed track', () => {
    /*
     * Two reports, one cause. `space-between` aligned the first child's left
     * edge and the last child's right edge, so centres only coincided when
     * every child was the same width — and a dot is 12px against a number as
     * wide as "100". Equal flex cells fixed that, and then broke it again on a
     * dense ladder: thinning the numbers collapsed the empty marks and let the
     * survivors redistribute.
     *
     * Placing both at the same fraction of a CONSTANT track settles both, and
     * the constant is the second half of the ask: the line no longer grows and
     * shrinks as the rung count changes.
     */
    const rl = controls.rail();
    rl.set([80, 85, 90, 95, 100].map((v) => ({ value: v, label: String(v), state: 'next' })));

    const cells = [...rl.el.children[1].children];
    const marks = [...rl.el.children[2].children];
    assert.equal(cells.length, 5);
    assert.equal(marks.length, 5);
    for (let i = 0; i < 5; i += 1) {
        assert.equal(cells[i].style.left, marks[i].style.left, `rung ${i}`);
    }
    // First at the inset, last at the far inset — the track's ends, always.
    assert.match(cells[0].style.left, /^calc\(10px \+ 0 \*/);
    assert.match(cells[4].style.left, /^calc\(10px \+ 1 \*/);
});

test('a label is never kept right next to the last one', () => {
    /*
     * With 11 rungs the stride is 3, so the kept indices were 0, 3, 6, 9 and
     * 10 — and `98` printed a couple of pixels from `100`, which costs space
     * and says nothing you were not about to read. A kept index has to be at
     * least half a stride clear of the end.
     */
    const rl = controls.rail();
    const eleven = [];
    for (let v = 80; v <= 100; v += 2) eleven.push({ value: v, label: String(v), state: 'next' });
    rl.set(eleven);
    const shown = [...rl.el.children[2].children].map((m) => m.textContent).filter(Boolean);
    assert.ok(!shown.includes('98'), `98 should be dropped, got ${shown.join(' ')}`);
    assert.equal(shown[0], '80');
    assert.equal(shown[shown.length - 1], '100');

    // A wider stride leaves room, so the one before the end survives.
    const sixteen = [];
    for (let v = 70; v <= 100; v += 2) sixteen.push({ value: v, label: String(v), state: 'next' });
    rl.set(sixteen);
    const wide = [...rl.el.children[2].children].map((m) => m.textContent).filter(Boolean);
    assert.ok(wide.length >= 4 && wide.length <= 6, `got ${wide.join(' ')}`);
    assert.equal(wide[wide.length - 1], '100');
});

test('the track is the same length however many rungs there are', () => {
    const rl = controls.rail();
    rl.set([80, 90, 100].map((v) => ({ value: v, label: String(v), state: 'next' })));
    const threeFirst = rl.el.children[1].children[0].style.left;
    const threeLast = rl.el.children[1].children[2].style.left;

    const many = [];
    for (let v = 80; v <= 100; v += 2) many.push({ value: v, label: String(v), state: 'next' });
    rl.set(many);
    const cells = rl.el.children[1].children;
    assert.equal(cells.length, many.length, 'a cell per rung');
    assert.equal(cells[0].style.left, threeFirst);
    assert.equal(cells[cells.length - 1].style.left, threeLast);
});

test('a short ladder labels every rung', () => {
    const rl = controls.rail();
    rl.set([80, 85, 90, 95, 100].map((v) => ({ value: v, label: String(v), state: 'next' })));
    assert.equal(rl.el.dataset.dense, 'false');
    assert.equal([...rl.el.children[2].children].filter((m) => m.textContent).length, 5);
});

test('an empty rail does not throw and fills nothing', () => {
    const rl = controls.rail();
    rl.set(null);
    assert.equal(rl.el.children[0].style.getPropertyValue('--fbk-fill'), '0%');
});

// ── the LED meter ────────────────────────────────────────────────────────

test('the LED meter lights a proportion of its cells, in the grade band', () => {
    const m = controls.ledMeter({ segments: 10 });
    m.set(40, 'bad');
    const lit = [...m.el.children].filter((c) => c.dataset.band);
    assert.equal(lit.length, 4);
    assert.equal(lit[0].dataset.band, 'bad');
});

test('an unmeasured value lights nothing rather than the first cell', () => {
    // `Number(null)` is 0 and 0 would round to zero cells anyway — but 0 with
    // a band would still paint, so the null check is separate on purpose.
    const m = controls.ledMeter({ segments: 10 });
    m.set(60, 'mid');
    m.set(null, 'mid');
    assert.equal([...m.el.children].filter((c) => c.dataset.band).length, 0);
});

// ── the status line ──────────────────────────────────────────────────────

test('a status line says nothing until there is something to say', () => {
    // "Everything is normal" is a signal that carries nothing (§16) — the
    // green dot on a primary, again.
    const st = controls.statusLine();
    assert.equal(st.el.hidden, true);
    st.set(null, 'ignored');
    assert.equal(st.el.hidden, true);
    st.set('ok', '');
    assert.equal(st.el.hidden, true);
});

test('a blocked status carries its own way out', () => {
    let fixed = 0;
    const st = controls.statusLine();
    st.set('blocked', 'Turn on note detection', { label: 'Turn on', onClick: () => { fixed += 1; } });
    assert.equal(st.el.hidden, false);
    assert.equal(st.el.dataset.state, 'blocked');
    const action = st.el.children[2];
    assert.equal(action.hidden, false);
    action.click();
    assert.equal(fixed, 1);
});

test('a status with no action hides the link rather than showing a dead one', () => {
    const st = controls.statusLine();
    st.set('blocked', 'This passage has no notes in it');
    assert.equal(st.el.children[2].hidden, true);
});

test('an action is dropped when the state changes to one that has none', () => {
    // Otherwise the handler from a previous state stays wired to a hidden
    // button and fires on a keyboard activation.
    let fired = 0;
    const st = controls.statusLine();
    st.set('blocked', 'a', { label: 'Fix', onClick: () => { fired += 1; } });
    st.set('warn', 'b');
    st.el.children[2].click();
    assert.equal(fired, 0);
});

// ── the range strip ──────────────────────────────────────────────────────

function strip(extra = {}) {
    const s = controls.rangeStrip({ minHit: 40, ...extra });
    // The DOM stub reports every element as 100px wide starting at x=0.
    s.set([
        { key: 'a', start: 0, end: 10, events: 12, band: 'bad' },
        { key: 'b', start: 10, end: 20, events: 8, band: 'good' },
        { key: 'c', start: 20, end: 30, events: 0 },
    ], 30, { start: 10, end: 20 });
    return s;
}

/*
 * The blocks row, BY CLASS.
 *
 * These tests used to walk `el.children[0].children`, which is how adding an
 * inner track between the strip and its blocks broke two of them: an index
 * into a DOM is an assertion about the shape of the tree, made silently, in a
 * test about something else.
 */
function blocksOf(s) {
    return s.el.querySelector('.fbk-strip-blocks').children;
}

test('a strip draws every block, including the empty one', () => {
    const s = strip();
    const blocks = blocksOf(s);
    assert.equal(blocks.length, 3);
    // Proportional widths, because the strip is a map.
    assert.equal(blocks[0].style._props ? undefined : undefined, undefined);
    assert.equal(blocks[2].dataset.empty, 'true');
    assert.equal(blocks[1].dataset.empty, 'false');
});

test('an empty block absorbs into a neighbour when narrow, and refuses when wide', () => {
    /*
     * §12 from the other end. A thin block must be REACHABLE; a block where
     * nothing can happen must not be. Both fall out of one rule — the empty
     * block is simply left out of the hit table — and which one you see
     * depends on its width, which is the honest outcome:
     *
     *   narrow gap  a neighbour's grown target (>= minHit) covers it, so the
     *               tap lands on the nearest real block
     *   wide gap    nothing covers it, so the tap does nothing at all
     *
     * A tap that silently selects a block an inch away would be worse than a
     * tap that does nothing, so the second case is the right refusal.
     */
    const picks = [];
    const narrow = controls.rangeStrip({ minHit: 40, onPick: (k) => picks.push(k) });
    narrow.set([
        { key: 'a', start: 0, end: 14, events: 12 },
        { key: 'gap', start: 14, end: 15, events: 0 },
        { key: 'b', start: 15, end: 30, events: 8 },
    ], 30, null);
    narrow.el.fire('pointerdown', { clientX: 48 });   // inside the 1s gap
    narrow.el.fire('pointerup', { clientX: 48 });
    assert.equal(picks.length, 1);
    assert.notEqual(picks[0], 'gap');

    const wide = strip({ onPick: (k) => picks.push(k) });   // 'c' is a third of the strip
    const before = picks.length;
    wide.el.fire('pointerdown', { clientX: 95 });
    wide.el.fire('pointerup', { clientX: 95 });
    assert.equal(picks.length, before, 'a wide dead zone selects nothing');
});

test('a count that has not been taken yet is not a count of zero', () => {
    // `Number(null) === 0`. Reading absent as empty is how a whole strip once
    // went inert between a song loading and its chart arriving.
    const s = controls.rangeStrip({});
    s.set([{ key: 'a', start: 0, end: 10, events: null }], 10, null);
    assert.equal(blocksOf(s)[0].dataset.empty, 'false');
});

test('a drag past the slop takes a range; under it, it is a tap', () => {
    const drags = [];
    const picks = [];
    const s = strip({ onDrag: (a, b) => drags.push([a, b]), onPick: (k) => picks.push(k) });

    s.el.fire('pointerdown', { clientX: 10 });
    s.el.fire('pointermove', { clientX: 12 });      // inside the 4px slop
    assert.equal(drags.length, 0);
    s.el.fire('pointermove', { clientX: 60 });      // past it
    assert.equal(drags.length, 1);
    s.el.fire('pointerup', { clientX: 60 });
    // A drag must NOT also count as a tap, or every sweep would end by
    // selecting whatever block it finished over.
    assert.equal(picks.length, 0);
});

test('a drag hands back its ends in order, whichever way it was swept', () => {
    const drags = [];
    const s = strip({ onDrag: (a, b) => drags.push([a, b]) });
    s.el.fire('pointerdown', { clientX: 80 });
    s.el.fire('pointermove', { clientX: 20 });      // right to left
    assert.ok(drags[0][0] < drags[0][1], `got ${drags[0]}`);
});

test('a handle snaps only when NEAR an edge, so a drag can place freely', () => {
    /*
     * It snapped unconditionally, which meant an edge could sit ONLY on a
     * block boundary — and since the ± steppers move by a bar, there was no
     * way at all to put one mid-phrase. A lick with a pickup starts before the
     * bar line, so that is a real thing to want.
     *
     * The stub reports a 100px-wide strip, so with a 30s song the 14px
     * threshold is 4.2s of tolerance.
     */
    const edges = [];
    const s = strip({ onEdge: (w, t) => edges.push(t) });

    // 12px is 3.6s — inside the threshold, so it snaps to the edge at 0.
    s.handles.start.fire('pointerdown', { clientX: 30, pointerId: 1, stopPropagation() {} });
    s.handles.start.fire('pointermove', { clientX: 12, pointerId: 1 });
    assert.equal(edges[0], 0, 'near an edge, it snaps');

    // 50px is 15s, and the nearest edge is 10 or 20 — 5s away, past the
    // threshold, so the drag places where it is.
    s.handles.start.fire('pointermove', { clientX: 50, pointerId: 1 });
    assert.equal(edges[1], 15, 'away from an edge, it places freely');
});

test('a handle drag does not also start a sweep', () => {
    const edges = [];
    const drags = [];
    const s = strip({ onEdge: (w, t) => edges.push([w, t]), onDrag: (a, b) => drags.push([a, b]) });

    s.handles.start.fire('pointerdown', { clientX: 30, pointerId: 1, stopPropagation() {} });
    s.handles.start.fire('pointermove', { clientX: 36, pointerId: 1 });
    assert.equal(edges.length, 1);
    assert.equal(edges[0][0], 'start');
    // The strip underneath must not have taken it as a sweep: the handle sits
    // ON the blocks, so without the `dragging` guard a grab would start a
    // fresh range beneath the edge you meant to move.
    assert.equal(drags.length, 0);
});

// ── the folded strip ─────────────────────────────────────────────────────

test('the folded strip is one target, and it holds no other', () => {
    /*
     * The one thing you might want mid-song is "give me the rest of it", and
     * aiming at a chevron with a guitar in your hands is not a gesture. So the
     * block is the target — which only holds if nothing inside it is one.
     */
    let opened = 0;
    const f = controls.foldedStrip({ label: 'OPEN', hint: 'Y', onOpen: () => { opened += 1; } });

    /*
     * A LAYER, not one big button — see the note on the builder. The block
     * still behaves as a single target, and this asserts the BEHAVIOUR rather
     * than the tag: pressing the hit opens, and the readouts hold nothing
     * pressable.
     */
    assert.equal(f.el.tagName, 'DIV');
    assert.equal(f.hit.tagName, 'BUTTON');
    assert.equal(f.hit.getAttribute('aria-expanded'), 'false');
    f.hit.click();
    assert.equal(opened, 1);
    assert.equal(f.body.querySelectorAll('button').length, 0);

    /* No `onEnd`, no stop control — the strip does not invent one. */
    assert.equal(f.end, null);
});

test('the folded strip carries a way out when given one', () => {
    /*
     * WHY THIS EXISTS: hiding the detector's own drill HUD takes away the only
     * one-press way to end a running drill, so the strip has to carry it. It
     * is a SIBLING of the full-area target rather than a child, because a
     * button inside a button does not fire — which is the whole reason the
     * strip stopped being a button.
     */
    let ended = 0;
    let opened = 0;
    const f = controls.foldedStrip({
        label: 'OPEN',
        onOpen: () => { opened += 1; },
        onEnd: () => { ended += 1; },
        endLabel: 'End',
    });
    assert.ok(f.end, 'a stop control');
    assert.equal(f.end.tagName, 'BUTTON');
    assert.equal(f.end.title, 'End');

    /* Pressing it must NOT also open the panel. */
    f.end.click();
    assert.equal(ended, 1);
    assert.equal(opened, 0, 'the stop does not bubble into the open');
});

test('the folded strip shows its key hint in the cue', () => {
    const f = controls.foldedStrip({ label: 'OPEN', hint: 'Y' });
    const cue = [...f.el.children].find((c) => c.className === 'fbk-folded-cue');
    assert.ok(cue, 'a cue');
    assert.equal(cue.textContent, 'OPEN · Y');
});

test('a pick of five options wraps, a pick of four does not', () => {
    /*
     * THE COUNT DECIDES, not the author. Five named labels in one 360px row get
     * about 66px each, which truncates a word like `Sight-reading`. Whoever
     * declares five options should not also have to know that five is where a
     * row stops working — the same argument as the strip's zone gap and its
     * corner radius.
     */
    const four = controls.segmented(
        [1, 2, 3, 4].map((n) => ({ value: n, label: 'x' + n })), () => {}, 'four');
    const five = controls.segmented(
        [1, 2, 3, 4, 5].map((n) => ({ value: n, label: 'x' + n })), () => {}, 'five');

    assert.equal(four.el.className.includes('fbk-seg-wrap'), false, 'four stays a row');
    assert.equal(five.el.className.includes('fbk-seg-wrap'), true, 'five wraps');
    assert.equal(controls.SEG_MAX_INLINE, 4);

    /*
     * AND FOUR LONG ONES WRAP TOO. A count alone is not enough: a four-way
     * pick whose labels read `The fret, with the note name beside it` has a
     * hundred-odd characters in a row with room for thirty-six, and it does
     * not wrap — it escapes the card. Seen doing exactly that.
     */
    const wordy = controls.segmented([
        { value: 1, label: 'The fret number' },
        { value: 2, label: 'The note name' },
        { value: 3, label: 'The fret, with the note name beside it' },
        { value: 4, label: 'The note name, with the fret beside it' },
    ], () => {}, 'wordy');
    assert.equal(wordy.el.className.includes('fbk-seg-wrap'), true);
    assert.equal(controls.SEG_MAX_CHARS, 36);

    /*
     * A DRAWN OPTION contributes nothing to that budget, and arrives as a
     * node. `(5) A#` says what a note head shows by BEING one; a word for it
     * would be a caption on a caption. Four of those must not wrap just
     * because their names would have.
     */
    const drawn = controls.segmented([1, 2, 3, 4].map((n) => ({
        value: n,
        label: controls.el('span', 'fbk-glyph', 'x'.repeat(30)),
    })), () => {}, 'drawn');
    assert.equal(drawn.el.className.includes('fbk-seg-wrap'), false, 'nodes do not spend the budget');
    const first = drawn.node(1).querySelector('.fbk-seg-label');
    assert.equal(first.children.length, 1, 'and the node went in as a node');
    assert.equal(first.children[0].className, 'fbk-glyph');

    /* And it is still ONE pick either way. */
    five.set(3);
    assert.equal(five.node(3).classList.contains('fbk-on'), true);
    assert.equal(five.node(4).classList.contains('fbk-on'), false);
});

test('a chip can carry a mark its label cannot say', () => {
    /*
     * "This is the preset you picked" is the chip being lit; "and you have
     * changed something under it" is a second fact about the SAME chip, so it
     * cannot be another chip.
     */
    const seg = controls.segmented(
        ['live', 'study', 'sight', 'arcade', 'minimal'].map((v) => ({ value: v, label: v })),
        () => {}, 'presets');
    const marks = () => seg.values().filter((v) => !!seg.node(v).querySelector('.fbk-seg-mark'));

    assert.deepEqual(marks(), [], 'nothing marked to begin with');
    seg.mark('study');
    assert.deepEqual(marks(), ['study']);

    /* Moving it does not leave the old one behind. */
    seg.mark('arcade');
    assert.deepEqual(marks(), ['arcade']);
    seg.mark(null);
    assert.deepEqual(marks(), []);
});

test('a select is a native select, and says which value is current', () => {
    /*
     * A hand-drawn sheet was built here first and withdrawn on the reader's
     * call. What native brings back is keyboard, type-ahead, screen readers, a
     * gamepad and a list allowed to be taller than the panel; what stays ours
     * is the well it sits in.
     */
    const picks = [];
    const sel = controls.select(
        [
            { value: 'none', label: 'None (tab only)' },
            { value: 'hw', label: '3D Highway' },
            { value: 'jt', label: 'Jumping Tab' },
        ],
        (v) => picks.push(v),
        { ariaLabel: 'Board above the tab' },
    );

    assert.equal(sel.input.tagName, 'SELECT');
    assert.equal(sel.input.getAttribute('aria-label'), 'Board above the tab');
    assert.deepEqual(sel.values(), ['none', 'hw', 'jt']);
    assert.equal(sel.input.children.length, 3, 'an option each');

    /* A value in the list is shown; one that is not is REPORTED, not swallowed
       — a board uninstalled while it was the chosen one is a real state. */
    assert.equal(sel.set('hw'), true);
    assert.equal(sel.input.value, 'hw');
    assert.equal(sel.input.dataset.missing, 'false');
    assert.equal(sel.set('gone'), false);
    assert.equal(sel.input.dataset.missing, 'true');

    /* Choosing reports the value. */
    sel.input.value = 'jt';
    sel.input.fire('change');
    assert.deepEqual(picks, ['jt']);
});

test('a select rebuilds only when its list changed', () => {
    /*
     * The board list comes from the app and can arrive after the panel does, so
     * `rebuild` gets called on every render — and a rebuilt row is a row that
     * cannot be clicked, because the pointer went down on a node that no longer
     * exists. Same guard as the chips'.
     */
    const sel = controls.select([{ value: 'a', label: 'A' }], () => {});
    assert.equal(sel.rebuild('sig1', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]), true);
    assert.deepEqual(sel.values(), ['a', 'b']);
    assert.equal(sel.rebuild('sig1', [{ value: 'z', label: 'Z' }]), false, 'same signature, no rebuild');
    assert.deepEqual(sel.values(), ['a', 'b'], 'and the rows are untouched');
});

test('a select can be disabled, and a rebuild keeps the current value', () => {
    /*
     * A field that goes away under a condition — the board list vanishes when
     * the tab turns pages — is disabled rather than removed, so the rack does
     * not change shape under the reader.
     *
     * And the list arrives from the app AFTER the panel does, so `rebuild` is
     * called every render: replacing a select's options while its list is open
     * closes it under the reader's hand, and losing the current value on a
     * rebuild silently re-picks the first board in the list.
     */
    const sel = controls.select([{ value: 'a', label: 'A' }], () => {});
    sel.disable(true);
    assert.equal(sel.input.disabled, true);
    sel.disable(false);
    assert.equal(sel.input.disabled, false);

    sel.set('a');
    assert.equal(sel.rebuild('sig1', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]), true);
    assert.deepEqual(sel.values(), ['a', 'b']);
    assert.equal(sel.input.value, 'a', 'the choice survived the rebuild');
    assert.equal(sel.rebuild('sig1', [{ value: 'z', label: 'Z' }]), false, 'same signature, no rebuild');
    assert.deepEqual(sel.values(), ['a', 'b']);
});

test('a slider can show a derived second number, and never take it', () => {
    /*
     * `5 -> 7.8`: what you asked for, and what is on screen once the tempo has
     * widened the window. It is a READING (§21), so it sits beside the value
     * and the slider still writes only the value.
     */
    const s2 = controls.slider({ min: 2, max: 24, step: 0.5, unit: 'beats', onInput: () => {} });
    const aside = s2.el.querySelector('.fbk-readout-aside');
    assert.ok(aside, 'there is somewhere for it to go');
    assert.equal(aside.hidden, true, 'hidden until there is one');

    s2.setAside('\u2192 7.8');
    assert.equal(aside.hidden, false);
    assert.equal(aside.textContent, '\u2192 7.8');

    s2.setAside(null);
    assert.equal(aside.hidden, true);
});

test('the kit version in index.js is the one in package.json', () => {
    /*
     * `install()` publishes it and consumers stamp it on the stylesheet link, so
     * a stale number here serves yesterday's CSS — the same trap that had Riff
     * Repeater a release behind, silently, with a restart that did not help.
     * It was 0.20.0 while the kit was at 0.25.1 when this test was written.
     */
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'index.js'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));
    const m = src.match(/export const VERSION = '([^']+)'/);
    assert.ok(m, 'index.js declares a VERSION');
    assert.equal(m[1], pkg.version);

    /*
     * And the gallery's own label, which is the one a reader SEES. It said
     * 0.2.0 while the kit was at 0.26.0 — twelve releases — so the page
     * documenting every component was quietly claiming to document a kit that
     * had four of them.
     */
    const gallery = fs.readFileSync(path.join(import.meta.dirname, '..', 'assets', 'gallery.html'), 'utf8');
    const shown = [...gallery.matchAll(/kit (\d+\.\d+\.\d+)|>(\d+\.\d+\.\d+) — every/g)]
        .map((x) => x[1] || x[2]);
    assert.ok(shown.length >= 2, 'the gallery names a version');
    for (const v of shown) assert.equal(v, pkg.version, 'gallery version');
});

test('pressing a control does not scroll the panel, and inputs keep their default', () => {
    /*
     * The body is the one scrolling child, so focusing a button near its bottom
     * makes the browser scroll it into view — and what leaves the top is
     * whatever the reader was picking from. Live Tab reported it as pressing a
     * preset chip scrolling the preset row off the screen.
     *
     * The EXCEPTION is the part worth testing: an input, a select and a
     * textarea are operated THROUGH that default — it is how a slider is
     * dragged and a checkbox ticked. Live Tab's own fix cancelled it for
     * inputs too and Chromium happened to survive that, which is not a thing
     * to depend on. These two assertions came from that repository with the
     * code.
     */
    const p2 = panel.createPanel({ id: 'guard', label: 'Guard' });
    const fire = (tagName) => {
        const ev = { target: { tagName }, prevented: false, preventDefault() { this.prevented = true; } };
        p2.body.fire('mousedown', ev);
        return ev.prevented;
    };

    assert.equal(fire('BUTTON'), true, 'a button loses it, so the panel holds still');
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) {
        assert.equal(fire(tag), false, tag + ' is operated through it');
    }
});

function source(rel) {
    const src = fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('every fallback in the stylesheet matches the recipe it mirrors', () => {
    /*
     * THE SECOND COPY OF THE SCALE.
     *
     * Every rule in kit.css is written `var(--fbk-h-md, 40px)` — the fallback
     * exists so a panel is still shaped if `follow()` never ran. Which makes
     * it a hand-written mirror of the recipe table, and a mirror nobody
     * compares is a mirror that goes wrong quietly: after the rack palette
     * landed there were **63** fallbacks still carrying the previous scale,
     * and the only reason it was noticed is that the gallery is static HTML
     * and therefore renders the fallbacks rather than the recipe.
     *
     * The "no stray pixel" test could not catch it, because a stale 32px is a
     * perfectly legal number from the old scale.
     *
     * So: read them back out and compare. A slot with no fallback is fine
     * (some are deliberately bare); a fallback that disagrees is not.
     */
    const css = source('../assets/kit.css');
    /*
     * ROLES TOO, and leaving them out was the hole this test shipped with.
     *
     * The first version compared only `recipeDefaults` — the type, space,
     * height and device slots. Every COLOUR is a role, and roles are written
     * with fallbacks in exactly the same way, so when the palette changed
     * from slate-blue to the neutral rack ramp, **113 role fallbacks kept the
     * old navy values** and the test that existed to catch precisely this said
     * nothing. It reported "no drift" while a third of the file was drifted.
     *
     * The lesson is smaller than it looks and worth writing down: a test that
     * enforces a rule on a SUBSET of the thing the rule is about will read as
     * enforcing it on all of it.
     */
    const recipes = { ...theme.recipeDefaults, ...roleFallbacks() };

    /** The role table keyed by the custom property each role is written as. */
    function roleFallbacks() {
        const out = {};
        for (const role of theme.roles) {
            const propName = '--fbk-' + role.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
            out[propName.replace(/^--fbk-/, '')] = theme.roleDefaults[role];
        }
        return out;
    }
    const mismatches = [];

    const seen = new Set();
    const re = /var\(--fbk-([a-z0-9-]+),\s*([^()]*?(?:\([^()]*\)[^()]*?)*)\)/g;
    for (const m of css.matchAll(re)) {
        const [, slot, fallbackRaw] = m;
        const fallback = fallbackRaw.trim();
        if (!fallback || !(slot in recipes)) continue;
        const key = slot + '|' + fallback;
        if (seen.has(key)) continue;
        seen.add(key);

        const want = String(recipes[slot]).trim();

        /*
         * `none` is ALWAYS allowed. It is the documented legal value of every
         * device slot (§6), and it is what an unhooked panel should fall back
         * to — a hardcoded glow in a fallback is precisely the literal device
         * the second law forbids.
         */
        if (fallback === 'none') continue;

        /*
         * A `font` shorthand's fallback cannot reference `var(--fbk-font)`,
         * because a fallback has to work when nothing is set. So compare
         * everything except the family: weight, size and line-height are the
         * scale, and the family is the one part allowed to differ.
         */
        const withoutFamily = (v) => v.replace(/\s+\S+$/, '');
        const ok = /var\(--fbk-font/.test(want)
            ? withoutFamily(want) === withoutFamily(fallback)
            : want === fallback;
        if (!ok) mismatches.push(`--fbk-${slot}: recipe "${want}" vs fallback "${fallback}"`);
    }

    assert.deepEqual(mismatches, [], mismatches.join('; '));
});

test('nothing that clips its background uses the background shorthand', () => {
    /*
     * THE SHORTHAND THAT UNDOES THE CLIP.
     *
     * `background:` resets `background-clip` to `border-box`. The zone blocks
     * set a transparent border and `background-clip: padding-box` to leave a
     * gap between neighbours, and every rule painting a band used the
     * shorthand underneath — so the clip was reset and the gap was never
     * drawn, on any chart, ever. The custom property carrying its width was
     * being set correctly the whole time, which is exactly why looking at the
     * DOM said it worked: I had checked the input, not the paint.
     *
     * The rule this enforces: if any rule clips a selector's background, no
     * rule may paint that selector with the shorthand. Longhands
     * (`background-color`, `background-image`) do not touch the clip.
     */
    const css = source('../assets/kit.css');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map((m) => ({ sel: m[1].trim(), body: m[2] }));

    /* Every class named by a rule that clips. */
    const clipped = new Set();
    for (const r of rules) {
        if (!/background-clip\s*:/.test(r.body)) continue;
        for (const cls of r.sel.matchAll(/\.([a-z0-9-]+)/g)) clipped.add(cls[1]);
    }
    assert.ok(clipped.size > 0, 'something in the kit clips a background');

    const offenders = [];
    for (const r of rules) {
        if (!/(^|[;\s])background\s*:/.test(r.body)) continue;
        for (const cls of r.sel.matchAll(/\.([a-z0-9-]+)/g)) {
            if (clipped.has(cls[1])) offenders.push(`${r.sel} paints .${cls[1]} with the shorthand`);
        }
    }
    assert.deepEqual(offenders, [], offenders.join('; '));
});

test('every custom property the stylesheet reads is one the theme writes', () => {
    /*
     * THE GUARD THAT WAS MISSING, and it cost more than the ones that were
     * there.
     *
     * `propFor` turned `surface2` into `--fbk-surface2` while the stylesheet
     * read `--fbk-surface-2` — thirty times. So the control tone was the
     * hardcoded fallback in every rule that used it, always, whatever the
     * palette said. It survived a palette rewrite, a 113-value fallback
     * alignment and the mirror test, because all of those compare VALUES and
     * none of them asks whether the property is ever set.
     *
     * A misspelled custom property is silent by design: `var()` just uses the
     * fallback. That makes it exactly the class of mistake a test has to
     * catch, because looking at the screen cannot.
     */
    const css = source('../assets/kit.css');
    const written = new Set();
    for (const role of theme.roles) {
        written.add('--fbk-' + role
            .replace(/[A-Z]/g, (ch) => '-' + ch.toLowerCase())
            .replace(/([a-z])(\d)/g, '$1-$2'));
    }
    for (const slot of Object.keys(theme.recipeDefaults)) written.add('--fbk-' + slot);
    /*
     * Some properties are set PER ELEMENT by a builder rather than on the root:
     * a fill fraction, the rail's cell count, a zone's gap. CSS cannot count
     * children or measure a sibling, so these have to come from JS.
     *
     * Read out of the source rather than listed here. A hand-kept allowance is
     * the same debt this test exists to pay off — it would let a builder rename
     * what it sets and leave the stylesheet reading the old name, silently,
     * which is precisely the bug in the note above.
     */
    for (const m of source('../src/controls.js').matchAll(/setProperty\(\s*'(--fbk-[a-z0-9-]+)'/g)) {
        written.add(m[1]);
    }

    const unknown = new Set();
    for (const m of css.matchAll(/var\((--fbk-[a-z0-9-]+)/g)) {
        if (!written.has(m[1])) unknown.add(m[1]);
    }
    assert.deepEqual([...unknown], [],
        `the stylesheet reads properties nothing sets: ${[...unknown].join(', ')}`);
});

test('no literal colour in the recipe table or the stylesheet', () => {
    for (const rel of ['../src/theme.js', '../assets/kit.css']) {
        const hex = source(rel).match(/#[0-9a-fA-F]{3,8}/g) || [];
        assert.deepEqual(hex, [], `${rel} contains literal colours: ${hex.join(', ')}`);
    }
});

test('every gradient in the stylesheet is built from roles', () => {
    // Matched over the whole declaration, not per line: the gradients are
    // wrapped for readability, and a line-oriented check failed on the first
    // line of a perfectly correct three-line one.
    const css = source('../assets/kit.css');
    const gradients = css.match(/(?:linear|radial)-gradient\([^;]*?\)(?=[,;\s])/gs) || [];
    assert.ok(gradients.length > 0, 'expected at least one gradient to check');
    for (const g of gradients) {
        assert.ok(/var\(--fbk-/.test(g),
            `gradient not built from roles: ${g.replace(/\s+/g, ' ')}`);
    }
});

/*
 * The scales exist to be obeyed, so this is the test that they are.
 *
 * It counts the bare pixel values in the stylesheet and allows only the ones
 * that are genuinely geometry rather than spacing: a toggle's 13px knob inside
 * its 19px track, a slider's 6px rail and 15px thumb, an 8px meter, the
 * panel's own 336px width and 64px offset. Anything else has to come from
 * `--fbk-s-*`, `--fbk-h-*` or the type steps — which is exactly the discipline
 * that was missing when the file used 6, 7, 8, 9, 10, 11, 12 and 15px spacing
 * side by side.
 */
test('no stray pixel values outside the geometry allowlist', () => {
    const GEOMETRY = new Set([
        '0px', '1px', '2px', '3px',     // hairlines, insets, tiny radii
        '5px', '6px', '8px',            // thumb centring offset, slider rail, meter height
        '13px', '15px', '17px', '18px', '19px', '20px',  // toggle knob/track, the − + glyph, kbd, slider thumb
        '20px',                         // badge
        '34px', '56px', '76px',         // toggle track, the two readout boxes
        '72px', '88px',                 // the meter name column, narrow and wide
        '68px',                         // the list row's name column
        '28px',                         // the A/B handle's grip width
        '7px', '360px',                 // the chassis indicator, the panel
        '80px',                         // slider min-width
        '64px', '480px',                // the panel's top offset, the breakpoint
        '10px', '11px', '12px', '13px', '14px', '22px',   // the type steps
    ]);
    const css = source('../assets/kit.css');
    // Only look at property values, and skip anything inside a var() fallback —
    // those are deliberate copies of the token defaults.
    const stripped = css.replace(/var\([^)]*\)/g, 'VAR');
    const offenders = new Set();
    for (const m of stripped.matchAll(/:\s*[^;{}]*?(\d+px)/g)) {
        if (!GEOMETRY.has(m[1])) offenders.add(m[1]);
    }
    assert.deepEqual([...offenders], [],
        `these px values are on no scale: ${[...offenders].join(', ')}`);
});

// ── shortcuts ────────────────────────────────────────────────────────────

test('taken() is empty and safe on a host with no registry', () => {
    assert.deepEqual(shortcuts.taken(), []);
    assert.equal(shortcuts.isTaken('d'), false);
});

test('register is a no-op, not a throw, without the host API', () => {
    const off = shortcuts.register([{ key: 'd', handler() {}, description: 'x' }], { name: 'T' });
    assert.equal(typeof off, 'function');
    assert.doesNotThrow(off);
});

test('register prefixes the description with the plugin name', () => {
    const seen = [];
    globalThis.window.registerShortcut = (s) => seen.push(s);
    globalThis.window.unregisterShortcut = () => true;
    const off = shortcuts.register([{ key: 'd', handler() {}, description: 'do a thing' }],
        { name: 'Riff Repeater', scope: 'player' });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].description, 'Riff Repeater: do a thing');
    assert.equal(seen[0].scope, 'player');
    off();
    delete globalThis.window.registerShortcut;
    delete globalThis.window.unregisterShortcut;
});

test('register skips an entry with no key or no handler', () => {
    const seen = [];
    globalThis.window.registerShortcut = (s) => seen.push(s);
    shortcuts.register([{ key: '', handler() {} }, { key: 'x' }, { key: 'y', handler() {} }], {});
    assert.deepEqual(seen.map((s) => s.key), ['y']);
    delete globalThis.window.registerShortcut;
});
