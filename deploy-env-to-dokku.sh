#!/usr/bin/env bash
set -e

# Deploy .env to Dokku (arkits@agnee).
# Usage: ./deploy-env-to-dokku.sh [APP_NAME]
#   APP_NAME defaults to "stock-trader" if omitted.

SSH_TARGET="arkits@agnee"
APP_NAME="${1:-stock-trader}"
ENV_FILE="${ENV_FILE:-.env}"
REMOTE_TMP="/tmp/deploy-env-$$"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found." >&2
  exit 1
fi

echo "Deploying $ENV_FILE to Dokku app '$APP_NAME' at $SSH_TARGET ..."

# Filter .env and copy to server so we can run one dokku config:set (fewer sudo prompts).
TMP_ENV=$(mktemp)
trap 'rm -f "$TMP_ENV"' EXIT
grep -v '^#' "$ENV_FILE" | grep -v '^[[:space:]]*$' > "$TMP_ENV"

scp -q "$TMP_ENV" "$SSH_TARGET:$REMOTE_TMP"

# -t forces a TTY so you can enter the sudo password when prompted (at most twice).
ssh -t "$SSH_TARGET" "readarray -t lines < $REMOTE_TMP; dokku config:set --no-restart $APP_NAME \"\${lines[@]}\"; dokku ps:restart $APP_NAME; rm -f $REMOTE_TMP"

echo "Done. App '$APP_NAME' config updated and restarted."
