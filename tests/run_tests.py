#!/usr/bin/env python3
"""Test suite for external data sources feature.

Tests all import modes (append / replace / dedup) with CSV, JSON, and API sources.

Usage:
    python3 tests/run_tests.py \\
        --base-url http://localhost:3000 \\
        --email admin@example.com \\
        --password yourpassword

Exit code: 0 if all tests pass, 1 if any fail.
"""

import argparse
import sys
import os

# Ensure tests/ directory is importable when run from project root
sys.path.insert(0, os.path.dirname(__file__))

from helpers import ApiClient, load_fixture
from mock_api_server import MockApiServer


# ── Registry ──────────────────────────────────────────────────────────────────

_REGISTRY: list[tuple[str, str, object]] = []  # (id, name, fn)
results: list[tuple[str, str, bool, str]] = []  # (id, name, passed, detail)

client: ApiClient = None  # type: ignore
_created_dataset_ids: list[str] = []


def test(test_id: str, name: str):
    def decorator(fn):
        _REGISTRY.append((test_id, name, fn))
        return fn
    return decorator


def assert_eq(label: str, actual, expected):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


# ── Dataset helpers ───────────────────────────────────────────────────────────

def make_dataset(
    name: str = "Test Dataset",
    source_type: str = "file",
    import_mode: str = "append",
    dedup_key: str | None = None,
    api_url: str | None = None,
    field_map: dict | None = None,
) -> str:
    payload = {"name": name, "sourceType": source_type, "importMode": import_mode}
    if dedup_key:
        payload["dedupKey"] = dedup_key
    if api_url:
        payload["apiUrl"] = api_url
    if field_map:
        payload["fieldMap"] = field_map
    status, data = client.post_json("/api/admin/datasets", payload)
    assert status == 201, f"Create dataset failed ({status}): {data}"
    _created_dataset_ids.append(data["id"])
    return data["id"]


def upload_csv(dataset_id: str, filename: str) -> dict:
    content = load_fixture(filename)
    status, data = client.upload_file(
        f"/api/admin/datasets/{dataset_id}/import", content, filename, "text/csv"
    )
    assert status == 200, f"CSV upload failed ({status}): {data}"
    return data


def upload_json_file(dataset_id: str, filename: str) -> tuple[int, dict]:
    content = load_fixture(filename)
    return client.upload_file(
        f"/api/admin/datasets/{dataset_id}/import", content, filename, "application/json"
    )


def record_count(dataset_id: str) -> int:
    status, data = client.get(f"/api/admin/datasets/{dataset_id}")
    assert status == 200
    return data.get("recordCount") or 0


def get_records(dataset_id: str, limit: int = 20, page: int = 1) -> list:
    status, data = client.get(f"/api/admin/datasets/{dataset_id}/records?limit={limit}&page={page}")
    assert status == 200
    return data.get("records", [])


# ── A: Auth tests ─────────────────────────────────────────────────────────────

@test("A1", "Login with valid credentials → 200 + session cookie")
def test_a1():
    assert client.session_cookie is not None, "No session cookie set after login"


@test("A2", "Login with wrong password → 401")
def test_a2():
    tmp = ApiClient(client.base_url)
    status, _ = tmp.login("notexist@example.com", "wrongpassword")
    assert_eq("status", status, 401)


@test("A3", "Login with empty password → 400")
def test_a3():
    tmp = ApiClient(client.base_url)
    status, _ = tmp.login("someuser", "")
    assert_eq("status", status, 400)


@test("A4", "Unauthenticated request → 401")
def test_a4():
    tmp = ApiClient(client.base_url)
    status, _ = tmp.get("/api/admin/datasets")
    assert_eq("status", status, 401)


# ── C: CRUD tests ─────────────────────────────────────────────────────────────

@test("C1", "Create file dataset → 201 with correct fields")
def test_c1():
    ds_id = make_dataset("CRUD Test", "file", "append")
    status, data = client.get(f"/api/admin/datasets/{ds_id}")
    assert_eq("status", status, 200)
    assert_eq("sourceType", data["sourceType"], "file")
    assert_eq("importMode", data["importMode"], "append")


@test("C2", "Create API dataset with URL → sourceType=api, apiUrl saved")
def test_c2():
    ds_id = make_dataset("API Test", "api", "replace", api_url="http://127.0.0.1:9999/data")
    status, data = client.get(f"/api/admin/datasets/{ds_id}")
    assert_eq("status", status, 200)
    assert_eq("sourceType", data["sourceType"], "api")
    assert data["apiUrl"] == "http://127.0.0.1:9999/data", f"apiUrl mismatch: {data['apiUrl']}"


