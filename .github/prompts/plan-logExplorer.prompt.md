## Plan: High-performance Log Explorer

Build a new root-level single-file HTML app named LogExplorer.html for fast UTF-8 log exploration with no wrapping, virtualized vertical rendering, a custom horizontal scrollbar, and a selectable chain of operations. The design prioritizes speed by caching full stage outputs, especially for Replace and Diff, and by reusing previously computed results when users switch selected rows.

**Steps**
1. Phase 1 - App shell, inputs, and state model. Create LogExplorer.html with the repository’s single-file structure (header, toolbar, drop zone, workspace, operator panel, help/profile dialogs). Support content ingestion from both file drop/open and clipboard paste. Define a centralized state object for source metadata, decoded UTF-8 text, line index, viewport, selection, operator list, selected row, stage cache, and profiles.
2. Phase 2 - Ingestion and encoding normalization. On file drop/open or pasted content, detect encoding using BOM and fallback heuristics (including UTF-16 patterns), then normalize input to UTF-8 text before indexing. Keep original source metadata for diagnostics, but treat the normalized UTF-8 text as the canonical processing input.
3. Phase 3 - Large-file line index and virtual rendering. Build line start/end indexes from normalized text, keep rows non-wrapping, and render only visible rows plus buffer. Reuse the vertical virtualization and custom-scroll math patterns from AdvancedHexEditor, but implement horizontal virtualization so huge line widths do not create oversized DOM or native scroll lag.
4. Phase 4 - Custom scroll behavior and selection/copy. Implement custom horizontal scrollbar with Ctrl+wheel controlling horizontal movement and normal wheel controlling vertical movement. Use row/column coordinate selection for copyable text and parameter prefills. Maintain copy correctness for single-line, multi-line, and virtualized regions independent of rendered DOM fragments.
5. Phase 5 - Operator rows, selection semantics, disable/reorder. Represent each operation as one row with type-specific parameters, selectable stage marker, enabled/disabled toggle, and drag or button-based reordering. Pipeline evaluation includes only enabled operations from the top down to the selected row; disabled rows are skipped and visually grayed out.
6. Phase 6 - High-speed staged pipeline with persistent caching. Build stage outputs as cached artifacts keyed by operation signature and upstream stage hash. Prioritize whole-stage transformed content for expensive operations (especially Replace and Diff) rather than only line-index references, so repeated row clicks do not recompute unchanged stages. Add cancellation/progress handling for long recomputations.
7. Phase 7 - Operator implementations with explicit grouped behavior.
   Filter: include and exclude string lists, per-string case-sensitivity.
   Replace: string-to-string replacement, including delete, split, and concat scenarios when line breaks appear in source/target.
   Sort: positional and anchor BEFORE/AFTER modes with typed parsing (string, number, date-time, time span). Explicit grouped behavior: lines whose key cannot be parsed at the target position are grouped with the nearest preceding line that does parse, and the whole group is sorted as one block.
   Diff: positional typed difference to previous logical comparable line with invert mode to restore original content after normal diff. Explicit grouped behavior: lines whose value cannot be parsed are grouped with the nearest preceding parsable line, and diff is applied/restored per block, preserving grouped block integrity.
8. Phase 8 - Next-filter preview highlighting. If the immediate next operation after the currently selected row is an enabled Filter, preview its effect by rendering lines that would be filtered out in blue text (instead of default black) while keeping the selected-stage output unchanged.
9. Phase 9 - Profiles, persistence, import/export. Persist operator rows (including order, enabled state, parameters, and selected row) in localStorage with named profiles and a last-used working set. Support JSON export/import by download, open, and drop with schema validation and versioning.
10. Phase 10 - Output actions. Add download and clipboard actions for the current visible stage, plus special clipboard tools: column copy across all rows from [pos,len] and rectangular block copy from [startPos,endPos] across selected line span.
11. Phase 11 - Documentation and repository index update. Add concise in-app help for ingestion paths (drop/open/paste), encoding normalization, grouped Sort/Diff rules, disabled rows, reorder behavior, and next-filter blue preview. Update README with a link to LogExplorer.html.

**Relevant files**
- /home/bohdan/DEV/singleHtmlApps/AdvancedHexEditor.html — reference virtual rendering, custom scrollbar interaction, and drop/open patterns.
- /home/bohdan/DEV/singleHtmlApps/Print File Tools/PJL_PCL6_Inspector.html — reference centralized state model and panel-oriented single-file UI structure.
- /home/bohdan/DEV/singleHtmlApps/README.md — add app entry after implementation.
- /home/bohdan/DEV/singleHtmlApps/LogExplorer.html — new app file containing all UI, pipeline, caching, persistence, and export/copy logic.

**Verification**
1. Load content through all ingestion paths: dropped file, opened file, and pasted clipboard text; verify all are normalized to UTF-8 and displayed as non-wrapping rows.
2. Test UTF-16 (LE/BE with BOM and typical BOM-less samples) and verify conversion to correct UTF-8 text before operations.
3. Validate virtual vertical/horizontal rendering on large logs (target about 100 MB) and confirm Ctrl+wheel horizontal scrolling remains smooth.
4. Validate stage selection with mixed enabled and disabled rows, and confirm reorder changes dependency order correctly.
5. Validate grouped Sort and grouped Diff semantics with crafted mixed-type datasets, confirming non-parsable lines stay attached to the nearest preceding parsable line as one sortable/diffable block.
6. Validate next-filter preview: when next row is enabled Filter, lines that would be filtered are shown in blue without changing selected-stage data.
7. Confirm cache reuse by repeatedly switching selected rows and measuring that unchanged stages are not recomputed.
8. Verify Replace and Diff performance on large transformed outputs and ensure cancellation/progress behavior works for expensive recomputations.
9. Verify full copy, column copy, block copy, and download all reflect the currently selected stage output.
10. Verify profile save/restore/export/import preserve operator order, enabled states, selected row, and parameters.

**Decisions**
- App name and target file are LogExplorer.html.
- Ingestion scope includes file drop/open and clipboard paste.
- Non-UTF-8 inputs (for example UTF-16) are normalized to UTF-8 before indexing/operations.
- Performance preference is explicit: cache and reuse full stage outputs where beneficial, especially Replace and Diff.
- Sort and Diff both use grouped block semantics for non-parsable lines tied to the nearest preceding parsable anchor line.
- Operator rows support disable/enable and reordering; disabled rows are excluded from effective pipeline execution.

**Further Considerations**
1. For very large transformed stages, store both full joined text and per-line arrays lazily so export/copy is O(1) for whichever representation is requested first.
2. Keep cache eviction policy bounded (for example LRU by estimated byte size) to prevent memory spikes when users edit many operation variants.
3. Provide a small encoding status indicator in the toolbar so users can confirm when conversion from UTF-16 or other detected encodings occurred.
