# TXTify documentation

This document explains how TXTify works, why each part exists, and how to maintain it.

## 1. Design goals

1. **Local only.** Files are converted in the browser. Nothing is uploaded.
2. **Free to run.** The app is static files. Any static host works, so there is no server to pay for or keep alive.
3. **No build step for the app.** `index.html` is edited and shipped as is. Only one optional bundle (`data-engines.js`) needs a build.
4. **No AI or paid service** anywhere in the conversion.

## 2. Files and why each one exists

| File | What it is | Why it is separate |
| --- | --- | --- |
| `index.html` | Interface, CSS, search-engine tags and all application logic | One file keeps hosting and editing trivial. |
| `data-engines.js` | Readers for SAS, SPSS, Stata, Parquet and pickle, bundled into one script | Those libraries are written as Node-style modules (`statfmt` even imports `node:zlib`), so they cannot be loaded straight from a CDN. They are bundled once with esbuild, with `node:zlib` replaced by a stub. Serving the bundle from the same site is also faster and needs no third-party host. |
| `engines-src/` | `entry.js` (exposes `window.TXTLIBS`), `pk.js` (pickle reader), `zstub.js`, `package.json` | Lets anyone rebuild `data-engines.js` and check it matches the source. |
| `logo.svg` | The logo | Page logo, browser tab icon and README icon all point to this one file. Replace it (same name) to rebrand. |
| `og-image.png` | 1200x630 preview picture | Social networks and chat apps do not render SVG previews. |
| `sitemap.xml` | The page address | Helps search engines find the page. |
| `README.md` | Public project page | Short and user-facing. |
| `DOCS.md` | This document | Developer-facing detail. |
| `LICENSE` | MIT license | Makes the project open source. |

Heavy libraries that browsers can load directly (JSZip, SheetJS, mammoth, pdf.js, Tesseract.js, sql.js, 7z-wasm) are **not** bundled. They are fetched from `cdn.jsdelivr.net` at pinned versions, and only when a file of that type is added, so the first page load stays tiny.

## 3. How a file travels through the app

1. **Collect (`pick`, drop handler, `walk`).** Files come from the file picker, the folder picker (`webkitRelativePath`) or drag and drop (folders are walked with `webkitGetAsEntry`). Each file becomes an item with `file`, `rel` (path inside its folder or archive), `arc` (archive chain) and `path` (`arc + rel`).
2. **Expand (`expand`).** Junk such as `__MACOSX`, `.git`, `node_modules` and `.DS_Store` is dropped. Archives are opened: ZIP-like files with JSZip, everything else (RAR, 7z, TAR, GZ, ISO and more) with the 7-Zip engine running in WebAssembly on an in-memory file system. Files with an unknown extension are checked by their first bytes (magic numbers), so renamed or custom containers still open. Nesting is limited to 4 levels as a safeguard.
3. **Per-file options (`item.o`).** Each item stores `name`, `meta`, `compact` and `struct`. Changing a global option overwrites the value for every item; afterwards single items can be changed. `REL` and `DATA` are the lists of extensions where "relevant content" and "structure only" apply; the matching ticks are disabled for other files.
4. **Convert (`run`, `extract`).** `extract` picks a converter by extension (table in section 4). `run` converts up to 8 files in parallel (2 when OCR is on), remembers a cache key per file (options plus size) so only changed files are redone, and ignores results of an outdated run.
5. **Build (`hdr`, `build`).** The header is assembled from the per-file `name` and `meta` flags and the global field checkboxes (path, type, size, date, characters, lines). `gen` is the generated text; `edit` is the text you typed in Edit mode. An edit is kept only while `gen` stays identical, so reordering or toggling merge never loses it, while changing an option that alters the file's text resets that file's edit.
6. **Show (`show`).** Each file is its own block in the preview. That makes "click a file, scroll to it" exact and lets Edit mode change one file at a time. Merge on shows all blocks; merge off shows the selected file. Previews are cut at 200,000 characters per file so huge files do not freeze the page; Copy and Download always use the full text.
7. **Output.** Copy and Download use `getOut()` (edited text included). "Download all" zips one TXT per file.

## 4. Converters

| Input | Engine | Notes |
| --- | --- | --- |
| Text, code, logs, unknown text files | built in | Strict UTF-8, falling back to Windows-1252; UTF-16 detected by byte-order mark. A file with NUL bytes counts as binary. |
| JSON, HTML, SVG, XML | built in | "Only relevant content" minifies JSON, strips HTML markup, keeps SVG titles and text, trims XML indentation. |
| Jupyter notebooks | built in | Markdown and code cells; outputs only when relevant-only is off. |
| xlsx, xls, ods, dbf and more | SheetJS | One CSV block per sheet. |
| docx | mammoth | Raw text. |
| pptx, odt, odp, epub | JSZip | Text extracted from the XML parts. |
| pdf | pdf.js | Text layer only. Scanned PDFs report "no readable text". |
| Images | built in, Tesseract.js | Size always; OCR (English) when switched on. |
| SQLite | sql.js | Every table as CSV. |
| sas7bdat, xpt, sav, dta, por | `data-engines.js` (statfmt) | CSV plus variable labels. |
| Parquet | `data-engines.js` (hyparquet) | CSV. |
| Python pickle | `data-engines.js` (pickleparser + `pk.js`) | See section 6. |
| NumPy npy | built in | Header only (type and shape). |
| Unknown binary | optional strings mode | Pulls readable ASCII and UTF-16 strings; off by default and disabled in structure-only mode. |

