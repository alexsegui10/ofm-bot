#!/usr/bin/env bash
# PostToolUse hook for Edit/Write — runs lint and unit tests on modified JS/TS/JSON files
# Input: JSON on stdin with tool result info

set -uo pipefail

INPUT=$(cat)

# Extract the file path that was edited/written
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# tool_input contains the original parameters
tool_input = d.get('tool_input', {})
print(tool_input.get('file_path', tool_input.get('path', '')))
" 2>/dev/null || echo "")

# Only process JS, TS, and JSON files
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

EXT="${FILE_PATH##*.}"
if [[ "$EXT" != "js" && "$EXT" != "ts" && "$EXT" != "mjs" && "$EXT" != "cjs" && "$EXT" != "json" ]]; then
  exit 0
fi

# Must be inside a project with package.json
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [[ -z "$REPO_ROOT" ]]; then
  exit 0
fi

PKG="$REPO_ROOT/package.json"
if [[ ! -f "$PKG" ]]; then
  exit 0
fi

ERRORS=""

# Run lint if script exists
HAS_LINT=$(python3 -c "
import json
with open('$PKG') as f:
    d = json.load(f)
scripts = d.get('scripts', {})
print('yes' if 'lint' in scripts else 'no')
" 2>/dev/null || echo "no")

if [[ "$HAS_LINT" == "yes" ]]; then
  echo "[post-edit-validate] Running lint on $FILE_PATH..." >&2
  LINT_OUT=$(cd "$REPO_ROOT" && npm run lint -- "$FILE_PATH" 2>&1) || {
    ERRORS="$ERRORS\n--- LINT ERRORS ---\n$LINT_OUT"
  }
fi

# Run unit tests for the modified file if test:unit script exists
HAS_TEST=$(python3 -c "
import json
with open('$PKG') as f:
    d = json.load(f)
scripts = d.get('scripts', {})
print('yes' if 'test:unit' in scripts else 'no')
" 2>/dev/null || echo "no")

if [[ "$HAS_TEST" == "yes" && "$EXT" != "json" ]]; then
  echo "[post-edit-validate] Running unit tests for $FILE_PATH..." >&2
  TEST_OUT=$(cd "$REPO_ROOT" && npm run test:unit -- --testPathPattern="$(basename "$FILE_PATH" ".$EXT")" 2>&1) || {
    ERRORS="$ERRORS\n--- TEST ERRORS ---\n$TEST_OUT"
  }
fi

# Report errors back to assistant (non-blocking — exit 0)
if [[ -n "$ERRORS" ]]; then
  echo -e "[post-edit-validate] Issues found after editing $FILE_PATH:$ERRORS" >&2
fi

exit 0
