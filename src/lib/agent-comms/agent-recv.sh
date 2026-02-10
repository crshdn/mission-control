#!/bin/bash
# Usage: agent-recv.sh <label> [--wait <seconds>]
MAILBOX_DIR="/tmp/openclaw-mailbox"
MAILBOX="$MAILBOX_DIR/$1.jsonl"
[ -z "$1" ] && echo "Usage: agent-recv.sh <label> [--wait <seconds>]" && exit 1
mkdir -p "$MAILBOX_DIR"
if [ "$2" = "--wait" ]; then
  timeout=${3:-30}
  for i in $(seq 1 $timeout); do
    [ -f "$MAILBOX" ] && [ -s "$MAILBOX" ] && cat "$MAILBOX" && exit 0
    sleep 1
  done
  echo "TIMEOUT: No messages after ${timeout}s" && exit 1
else
  [ -f "$MAILBOX" ] && [ -s "$MAILBOX" ] && cat "$MAILBOX" || echo "NO_MESSAGES"
fi
