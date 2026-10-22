// react-lang mounts the OpenUI devtools widget in development unless this flag
// is already set when it loads. ELYSIUM: never — the screen runs inside a sandbox
// and the widget would fetch its script from a CDN. Import this before any OpenUI package.
(globalThis as Record<symbol, unknown>)[Symbol.for("openui.devtools.autoMount")] = true;

export {};
