#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NVMRC_PATH="$PROJECT_ROOT/.nvmrc"

if [[ ! -f "$NVMRC_PATH" ]]; then
  echo "Mission Control runtime pin missing: $NVMRC_PATH" >&2
  exit 1
fi

PROJECT_NODE_VERSION="$(tr -d '[:space:]' < "$NVMRC_PATH")"
if [[ -z "$PROJECT_NODE_VERSION" ]]; then
  echo "Mission Control runtime pin is empty: $NVMRC_PATH" >&2
  exit 1
fi

if [[ "$PROJECT_NODE_VERSION" != v* ]]; then
  PROJECT_NODE_DIR="$HOME/.nvm/versions/node/v${PROJECT_NODE_VERSION}/bin"
else
  PROJECT_NODE_DIR="$HOME/.nvm/versions/node/${PROJECT_NODE_VERSION}/bin"
fi

NODE_BIN="$PROJECT_NODE_DIR/node"
NPM_BIN="$PROJECT_NODE_DIR/npm"

if [[ ! -x "$NODE_BIN" || ! -x "$NPM_BIN" ]]; then
  echo "Mission Control requires Node ${PROJECT_NODE_VERSION} via NVM." >&2
  echo "Expected binaries:" >&2
  echo "  $NODE_BIN" >&2
  echo "  $NPM_BIN" >&2
  echo "Install it with:" >&2
  echo "  nvm install ${PROJECT_NODE_VERSION}" >&2
  exit 1
fi

export PATH="$PROJECT_NODE_DIR:$PATH"

if [[ $# -eq 0 ]]; then
  exec "$NODE_BIN" -p "JSON.stringify({ node: process.version, modules: process.versions.modules }, null, 2)"
fi

if [[ "$1" == "node" ]]; then
  shift
  exec "$NODE_BIN" "$@"
fi

if [[ "$1" == "npm" ]]; then
  shift
  exec "$NPM_BIN" "$@"
fi

exec "$@"
