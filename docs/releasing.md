# Releasing

```sh
make patch    # 0.1.0 -> 0.1.1
make minor    # 0.1.0 -> 0.2.0
make major    # 0.1.0 -> 1.0.0
```

It asks for release notes, refuses to run on a dirty tree or a branch that is
not pushed, then tags. The tag starts the build.

CI stamps the version from the tag, so `tauri.conf.json` never has to be edited
by hand and a release cannot claim a version its source does not have. The build
produces a universal `.dmg` — Apple Silicon and Intel in one file — signs and
notarizes it, publishes the GitHub release, and writes the `latest.json` that
installed copies read to find updates.

## Secrets

Two are set. Six are not, and until they are, every download is blocked by
Gatekeeper with "Rundown is damaged and can't be opened".

| Secret | Set | What it is |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | yes | Signs updates. Installed copies refuse an update that does not match the public key baked into the app. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | yes | Empty — the key has no password. |
| `APPLE_CERTIFICATE` | no | Developer ID Application certificate, exported as `.p12`, then base64. |
| `APPLE_CERTIFICATE_PASSWORD` | no | The password set when exporting the `.p12`. |
| `APPLE_SIGNING_IDENTITY` | no | e.g. `Developer ID Application: Your Name (TEAMID)`. |
| `APPLE_ID` | no | The Apple ID that owns the developer account. |
| `APPLE_PASSWORD` | no | An app-specific password, not the account password. |
| `APPLE_TEAM_ID` | no | The 10-character team ID. |

The Apple six are the same values another app of yours already uses, so they can
be copied across rather than created again:

```sh
gh secret set APPLE_CERTIFICATE --repo nilbuild/rundown < certificate.b64
gh secret set APPLE_SIGNING_IDENTITY --repo nilbuild/rundown
# ...and so on for the rest
```

## The updater private key

Signing updates is not the same as signing the app. Gatekeeper cares about the
Apple certificate; the app itself checks the update against a public key baked
into the binary at build time.

That key lives in two places: as `TAURI_SIGNING_PRIVATE_KEY` on this repository,
and at `~/.rundown-updater.key` on the machine that generated it. GitHub cannot
show it to you again. **Put a copy in a password manager.**

Losing it means every installed copy stops accepting updates, permanently —
there is no way to re-sign for a public key that is already in the wild. The only
way out is shipping a new version with a new key, which everyone has to download
by hand.

## What is not built

macOS only, on purpose. The window uses an overlay title bar and the sidebar
reserves space for the traffic lights, so a Linux or Windows build would compile
and then look wrong. Those need per-platform window chrome before the workflow
should build them.