@test("C3", "Create dataset without name → 400")
def test_c3():
    status, _ = client.post_json("/api/admin/datasets", {"sourceType": "file", "importMode": "append"})
    assert_eq("status", status, 400)


@test("C4", "GET /datasets returns a list")
def test_c4():
    status, data = client.get("/api/admin/datasets")
    assert_eq("status", status, 200)
    assert isinstance(data, list), f"Expected list, got {type(data).__name__}"
    assert len(data) > 0, "Expected at least one dataset"


@test("C5", "GET /datasets/[id] returns the correct dataset")
def test_c5():
    ds_id = make_dataset("Single GET Test")
    status, data = client.get(f"/api/admin/datasets/{ds_id}")
    assert_eq("status", status, 200)
    assert_eq("id", data["id"], ds_id)


@test("C6", "GET /datasets/[nonexistent-uuid] → 404")
def test_c6():
    status, _ = client.get("/api/admin/datasets/00000000-0000-0000-0000-000000000000")
    assert_eq("status", status, 404)


@test("C7", "PUT updates dataset description")
def test_c7():
    ds_id = make_dataset("Update Test")
    status, data = client.put_json(f"/api/admin/datasets/{ds_id}", {
        "name": "Update Test", "sourceType": "file",
        "importMode": "append", "description": "Updated",
    })
    assert_eq("status", status, 200)
    assert_eq("description", data["description"], "Updated")


@test("C8", "DELETE removes dataset; subsequent GET → 404")
def test_c8():
    ds_id = make_dataset("Delete Test")
    _created_dataset_ids.remove(ds_id)  # We'll delete it here, skip global cleanup
    status, _ = client.delete(f"/api/admin/datasets/{ds_id}")
    assert_eq("delete status", status, 200)
    status2, _ = client.get(f"/api/admin/datasets/{ds_id}")
    assert_eq("post-delete status", status2, 404)


# ── CSV tests ─────────────────────────────────────────────────────────────────

@test("CSV1", "Append — two uploads accumulate (3 + 2 = 5 rows)")
def test_csv1():
    ds_id = make_dataset("CSV Append", "file", "append")
    r1 = upload_csv(ds_id, "sample_3rows.csv")
    assert_eq("1st inserted", r1["inserted"], 3)
    assert_eq("1st skipped", r1["skipped"], 0)
    assert_eq("count after 1st", record_count(ds_id), 3)

    r2 = upload_csv(ds_id, "sample_2rows.csv")
    assert_eq("2nd inserted", r2["inserted"], 2)
    assert_eq("count after 2nd", record_count(ds_id), 5)


@test("CSV2", "Replace — second upload replaces all (3 → 2 rows)")
def test_csv2():
    ds_id = make_dataset("CSV Replace", "file", "replace")
    upload_csv(ds_id, "sample_3rows.csv")
    assert_eq("count after 1st", record_count(ds_id), 3)

    r2 = upload_csv(ds_id, "sample_2rows.csv")
    assert_eq("inserted", r2["inserted"], 2)
    assert_eq("count after replace", record_count(ds_id), 2)


@test("CSV3", "Dedup — re-uploading identical file inserts 0, skips all")
def test_csv3():
    ds_id = make_dataset("CSV Dedup Same", "file", "dedup", dedup_key="email")
    upload_csv(ds_id, "sample_3rows.csv")
    assert_eq("count after 1st", record_count(ds_id), 3)

    r2 = upload_csv(ds_id, "sample_3rows.csv")
    assert_eq("2nd inserted", r2["inserted"], 0)
    assert_eq("2nd skipped", r2["skipped"], 3)
    assert_eq("count unchanged", record_count(ds_id), 3)


@test("CSV4", "Dedup — partial overlap: 2 dup + 1 new (total = 4)")
def test_csv4():
    ds_id = make_dataset("CSV Dedup Partial", "file", "dedup", dedup_key="email")
    upload_csv(ds_id, "sample_3rows.csv")  # alice, bob, carol
    r2 = upload_csv(ds_id, "sample_overlap.csv")  # alice(dup), bob(dup), frank(new)
    assert_eq("inserted", r2["inserted"], 1)
    assert_eq("skipped", r2["skipped"], 2)
    assert_eq("total", record_count(ds_id), 4)


