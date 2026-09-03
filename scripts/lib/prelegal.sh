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
# Accounts and saved documents live here. A *named* volume, so that removing
# the container -- which `stop` does, and which every `start` does first --
# leaves the data behind. Deleting it is `docker volume rm prelegal-data`.
DATA_VOLUME="${PRELEGAL_DATA_VOLUME:-prelegal-data}"

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

    # Replace any previous container. Safe because the database is on a named
    # volume rather than inside the container, so it outlives this.
    docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true

    # The image deliberately ships without credentials, so the assistant's key
    # is handed over at run time. `--env NAME` passes it from this environment
    # by name: the value never appears in the process list.
    if [ -f "$REPO_ROOT/.env" ]; then
        set -- --env-file "$REPO_ROOT/.env"
    elif [ -n "${OPENROUTER_API_KEY:-}" ]; then
        set -- --env OPENROUTER_API_KEY
    else
        set --
        echo "warning: no .env and no OPENROUTER_API_KEY -- the AI chat will be" >&2
        echo "         unavailable. Everything else works." >&2
    fi

    echo "Starting $CONTAINER_NAME on port $PORT ..."
    docker run --detach \
        --name "$CONTAINER_NAME" \
        --publish "$PORT:8000" \
        --volume "$DATA_VOLUME:/data" \
        "$@" \
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
