#!/usr/bin/env python3
"""End-to-end demo setup for the book data source.

Creates a dataset, imports data, and configures an admin dashboard page
with charts and a table — all in one command.

Modes:
  --mode file   Import books.json directly as a file upload
  --mode api    Import via the local mock API (starts it automatically,
                or points to an already-running one via --api-url)

Usage:
    # File import:
    python3 tests/setup_demo.py \\
        --base-url http://localhost:3000 \\
        --email admin@admin.fr \\
        --password yourpassword

    # API import (auto-starts local server):
    python3 tests/setup_demo.py \\
        --base-url http://localhost:3000 \\
        --email admin@admin.fr \\
        --password yourpassword \\
        --mode api

    # API import pointing to an already-running server:
    python3 tests/setup_demo.py \\
        --base-url http://localhost:3000 \\
        --email admin@admin.fr \\
        --password yourpassword \\
        --mode api \\
        --api-url http://localhost:8765/books

    # Teardown (removes the demo page + dataset):
    python3 tests/setup_demo.py \\
        --base-url http://localhost:3000 \\
        --email admin@admin.fr \\
        --password yourpassword \\
        --teardown
"""

import argparse
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(__file__))

from helpers import ApiClient, load_fixture

DEMO_PAGE_ID   = "demo-librairie-page"
DEMO_PAGE_SLUG = "librairie"
DEMO_DS_NAME   = "Librairie Demo"
DATA_FILE      = os.path.join(os.path.dirname(__file__), "data", "books.json")


# ── Page config ───────────────────────────────────────────────

def build_page_config(dataset_id: str) -> dict:
    """Return the AdminPage dict for the demo library page."""
    return {
        "id": DEMO_PAGE_ID,
        "title": "Librairie",
        "slug": DEMO_PAGE_SLUG,
        "icon": "book-open",
        "dataSourceId": dataset_id,
        "widgets": [
            # Row 1: 4 stat cards
            {
                "type": "stats_card",
                "id": "demo-w-total",
                "statsConfig": {
                    "id": "demo-s-total",
                    "title": "Total achats",
                    "icon": "library",
                    "query": "count_total",
                    "accent": "blue",
                },
            },
            {
                "type": "stats_card",
                "id": "demo-w-today",
                "statsConfig": {
                    "id": "demo-s-today",
                    "title": "Achats aujourd'hui",
                    "icon": "calendar",
                    "query": "count_today",
                    "accent": "green",
                },
            },
            {
                "type": "stats_card",
                "id": "demo-w-week",
                "statsConfig": {
                    "id": "demo-s-week",
                    "title": "Cette semaine",
                    "icon": "clock",
                    "query": "count_week",
                    "accent": "purple",
                },
            },
            {
                "type": "stats_card",
                "id": "demo-w-done",
                "statsConfig": {
                    "id": "demo-s-done",
                    "title": "Processed orders",
                    "icon": "check-circle",
                    "query": "count_done",
                    "accent": "orange",
                },
            },
            # Row 2: temporal evolution (full width)
            {
                "type": "chart",
                "id": "demo-w-temporal",
                "title": "Sales trend",
                "span": 2,
                "chartConfig": {
                    "id": "demo-c-temporal",
                    "title": "Sales trend",
                    "type": "area",
                    "groupBy": "date",
                    "dateRange": "all",
                    "color": "#6366f1",
                },
            },
            # Row 3: genre bar + author bar
            {
                "type": "chart",
                "id": "demo-w-genre",
                "title": "Ventes par genre",
                "span": 1,
                "chartConfig": {
                    "id": "demo-c-genre",
                    "title": "Ventes par genre",
                    "type": "bar",
                    "groupBy": "genre",
                    "dateRange": "all",
                    "color": "#2563eb",
                },
            },
            {
                "type": "chart",
                "id": "demo-w-author",
                "title": "Top auteurs",
                "span": 1,
                "chartConfig": {
                    "id": "demo-c-author",
                    "title": "Ventes par auteur",
                    "type": "bar",
                    "groupBy": "author",
                    "dateRange": "all",
                    "color": "#7c3aed",
                },
            },
            # Row 4: country bar
            {
                "type": "chart",
                "id": "demo-w-country",
                "title": "Par pays",
                "span": 2,
                "chartConfig": {
                    "id": "demo-c-country",
                    "title": "Geographical sales distribution",
                    "type": "bar",
                    "groupBy": "country",
                    "dateRange": "all",
                    "color": "#10b981",
                },
            },
            # Row 5: full table
            {
                "type": "submissions_table",
                "id": "demo-w-table",
                "title": "Historique des achats",
            },
        ],
    }