@test("CSV5", "Imported CSV records have all expected field keys")
def test_csv5():
    ds_id = make_dataset("CSV Keys", "file", "append")
    upload_csv(ds_id, "sample_3rows.csv")
    recs = get_records(ds_id, limit=5)
    assert len(recs) == 3, f"Expected 3 records, got {len(recs)}"
    for key in ("email", "name", "city", "score"):
        assert key in recs[0]["data"], f"Missing key '{key}' in {recs[0]['data']}"


# ── JSON tests ────────────────────────────────────────────────────────────────

@test("JSON1", "Append JSON — 4 rows with correct keys")
def test_json1():
    ds_id = make_dataset("JSON Append", "file", "append")
    status, r = upload_json_file(ds_id, "sample_4rows.json")
    assert_eq("status", status, 200)
    assert_eq("inserted", r["inserted"], 4)
    recs = get_records(ds_id, limit=10)
    for rec in recs:
        for key in ("id", "product", "qty", "price"):
            assert key in rec["data"], f"Missing key '{key}'"


@test("JSON2", "Replace JSON — 4 then 2 → only 2 remain")
def test_json2():
    ds_id = make_dataset("JSON Replace", "file", "replace")
    upload_json_file(ds_id, "sample_4rows.json")
    status, r2 = upload_json_file(ds_id, "sample_2rows.json")
    assert_eq("status", status, 200)
    assert_eq("inserted", r2["inserted"], 2)
    assert_eq("count", record_count(ds_id), 2)


@test("JSON3", "Dedup JSON — ids 1,2,3,4 + ids 2,3,5 → 1 new, 2 skipped, total 5")
def test_json3():
    ds_id = make_dataset("JSON Dedup", "file", "dedup", dedup_key="id")
    upload_json_file(ds_id, "sample_4rows.json")  # ids 1,2,3,4
    status, r2 = upload_json_file(ds_id, "sample_overlap.json")  # ids 2(dup),3(dup),5(new)
    assert_eq("status", status, 200)
    assert_eq("inserted", r2["inserted"], 1)
    assert_eq("skipped", r2["skipped"], 2)
    assert_eq("total", record_count(ds_id), 5)


@test("JSON4", "Non-array JSON → 400 with 'array' in error message")
def test_json4():
    ds_id = make_dataset("JSON Bad", "file", "append")
    content = load_fixture("not_array.json")
    status, data = client.upload_file(
        f"/api/admin/datasets/{ds_id}/import", content, "not_array.json", "application/json"
    )
    assert_eq("status", status, 400)
    assert "array" in data.get("error", "").lower(), f"'array' not in error: {data}"


@test("JSON5", "Field map renames keys on import")
def test_json5():
    ds_id = make_dataset("JSON FieldMap", "file", "append",
                         field_map={"product": "productName", "qty": "quantity"})
    upload_json_file(ds_id, "sample_4rows.json")
    recs = get_records(ds_id, limit=5)
    assert len(recs) > 0
    d = recs[0]["data"]
    assert "productName" in d, f"Expected 'productName', got keys: {list(d.keys())}"
    assert "quantity" in d, f"Expected 'quantity', got keys: {list(d.keys())}"
    assert "product" not in d, f"Original 'product' key should be gone"
    assert "qty" not in d, f"Original 'qty' key should be gone"


# ── API source tests ──────────────────────────────────────────────────────────

API_ROWS_V1 = [
    {"order_id": "ORD-001", "customer": "Alice", "amount": 100},
    {"order_id": "ORD-002", "customer": "Bob", "amount": 250},
    {"order_id": "ORD-003", "customer": "Carol", "amount": 75},
]
API_ROWS_V2 = [
    {"order_id": "ORD-002", "customer": "Bob", "amount": 250},   # dup
    {"order_id": "ORD-003", "customer": "Carol", "amount": 75},  # dup
    {"order_id": "ORD-004", "customer": "Dave", "amount": 320},  # new
]


@test("API1", "API append — mock returns 3 rows, all inserted")
def test_api1():
    mock = MockApiServer(API_ROWS_V1)
    mock.start()
    try:
        ds_id = make_dataset("API Append", "api", "append", api_url=f"{mock.url}/data")
        status, data = client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
        assert_eq("status", status, 200)
        assert_eq("inserted", data["inserted"], 3)
        assert_eq("count", record_count(ds_id), 3)
    finally:
        mock.stop()


@test("API2", "API replace — two triggers → count stays at 3 (not 6)")
def test_api2():
    mock = MockApiServer(API_ROWS_V1)
    mock.start()
    try:
        ds_id = make_dataset("API Replace", "api", "replace", api_url=f"{mock.url}/data")
        client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
        status, r2 = client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
        assert_eq("status", status, 200)
        assert_eq("2nd inserted", r2["inserted"], 3)
        assert_eq("count after replace", record_count(ds_id), 3)
    finally:
        mock.stop()


