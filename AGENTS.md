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

## Application architecture
- Keep the shared TRACE provider and shell in the root route so client navigation preserves the same session state.
- Use distinct leaf routes with route-local metadata for every command view; the existing KAVACH engine and primitives remain reusable.
- Keep hardware and simulation datasets isolated; remote transport belongs in the browser API abstraction, and reachability alone never establishes hardware connectivity.
- Keep the prototype session-local without provisioning services; deploy authenticated storage and ingestion explicitly before live deployment.
- Use local SVG tactical coordinates and CSS motion rather than map APIs or animation dependencies to keep rendering performant.
