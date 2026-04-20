#!/usr/bin/env bash
set -euo pipefail

# Usage:
# ./scripts/init-claude-ops.sh "MyProject" "https://github.com/ORG/REPO" "BysonTech"

PROJECT_NAME="${1:-}"
REPO_URL="${2:-}"
BRAND="${3:-}"

if [[ -z "$PROJECT_NAME" || -z "$REPO_URL" || -z "$BRAND" ]]; then
  echo "Usage: $0 \"MyProject\" \"https://github.com/ORG/REPO\" \"Brand\""
  exit 1
fi

# Edit only CLAUDE.local.md placeholders
perl -pi -e "s/__PROJECT_NAME__/${PROJECT_NAME}/g" CLAUDE.local.md
perl -pi -e "s#__REPO_URL__#${REPO_URL}#g" CLAUDE.local.md
perl -pi -e "s/__BRAND__/${BRAND}/g" CLAUDE.local.md

echo "Initialized CLAUDE.local.md. Now update:"
echo "- __STACK_SUMMARY__"
echo "- __SAFE_PATHS__ / __NO_TOUCH_PATHS__"
echo "- command placeholders (__INSTALL_CMD__ etc.)"
