#!/usr/bin/env bash
# Downloads the new bug reports into examples/ and deletes them from the
# report server. See scripts/pull-reports.js.
#
#   ./pull-reports.sh [--server https://...]

set -e
cd "$(dirname "$0")"
node scripts/pull-reports.js "$@"
