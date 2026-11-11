<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Experiment configurations, baselines, and mock metrics live in canvas node data and use the existing workspace autosave; deterministic client-side predictions must remain explicitly distinguished from measured results.
- Keep experiment simulation and workspace export transformations in browser-safe pure modules, with tests; downloads use local blobs without external sharing services.
- Workspaces are offline-first: every save writes a per-user local cache entry marked pending, then pushes to the cloud; pending entries win on load and flush on reconnect, so edits survive offline periods and refreshes.
- Map history is a capped event log derived by diffing successive saved canvases (moves ignored) and stored with the workspace; replay renders a read-only derived canvas so live state and autosave are never touched.
- The agent activity feed persists locally per user and workspace; research reports are compiled by a pure module from canvas, relationships, feed and history, with tests.
