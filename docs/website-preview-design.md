# Website preview — Wave 4 design (not enabled)

Add a flag-off-by-default **Website** tab beside **Live** in Run. Live continues to execute the canvas tree and runtime. Website previews generated export code, not NodeView, and is the preview for judging deployment.

## Build path

Generate the export files in memory with the existing React/PWA exporter. Those files are a React/TypeScript project, not an already executable HTML page: a browser-side compiler/bundler and locally available React runtime assets are required. Bundle them in a worker, without a server or user secrets, and create a self-contained HTML blob. Do not assume that creating a blob from the source files alone is a working website. No service worker is registered in the blob preview.

Benchmark representative tea and larger projects on target devices. If the complete generate-and-bundle path cannot reliably finish within five seconds, generate on demand and show “Building your site…” with progress, errors and retry. The flag must remain off until the bundler, security, performance, and export parity tests pass.

## Isolation and lifecycle

Load the resulting blob in an iframe sandboxed with `allow-scripts` only: no same-origin permission, popups, top navigation or external requests by default. A restrictive CSP should block unexpected network access; surface blocked external assets honestly. This preview is not a substitute for testing the deployed PWA, service worker, or external APIs. Revoke old object URLs when rebuilding, changing projects, or closing the tab, and terminate the worker. Never inject secrets into the bundle.

## Acceptance checks

Compare the preview with a separately built export for layout and behavior at compact, medium and expanded widths; test generated nav, hero, responsive CSS and navigation. Check that the tab is invisible while the flag is off, that iframe isolation holds, that URL/worker resources are released, and that a failed or cancelled build never presents a stale page as current. Record measured timings rather than promising the five-second target without evidence.
