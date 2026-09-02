"""The /api surface."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_reports_a_ready_database(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ready"}


def test_health_sees_the_database_the_lifespan_built(client: TestClient) -> None:
    # The API answering at all is only half of it: "ready" means startup got as
    # far as running the schema, which is what the start scripts wait for.
    assert client.get("/api/health").json()["database"] == "ready"


def test_health_is_available_without_a_frontend_build(api_only_client: TestClient) -> None:
    assert api_only_client.get("/api/health").status_code == 200


def test_unknown_api_route_answers_with_json_not_the_frontend(client: TestClient) -> None:
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert "No API route" in response.json()["detail"]


def test_unknown_api_route_answers_with_json_for_writes_too(client: TestClient) -> None:
    response = client.post("/api/nope", json={})
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
