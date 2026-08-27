#!/usr/bin/env bash
# Cut a Rundown release: bump from the latest published version, then tag, which
# is what starts the build. CI stamps the version from the tag, signs, notarizes
# and publishes with the updater metadata.
set -euo pipefail

BUMP="${1:?usage: scripts/release.sh patch|minor|major [notes]}"
REPO="nilbuild/rundown"

# Release notes for the GitHub release body. Pass as the second argument, or
# leave it off to be prompted. Empty falls back to the workflow's default.
NOTES="${2:-}"
if [ -z "$NOTES" ] && [ -t 0 ]; then
  echo "Release notes (end with Ctrl-D on a blank line, or Ctrl-D now to skip):" >&2
  NOTES=$(cat)
fi

# Releasing anything other than what is on the remote would ship a version whose
# source nobody can look at.
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit or stash first." >&2
  exit 1
fi
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD is not origin/main. Push first." >&2
  exit 1
fi

CUR=$(gh api "repos/$REPO/releases/latest" -q .tag_name 2>/dev/null || echo "v0.0.0")
CUR="${CUR#v}"

NEW=$(python3 - "$CUR" "$BUMP" <<'PY'
import sys
cur, bump = sys.argv[1], sys.argv[2]
maj, mn, pa = (int(x) for x in (cur.split(".") + ["0", "0", "0"])[:3])
if bump == "major": maj, mn, pa = maj + 1, 0, 0
elif bump == "minor": mn, pa = mn + 1, 0
elif bump == "patch": pa = pa + 1
else: sys.exit("bump must be patch, minor, or major")
print(f"{maj}.{mn}.{pa}")
PY
)

echo "Releasing v$NEW (was v$CUR)"

# Annotate the tag with the notes so the workflow can read them back as the
# release body.
git tag -a "v$NEW" -m "${NOTES:-}"
git push origin "v$NEW"

echo "Tagged v$NEW"
echo "Build: https://github.com/$REPO/actions"