@test("API3", "API dedup — second trigger with V2 data: 1 new, 2 skipped, total 4")
def test_api3():
    mock = MockApiServer(API_ROWS_V1)
    mock.start()
    try:
        ds_id = make_dataset("API Dedup", "api", "dedup",
                             api_url=f"{mock.url}/data", dedup_key="order_id")
        client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
        assert_eq("count after 1st", record_count(ds_id), 3)

        mock.set_data(API_ROWS_V2)
        status, r2 = client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
        assert_eq("status", status, 200)
        assert_eq("inserted", r2["inserted"], 1)
        assert_eq("skipped", r2["skipped"], 2)
        assert_eq("total", record_count(ds_id), 4)
    finally:
        mock.stop()


@test("API4", "API unreachable URL → 502")
def test_api4():
    ds_id = make_dataset("API Bad URL", "api", "append", api_url="http://127.0.0.1:1/unreachable")
    status, data = client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
    assert status == 502, f"Expected 502, got {status}: {data}"


@test("API5", "API returns non-array JSON → 400")
def test_api5():
    mock = MockApiServer({"error": "not an array"})  # type: ignore[arg-type]
    mock.start()
    try:
        ds_id = make_dataset("API Bad JSON", "api", "append", api_url=f"{mock.url}/data")
        status, data = client.post_json(f"/api/admin/datasets/{ds_id}/import", {})
        assert_eq("status", status, 400)
        assert "array" in data.get("error", "").lower(), f"'array' not in error: {data}"
    finally:
        mock.stop()


# ── Records pagination ────────────────────────────────────────────────────────

@test("REC1", "Records pagination — limit=2 returns exactly 2 rows")
def test_rec1():
    ds_id = make_dataset("Pagination Test", "file", "append")
    upload_csv(ds_id, "sample_3rows.csv")
    upload_csv(ds_id, "sample_2rows.csv")  # 5 total

    status, data = client.get(f"/api/admin/datasets/{ds_id}/records?limit=2&page=1")
    assert_eq("status", status, 200)
    assert_eq("records count", len(data["records"]), 2)
    assert_eq("limit echo", data["limit"], 2)
    assert_eq("page echo", data["page"], 1)


# ── Cleanup & runner ──────────────────────────────────────────────────────────

def cleanup():
    for ds_id in _created_dataset_ids:
        try:
            client.delete(f"/api/admin/datasets/{ds_id}")
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Run external data source tests")
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--filter", default="",
                        help="Run only tests whose ID starts with this prefix (e.g. CSV, API)")
    args = parser.parse_args()

    global client
    client = ApiClient(args.base_url)

    print(f"\nExternal Data Sources — Test Suite")
    print(f"Target : {args.base_url}")
    print("─" * 66)

    # Login
    status, _ = client.login(args.email, args.password)
    if status != 200:
        print(f"  LOGIN FAILED ({status}). Check --email / --password.")
        sys.exit(1)
    print(f"  Logged in ✓  cookie: {client.session_cookie[:50]}…\n")

    prefix = args.filter.upper()
    suite = [(tid, name, fn) for tid, name, fn in _REGISTRY if not prefix or tid.startswith(prefix)]

    print(f"  Running {len(suite)} test(s)…\n")

    passed = failed = 0
    lines = []

    for tid, name, fn in suite:
        try:
            fn()
            lines.append((tid, name, True, ""))
            passed += 1
        except AssertionError as e:
            lines.append((tid, name, False, str(e)))
            failed += 1
        except Exception as e:
            lines.append((tid, name, False, f"{type(e).__name__}: {e}"))
            failed += 1

    # Table
    COL_ID = 6
    COL_NAME = 52
    print(f"  {'ID':<{COL_ID}} {'Test':<{COL_NAME}} Status")
    print(f"  {'─' * (COL_ID + COL_NAME + 8)}")
    for tid, name, ok, detail in lines:
        mark = "PASS" if ok else "FAIL"
        print(f"  {tid:<{COL_ID}} {name:<{COL_NAME}} {mark}")
        if not ok and detail:
            print(f"  {'':>{COL_ID}}   └─ {detail}")

    print(f"\n  {'─' * (COL_ID + COL_NAME + 8)}")
    print(f"  Results: {passed} passed, {failed} failed  ({passed + failed} total)\n")

    print("  Cleaning up test datasets…")
    cleanup()
    print("  Done.\n")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