# ── Teardown ──────────────────────────────────────────────────

def teardown(client: ApiClient, base_url: str):
    print("\n  Teardown…")

    # 1. Find and delete the demo dataset
    status, datasets = client.get("/api/admin/datasets")
    if status == 200:
        for ds in datasets:
            if ds.get("name") == DEMO_DS_NAME:
                client.delete(f"/api/admin/datasets/{ds['id']}")
                print(f"  ✓ Dataset deleted : {ds['id']}")

    # 2. Remove demo page from config
    status, body = client.get("/api/admin/config")
    if status != 200:
        print(f"  [!] GET config failed ({status})")
        return
    config = body["config"]
    pages_before = len(config["admin"]["pages"])
    config["admin"]["pages"] = [
        p for p in config["admin"]["pages"] if p.get("id") != DEMO_PAGE_ID
    ]
    if len(config["admin"]["pages"]) < pages_before:
        status2, _ = client.put_json("/api/admin/config", config)
        if status2 == 200:
            print(f"  ✓ Demo page removed from config")
        else:
            print(f"  [!] Config update failed ({status2})")
    else:
        print(f"  - Demo page not found in config (already removed?)")

    print("  Teardown complete.\n")


# ── Setup ─────────────────────────────────────────────────────

def setup(client: ApiClient, args):
    # ── Step 1: Create dataset ──────────────────────────────

    print("\n  [1/4] Creating dataset...")

    if args.mode == "file":
        ds_payload = {
            "name": DEMO_DS_NAME,
            "description": "Test data — book catalogue (150 records)",
            "sourceType": "file",
            "importMode": "replace",
        }
    else:
        api_url = args.api_url or f"http://127.0.0.1:{args.api_port}/books"
        ds_payload = {
            "name": DEMO_DS_NAME,
            "description": "Test data — book catalogue via local API",
            "sourceType": "api",
            "importMode": "replace",
            "apiUrl": api_url,
        }

    # Check if demo dataset already exists
    status, existing = client.get("/api/admin/datasets")
    dataset_id = None
    if status == 200:
        for ds in existing:
            if ds.get("name") == DEMO_DS_NAME:
                dataset_id = ds["id"]
                print(f"  ↩  Reusing existing dataset : {dataset_id}")
                break

    if not dataset_id:
        status, data = client.post_json("/api/admin/datasets", ds_payload)
        if status != 201:
            print(f"  [!] Dataset creation failed ({status}): {data}")
            sys.exit(1)
        dataset_id = data["id"]
        print(f"  ✓ Dataset created : {dataset_id}")

    # ── Step 2: Import data ─────────────────────────────────

    print(f"\n  [2/4] Importing data (mode: {args.mode})…")

    if args.mode == "file":
        if not os.path.exists(DATA_FILE):
            print(f"  [!] Fichier introuvable : {DATA_FILE}")
            print(f"  [!] Generate it first: python3 tests/data/generate.py")
            sys.exit(1)
        with open(DATA_FILE, "rb") as f:
            content = f.read()
        status, result = client.upload_file(
            f"/api/admin/datasets/{dataset_id}/import",
            content,
            "books.json",
            "application/json",
        )
    else:
        # API mode — trigger fetch
        status, result = client.post_json(
            f"/api/admin/datasets/{dataset_id}/import", {}
        )

    if status != 200:
        print(f"  [!] Import failed ({status}): {result}")
        sys.exit(1)

    inserted = result.get("inserted", 0)
    skipped = result.get("skipped", 0)
    total = result.get("total", inserted)
    print(f"  ✓ {inserted} records imported"
          + (f", {skipped} skipped (dedup)" if skipped else "")
          + f"  (total dataset : {total})")

    # ── Step 3: Configure admin page ───────────────────────

    print(f"\n  [3/4] Configuration de la page dashboard…")

    status, body = client.get("/api/admin/config")
    if status != 200:
        print(f"  [!] GET config failed ({status})")
        sys.exit(1)
    config = body["config"]

    new_page = build_page_config(dataset_id)

    # Replace if exists, otherwise prepend
    pages = config["admin"]["pages"]
    idx = next((i for i, p in enumerate(pages) if p.get("id") == DEMO_PAGE_ID), None)
    if idx is not None:
        pages[idx] = new_page
        print(f"  ↩  Existing page updated")
    else:
        pages.insert(0, new_page)
        print(f"  ✓ Page 'Library' added at top of nav")

    status2, _ = client.put_json("/api/admin/config", config)
    if status2 != 200:
        print(f"  [!] Config save failed ({status2})")
        sys.exit(1)
    print(f"  ✓ Config saved")

    # ── Step 4: Summary ─────────────────────────────────────

    print(f"\n  [4/4] All done!")
    print(f"\n  ┌─────────────────────────────────────────────────────┐")
    print(f"  │  Dashboard → {args.base_url}/admin/{DEMO_PAGE_SLUG}")
    print(f"  │  Dataset ID : {dataset_id}")
    print(f"  │  Enregistrements : {inserted} achats")
    print(f"  │  Widgets : 4 stats · 4 charts · 1 table")
    print(f"  └─────────────────────────────────────────────────────┘")
    print(f"\n  Pour supprimer : python3 tests/setup_demo.py [args] --teardown\n")


