# Single-file HTML apps

Open any app directly from the links below. The list mirrors the repository structure so folder-based apps stay grouped together.

## Apps

- [Calculator](https://koudelkab.github.io/singleHtmlApps/calculator.html) - Standard, exact-fraction, scientific, and programmer calculator with DEG/RAD, base conversion, 8–64-bit integer and bitwise operations, memory, history, keyboard input, and clipboard support.
- [Hex Editor and Comparer](https://koudelkab.github.io/singleHtmlApps/HexEditorAndComparer.html) - Hex editor for inspecting, editing, and comparing binary files, with search, selection, and download support.
- [Image Browser for Chrome](https://koudelkab.github.io/singleHtmlApps/ImageBrowser_chrome.html) - Chrome File System Access based image browser with directory history, folder navigation, filtering, sorting, lazy-loaded previews, virtual scrolling, and fullscreen lightbox browsing.
- [Log Explorer](https://koudelkab.github.io/singleHtmlApps/LogExplorer.html) - UTF-8 log viewer with virtual scrolling, staged Filter/Replace/Sort/Diff operations, drag-and-drop multi-file input, clipboard input, and profile persistence. [Pipeline examples](https://koudelkab.github.io/singleHtmlApps/LogExplorerGuide.html).
- [Word Search Generator](https://koudelkab.github.io/singleHtmlApps/OsmismerkaGenerator.html) - Localized Czech/English word-search builder with a fixed hidden phrase, required words, optional dictionary words, solution highlighting, print, and TXT export.
- Print File Tools/
  - [PJL / PCL XL Inspector](https://koudelkab.github.io/singleHtmlApps/Print%20File%20Tools/PJL_PCL6_Inspector.html) - Inspector for PJL and PCL XL print jobs that shows the block tree, typed attributes, offsets, and raw payloads.

## Notes

- Most apps are designed to open files you drop into the page, and some support multiple files or bundled inputs.
- Some apps also let you export or download the modified result after editing.

## Tests

Run the complete regression suite from the repository root with Node.js 22 or newer:

```sh
node tests/run.cjs
```

No packages need to be installed. Tests exercise the actual inline scripts and functions, including calculations, file parsing, sorting, asynchronous loading, clipboard fallbacks, and error recovery. Lightweight DOM adapters check event handlers; browser rendering and real file-picker/clipboard permissions still require a browser smoke test.
