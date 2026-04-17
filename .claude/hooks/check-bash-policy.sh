#!/usr/bin/env bash
# PreToolUse hook for Bash — blocks dangerous commands
# Input: JSON on stdin with tool input (field: "command")

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || echo "")

COMMAND_LOWER=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]')

# Helper to block
block() {
  echo "BLOCKED: $1" >&2
  echo "{\"decision\": \"block\", \"reason\": \"$1\"}"
  exit 2
}

# 1. Destructive rm patterns
if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+/|rm\s+-rf\s+~'; then
  block "Destructive rm -rf on root or home directory detected"
fi

# 2. Database drops (case insensitive)
if echo "$COMMAND_LOWER" | grep -qE 'drop\s+database|drop\s+table'; then
  block "Destructive SQL DROP DATABASE/TABLE detected"
fi

# 3. Dangerous redirections to critical files
if echo "$COMMAND" | grep -qE ':>\s*(\/etc|\/var|\/root|\/boot)'; then
  block "Dangerous redirection to system directory detected"
fi

# 4. Access to paths outside this repo
if echo "$COMMAND" | grep -qE '\/root\/openclaw|\/etc\/|\/var\/log\/'; then
  block "Access to path outside repository detected: /root/openclaw, /etc/, or /var/log/"
fi

# 5. Force push to main/master
if echo "$COMMAND" | grep -qE 'git\s+push.*--force.*(main|master)|git\s+push.*-f.*(main|master)'; then
  block "Force push to main/master branch is not allowed"
fi

# All clear
exit 0
