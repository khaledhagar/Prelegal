#!/usr/bin/env sh
#
# Shared implementation behind start-mac.sh, start-linux.sh and their stop
# counterparts. macOS and Linux run the identical commands, and the platform
# scripts exist because the technical design names them -- duplicating the logic
# into both would mean fixing every bug twice.
#
# Usage: prelegal.sh start|stop

set -eu

IMAGE_NAME="prelegal:local"
CONTAINER_NAME="prelegal"
PORT="${PRELEGAL_PORT:-8000}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

die() {
    echo "error: $*" >&2
    exit 1
}

require_docker() {
    command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH."
    docker info >/dev/null 2>&1 || die "docker is installed but not running -- start Docker and try again."
}

# Checked up front rather than left to the readiness loop, where a missing curl
# would look like an app that never starts.
require_curl() {
    command -v curl >/dev/null 2>&1 || die "curl is not installed or not on PATH."
}

# Polls until the app reports a ready database. The container is up long before
# the app is, so returning at `docker run` would hand the user a URL that
# refuses connections.
wait_until_ready() {
    attempt=0
    while [ "$attempt" -lt 60 ]; do
        if curl --silent --fail "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
            return 0
        fi
        # A container that has already exited will never become ready; say so
        # now rather than after the full timeout.
        if [ -z "$(docker ps --quiet --filter "name=^/$CONTAINER_NAME$")" ]; then
            echo "The container stopped during startup. Last output:" >&2
            docker logs "$CONTAINER_NAME" 2>&1 | tail -n 20 >&2
            return 1
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    echo "Timed out waiting for http://localhost:$PORT/api/health. Last output:" >&2
    docker logs "$CONTAINER_NAME" 2>&1 | tail -n 20 >&2
    return 1
}

start() {
    require_docker
    require_curl

    echo "Building $IMAGE_NAME ..."
    docker build --tag "$IMAGE_NAME" "$REPO_ROOT"

    # Replace any previous container. The database is rebuilt on startup anyway,
    # so there is nothing here worth preserving between runs.
    docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true

    echo "Starting $CONTAINER_NAME on port $PORT ..."
    docker run --detach \
        --name "$CONTAINER_NAME" \
        --publish "$PORT:8000" \
        "$IMAGE_NAME" >/dev/null

    if wait_until_ready; then
        echo "Prelegal is running at http://localhost:$PORT"
    else
        die "Prelegal failed to start."
    fi
}

stop() {
    require_docker

    if [ -n "$(docker ps --all --quiet --filter "name=^/$CONTAINER_NAME$")" ]; then
        docker rm --force "$CONTAINER_NAME" >/dev/null
        echo "Stopped $CONTAINER_NAME."
    else
        echo "$CONTAINER_NAME is not running."
    fi
}

case "${1:-}" in
    start) start ;;
    stop) stop ;;
    *) die "usage: $(basename -- "$0") start|stop" ;;
esac
