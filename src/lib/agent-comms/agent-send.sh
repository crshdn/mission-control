#!/bin/bash
# Usage: agent-send.sh <from> <to> <message>
MAILBOX_DIR="/tmp/openclaw-mailbox"
[ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] && echo "Usage: agent-send.sh <from> <to> <message>" && exit 1
mkdir -p "$MAILBOX_DIR"
echo "{\"from\":\"$1\",\"to\":\"$2\",\"message\":\"$3\",\"ts\":$(date +%s)}" >> "$MAILBOX_DIR/$2.jsonl"
echo "Sent to $2"