Failures never stop a batch. Each failed file is listed with its reason, can be copied as a list, and can be removed with one click. With file name or info on, the list is also appended to the merged TXT.

## 5. Structure-only mode

Goal: give an AI the shape of a dataset without a single data value.

- **SAS, SPSS, Stata:** row count, column names, types, lengths, formats and labels (read from the file metadata).
- **SQLite:** the `CREATE` statements from `sqlite_master` plus a row count per table.
- **Parquet:** the schema from the file footer (the data pages are never read).
- **Spreadsheets and CSV/TSV:** row count, then each column's header and a guessed type from the first 1,000 rows. The first row is assumed to be the header. If a file has no header, that first row would be shown, so check such files.
- **NumPy:** dtype and shape from the header.
- **Pickle:** types only (section 6).
- JSON, XML and plain text are not data files in this sense and are kept as they are.

## 6. Python pickle support

Pickle is dangerous in Python because loading it can run code. TXTify never runs it. `pickleparser` only reads the byte stream and builds inert objects; any unknown class becomes a placeholder that records its name. `pk.js` registers a few safe decoders for NumPy arrays, dtypes and Arrow buffers, then:

- **Values mode:** prints dictionaries and lists as an indented outline, NumPy arrays with their first 100 values, and pandas DataFrames and Series as CSV.
- **Structure mode:** prints types and sizes only. For pandas tables it lists column names, dtypes and the row count. Dictionary keys and strings are deliberately **not** shown, because a key can itself be data.

Tested with pandas 2.2 and 3.0 pickles, protocol 2 and 4 pickles, NumPy arrays and plain Python objects. Not supported: MultiIndex labels, categoricals and other pandas extension arrays (reported by type name), joblib or PyTorch files.

## 7. Privacy and security model

- The app code has no `fetch`, `XMLHttpRequest`, beacon or WebSocket call. File contents are never passed to any network API.
- `index.html` starts with a Content-Security-Policy `<meta>` tag. In plain words the browser then refuses to: connect to any host except `cdn.jsdelivr.net`; load images from other hosts (except the optional counter pixel); submit forms; open frames or plugins. Scripts may only come from the page itself and `cdn.jsdelivr.net`. `unsafe-eval` and `wasm-unsafe-eval` are allowed because some bundled libraries need them, which does not widen network access.
- Library versions are pinned to exact numbers, so a CDN file cannot silently change.
- **What you still trust:** those pinned libraries, your browser and its extensions, and whoever hosts the page. For highly sensitive data use a private window without extensions, or bundle the libraries into the repository to remove the CDN entirely.
- **Verify it yourself:** open the browser developer tools, Network tab, add a file, and check that only library downloads appear.
- The CSP cannot stop a page from navigating away. That matters only if a trusted library were compromised, which is why versions are pinned.

## 8. Optional analytics

`index.html` contains `const GC='YOURCODE'` and the same word in the CSP `img-src`. Replace both with a GoatCounter site code to enable anonymous page-view counting. It is a single 1x1 image request carrying the page path, a title and the referrer: no cookies, no script from a third party, nothing about your files. It is skipped when the browser sends Do Not Track, on `localhost`, and when the page is opened from a file. Pages are separated by path, so several sites can share one GoatCounter dashboard.

## 9. Search engine optimisation

Title, meta description and H1 use the phrases people search for; the canonical URL, Open Graph and Twitter tags give clean link previews; JSON-LD (`SoftwareApplication`) describes the tool; a visible FAQ adds crawlable text; `sitemap.xml` lists the page. There is no `robots.txt` because crawlers read it only at the root of a domain, which a GitHub project page does not control. The canonical URL, `og:url`, `og:image` and the sitemap assume the address `https://rihalabs.github.io/txtify/`; change them together if the address changes.

## 10. Maintenance

**Rebuild `data-engines.js`:**

```
cd engines-src
npm install
npm run build
```

**Update a CDN library:** change its pinned version in `LIB` (and the 7z and sql.js URLs) in `index.html`, then test with sample files. The CSP already covers the CDN host.

**Add a format:**
1. Add a branch in `extract` (use `lib()` to load an engine on demand).
2. Add the extension to `DATA` and/or `REL` if structure-only or relevant-only applies.
3. If it is an archive, add it to `ARC`.
4. Test with a sample file, with structure-only on and off.

**Known limits:** encrypted archives, scanned PDFs (only images get OCR), OCR is English only, legacy `.doc` and `.ppt` only through the strings mode, `sas7bcat` catalogs, compressed `.zsav`, and very large files are limited by browser memory.
