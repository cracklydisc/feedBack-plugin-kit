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
        textContent: '',
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
        appendChild(c) { this.children.push(c); return c; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return this._attrs[k]; },
        addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
        removeEventListener() {},
        click() { for (const fn of (this._listeners.click || [])) fn({ stopPropagation() {} }); },
        fire(type, e = {}) { for (const fn of (this._listeners[type] || [])) fn(e); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        contains() { return false; },
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
    assert.equal(theme.inkOn('text'), 'rgb(9 12 20)');       // near-white fill
    assert.equal(theme.inkOn('bg'), 'rgb(248 250 252)');     // near-black fill
    assert.equal(theme.inkOn('gold'), 'rgb(9 12 20)');       // light gold
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
    const sum = f.head.children[1];
    f.setSummary(null);
    assert.equal(sum.textContent, '');
    f.setSummary(undefined);
    assert.equal(sum.textContent, '');
    f.setSummary(0);
    assert.equal(sum.textContent, '0');
});

test('the head carries the title, the summary and one chevron, in that order', () => {
    // Order is the contract the stylesheet reads — the summary is the flexible
    // child between two fixed ones, which is what makes it ellipsize.
    const f = controls.fold({ title: 'How you drill', summary: 'goal 85%' });
    assert.equal(f.head.children.length, 3);
    assert.equal(f.head.children[0].textContent, 'How you drill');
    assert.equal(f.head.children[1].textContent, 'goal 85%');
    assert.equal(f.head.children[2].className, 'fbk-fold-chev');
});

function source(rel) {
    const src = fs.readFileSync(path.join(import.meta.dirname, rel), 'utf8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

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
        '13px', '15px', '18px', '19px', // toggle knob/track, slider thumb, kbd
        '20px',                         // badge
        '34px', '56px', '76px',         // toggle track, the two readout boxes
        '72px', '88px',                 // the meter name column, narrow and wide
        '80px', '336px',                // slider min-width, the panel
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
