# Sift

A macOS Hacker News client that reads threads for you, and can prove it read them.

Sift is built around one idea: an AI summary of a discussion is only useful if you can
get back to the actual sentence someone wrote. Every quote in a generated digest carries
its author and its comment id, and every one of them is checked against the real thread
before you see it. Quotes that cannot be found are labelled, not quietly shipped.

All model calls run through the `claude` or `codex` CLI already installed on your Mac, so
they use the subscription you are already signed in to. No API key is stored, and no
account credentials pass through this app.

## What it does

**Read.** Six HN feeds, search, a comment tree with collapse and per-comment actions, and
a reader view that strips the linked article down to markdown — images, tables, and code
blocks included.

Article extraction is readability followed by an HTML cleanup pass, because converters
reliably break on two things: an `<a>` wrapping block content (embeds and cards, which have
no markdown spelling and swallow the whole block into `[...]`), and `<img>` carrying
`srcset` and framework attributes, which survives as a literal tag in the prose. Both are
normalised before conversion, and a final pass strips any tag that still got through
without touching autolinks, `a < b`, or fenced code.

**Rundown.** The default tab, and the one to read if you only read one. It merges the article
and the discussion into a single account of the subject, in plain prose, with no "commenters
said" framing anywhere — where the thread corrects the article, the corrected version is what
you get, near the top. Three reading depths, chosen from the toolbar with the cost of each shown: **Gist** is the
opening line and the headings, **Skim** adds each section's opening point, **Full** is
everything. One generation, three depths — the model is asked to make each section's first
paragraph stand on its own, so skimming reads as prose rather than as a truncation.

Sources are demoted to a small dot after the claim: hover it to read the comment behind that
sentence, click to jump to it. Numbers and an end-of-page source list were tried and removed —
a number is a pointer into a list, so without the list it is noise on every claim. Adjacent
markers merge, so one dot can carry several sources.

A briefing is paraphrase, so there is nothing to match verbatim. What is checked is that every
source it points at is real — an invented comment id is flagged in the toolbar, marked red
inline, and listed under "Unverified sources". Being able to check the paraphrase in one hover is the rest of the answer.

**Digest.** Built to be scanned, not read. It opens with a verdict — read, skim, or skip —
and the cost of each choice ("6 min here · 51 min in the thread"). Below that the thread's
argument is an outline: every point is a heading that carries information plus one sentence
stating it in full, so reading only the headings still gets you the thread. Quotes stay
folded until you want the evidence. Disagreements are kept as disagreements, with both
sides in the same section, and it ends with what the thread did not settle.

**Ask.** Highlight anything — article, comment, or digest — and Explain, Challenge, or ask
your own question. The whole thread and article are already in the model's context. The
first question pays for that context; every follow-up resumes the same provider session and
hits the prompt cache.

**Presets.** Saved questions you can fire at any thread from the composer, and the same list
seeds the starting suggestions. Ships with five — best takes, the disagreement, what surprised
you, talking past it, what's wrong. Save any question you have typed, or edit the list with
`⌘P`.

**Find.** `⌘F` searches the open thread by body text or author, with match stepping and both
the current hit and every other hit marked. `n` and `p` walk the top-level comments.

**Prefetch.** A couple of seconds after you open a thread, the digest starts generating in
the background, so it is finished or already streaming by the time you switch tabs. The
delay means paging through the list with `j`/`k` costs nothing, and threads already
digested, or with almost no comments, are skipped. Off in Settings if you'd rather not.

**Models per job.** The digest defaults to the deepest model, the inline brief to the
fastest, chat to the middle. Set individually in Settings, since the tradeoff is
different for something you read once versus something you wait on.

**New since last time.** Reopening a thread tells you how many comments arrived since you
last looked, marks each one, and steps through them. The markers retire themselves once a
comment has actually been on screen, so they stop claiming to be new after you have read
them.

## Verification

Generated digests are parsed for `> quote` / `— [@author](hn:id)` pairs and each is
classified:

| Status | Meaning |
| --- | --- |
| verified | Found verbatim in the cited comment |
| shortened (`≈`) | Found, but reflowed or elided with `...` |
| unverified | The comment exists and does not contain that text |
| wrong author | The text is real but belongs to someone else |
| unknown id | No such comment in this thread |

Matching tolerates the things a faithful quote legitimately changes — whitespace, smart
quotes, markdown links, HN's `[1]` footnote markers — and tolerates declared elisions in
proportion to how many ellipses the quote contains. It does not tolerate words that are not
there. `cargo test --lib` covers both directions, including a fabricated quote that must
fail and a heavily elided real one that must pass.

## Running it

Requires Node 20+, Rust, and at least one of the `claude` or `codex` CLIs on your PATH.

```sh
pnpm install
pnpm test               # frontend unit tests
pnpm tauri dev          # development
pnpm tauri build        # produces src-tauri/target/release/bundle/macos/Sift.app
```

To check the pipeline end to end against a real thread without opening the app:

```sh
cd src-tauri
cargo run --example e2e -- 49273478 sonnet          # fetch, digest, verify
cargo run --example e2e -- 49273478 sonnet out.md   # re-verify a saved digest
```

## Keyboard

| | |
| --- | --- |
| `⌘K` | Command palette (type `?` to search HN) |
| `⌘F` | Find in thread (`enter` / `⇧enter` to step) |
| `j` / `k` | Move through the story list |
| `n` / `p` | Next / previous top-level comment |
| `space` / `⇧space` | Page down / up in the reader |
| `↑` `↓` `PgUp` `PgDn` `Home` `End` | Scroll the reader |
| `⌘1`–`⌘4` | Rundown, Article, Comments, Digest |
| `⌘D` | Digest this thread |
| `⌘\` | Show or hide the chat pane |
| `⌘R` | Reload the thread, bypassing cache |
| `⌘P` | Presets |
| `⌘,` | Settings |

## How it is put together

```
src-tauri/src/
  hn.rs        Firebase for feed order, Algolia for whole comment trees in one request
  article.rs   Fetch and reduce a linked page to markdown
  prompts.rs   Prompt text and budget-aware context packing
  ai.rs        Runs claude/codex as a subprocess, streams deltas back as events
  verify.rs    Checks every quote against the thread it claims to come from
  store.rs     SQLite: cache, generated output, chat sessions, settings
src/
  state/app.ts Single zustand store
  components/  Sidebar, Reader, ChatPane, Markdown, palette
```

Model runs are spawned with all tools disabled, so a run is pure inference: no file access,
no permission prompts, and nothing that can wander. One-shot runs do not persist a session;
chat turns do, so they can be resumed.

Threads larger than the context budget are packed by a score that favours substantial,
well-replied-to, shallow comments. When that happens the digest screen says how many of the
thread's comments were actually sent, rather than implying full coverage.

## Data

Threads, articles, generated output, and chat sessions live in one SQLite file at
`~/Library/Application Support/sift/sift.sqlite3`. Nothing leaves the machine except the
text sent to the model you picked.
