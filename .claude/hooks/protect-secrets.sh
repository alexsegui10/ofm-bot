#!/usr/bin/env bash
# PreToolUse hook for Edit/Write — blocks accidental secret commits
# Input: JSON on stdin with tool input (fields vary by tool)

set -euo pipefail

INPUT=$(cat)

# Extract content to inspect (handles both Edit new_string and Write content)
CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# Write tool uses 'content', Edit uses 'new_string'
text = d.get('content', d.get('new_string', ''))
print(text)
" 2>/dev/null || echo "")

# Also check file path — never write outside repo
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('file_path', d.get('path', '')))
" 2>/dev/null || echo "")

# Helper to block
block() {
  echo "BLOCKED: $1" >&2
  echo "{\"decision\": \"block\", \"reason\": \"$1\"}"
  exit 2
}

# 1. Block writes outside the repo (absolute paths not under ofm-bot)
if [[ -n "$FILE_PATH" ]]; then
  if echo "$FILE_PATH" | grep -qE '^/(root|etc|var|boot|usr|home/(?!.*ofm-bot))'; then
    block "Write to path outside repository: $FILE_PATH"
  fi
fi

if [[ -z "$CONTENT" ]]; then
  exit 0
fi

# 2. Anthropic / OpenAI API keys
if echo "$CONTENT" | grep -qE 'sk-[a-zA-Z0-9]{20,}'; then
  LINE=$(echo "$CONTENT" | grep -n 'sk-[a-zA-Z0-9]\{20,\}' | head -1)
  block "Possible API key detected (sk-... pattern) at: $LINE"
fi

# 3. Slack tokens
if echo "$CONTENT" | grep -qE 'xoxb-[a-zA-Z0-9\-]+|xoxa-[a-zA-Z0-9\-]+'; then
  block "Possible Slack token detected (xoxb-/xoxa- pattern)"
fi

# 4. Private key blocks
if echo "$CONTENT" | grep -qE 'BEGIN (PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|OPENSSH PRIVATE KEY)'; then
  block "Private key block detected in content"
fi

# 5. Hardcoded passwords (common patterns)
if echo "$CONTENT" | grep -qE "password\s*=\s*['\"][^'\"]{8,}['\"]|passwd\s*=\s*['\"][^'\"]{8,}['\"]"; then
  LINE=$(echo "$CONTENT" | grep -in "password\s*=\s*['\"]" | head -1)
  block "Possible hardcoded password detected at: $LINE"
fi

# 6. NowPayments / PayPal / Twilio-style tokens
if echo "$CONTENT" | grep -qE 'AC[a-z0-9]{32}|SK[a-z0-9]{32}'; then
  block "Possible Twilio SID/token detected"
fi

# All clear
exit 0
