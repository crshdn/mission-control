#!/bin/sh
set -eu

mkdir -p /data /data/workspace /data/workspace/projects
chown -R 1000:1000 /data || true

exec "$@"
