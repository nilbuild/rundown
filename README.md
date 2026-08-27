<div align="center">
  <img src="src-tauri/icons/icon.png" alt="Rundown" width="88" height="88" />
  <h1>Rundown</h1>
  <p>A Hacker News client that summarises long threads and lets you chat with them.</p>
  <p>
    <img alt="License" src="https://img.shields.io/badge/license-MIT-2f7d55" />
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-c2521c" />
    <img alt="Works with Claude and Codex" src="https://img.shields.io/badge/Claude%20%7C%20Codex-CLI-1c1b1a" />
  </p>
</div>

A decent HN post can have 800 comments hanging off a 4,000 word article. Somewhere in
there are the four things worth knowing, and the only way to find them is to read the lot.

Rundown gives you the short version: what the article says, what the thread argued with it
about, and a chat you can point at either. Every quote keeps the comment it came from and
gets checked against the thread first, so you can go and read the real thing when it
matters.

It runs on the `claude` or `codex` CLI you already have installed, so it uses the
subscription you are signed in to. Nothing is stored anywhere but your own machine.

## Features

- **Briefing**: article and thread as one account, at three reading depths
- **Digest**: the discussion as an outline, each point backed by quotes
- **Chat**: ask about the thread; it is already loaded
- **Library**: search what you have read, or synthesise several threads at once
- **Reader**: the linked article as clean markdown

## Running it

Needs [Claude Code](https://claude.com/claude-code) or the
[Codex CLI](https://developers.openai.com/codex/cli) installed and signed in.

```sh
pnpm install
pnpm tauri dev      # run
pnpm tauri build    # build the app
```

## License

[MIT](LICENSE) © Kamran Ahmed
