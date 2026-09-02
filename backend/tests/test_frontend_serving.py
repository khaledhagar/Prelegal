"""Serving the frontend's static export.

Next writes `/app` as `app/index.html`, so the interesting cases are the ones
where the URL is a directory rather than a file. These tests are what stops a
change to `trailingSlash` or to the mount order from quietly breaking the app
for everyone while every unit test still passes.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_root_serves_the_sign_in_page(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "sign in" in response.text


def test_platform_route_serves_its_index(client: TestClient) -> None:
    response = client.get("/app/")
    assert response.status_code == 200
    assert "platform" in response.text


def test_platform_route_without_the_trailing_slash_still_arrives(client: TestClient) -> None:
    response = client.get("/app", follow_redirects=True)
    assert response.status_code == 200
    assert "platform" in response.text


def test_unknown_page_serves_the_exported_404(client: TestClient) -> None:
    response = client.get("/no-such-page/")
    assert response.status_code == 404
    assert "not found" in response.text


def test_the_api_is_not_shadowed_by_the_static_mount(client: TestClient) -> None:
    # The static mount is at "/", so it matches everything the API did not
    # claim first. Registration order is load-bearing.
    assert client.get("/api/health").json()["status"] == "ok"


def test_explains_itself_when_the_frontend_was_never_built(
    api_only_client: TestClient,
) -> None:
    response = api_only_client.get("/")
    assert response.status_code == 503
    assert "npm run build" in response.json()["detail"]