# ── Entry point ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Demo data setup for book catalogue")
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--mode", choices=["file", "api"], default="file",
                        help="Import mode: file upload or API fetch (default: file)")
    parser.add_argument("--api-url", default=None,
                        help="API URL to use (--mode api). If absent, starts local server.")
    parser.add_argument("--api-port", type=int, default=8765,
                        help="Port for auto-started local API server (default: 8765)")
    parser.add_argument("--teardown", action="store_true",
                        help="Remove demo page and dataset instead of creating them")
    args = parser.parse_args()

    client = ApiClient(args.base_url)

    print(f"\n  Book Demo Setup")
    print(f"  Target : {args.base_url}")
    print("  " + "─" * 52)

    # Login
    status, _ = client.login(args.email, args.password)
    if status != 200:
        print(f"  [!] Login failed ({status}). Check --email / --password.")
        sys.exit(1)
    print(f"  ✓ Logged in as {args.email}")

    if args.teardown:
        teardown(client, args.base_url)
        return

    # For API mode without --api-url, start local server in thread
    mock_server = None
    if args.mode == "api" and not args.api_url:
        # Import here to avoid circular deps
        sys.path.insert(0, os.path.dirname(__file__))
        from mock_api_server import MockApiServer

        data_path = os.path.join(os.path.dirname(__file__), "data", "books.json")
        if not os.path.exists(data_path):
            print(f"  [!] Fichier introuvable : {data_path}")
            print(f"  [!] Generate it: python3 tests/data/generate.py")
            sys.exit(1)
        with open(data_path, encoding="utf-8") as f:
            books = json.load(f)

        mock_server = MockApiServer(books, port=args.api_port)
        mock_server.start()
        args.api_url = f"http://127.0.0.1:{args.api_port}/books"
        print(f"  ✓ Local API started : {args.api_url} ({len(books)} books)")

    try:
        setup(client, args)
    finally:
        if mock_server:
            mock_server.stop()


if __name__ == "__main__":
    main()
