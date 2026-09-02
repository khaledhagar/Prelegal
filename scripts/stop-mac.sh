#!/usr/bin/env sh
# Stop Prelegal on macOS. The commands are identical on macOS and Linux, so
# both platforms share one implementation.
exec "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/lib/prelegal.sh" stop
