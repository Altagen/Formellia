#!/usr/bin/env python3
"""Standalone mock book API server.

Serves the generated book data as a JSON REST API.
Run independently before setup_demo.py or alongside it.

Endpoints:
  GET /books          → full list (150 records)
  GET /books?limit=N  → first N records
  GET /books/stats    → aggregated stats (for testing)
  GET /health         → {"ok": true}

Usage:
    python3 tests/book_api.py                  # default port 8765
    python3 tests/book_api.py --port 9000
"""

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

# ── Load data ─────────────────────────────────────────────────

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "books.json")

def load_books() -> list[dict]:
    if not os.path.exists(DATA_FILE):
        print(f"  [!] Data file not found: {DATA_FILE}")
        print(f"  [!] Run: python3 tests/data/generate.py")
        sys.exit(1)
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)

BOOKS: list[dict] = []

# ── HTTP handler ──────────────────────────────────────────────

class BookHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)

        if path == "/health":
            self._json({"ok": True, "records": len(BOOKS)})

        elif path == "/books":
            limit = params.get("limit", [None])[0]
            data = BOOKS[:int(limit)] if limit else BOOKS
            self._json(data)

        elif path == "/books/stats":
            genres: dict[str, int] = {}
            countries: dict[str, int] = {}
            purchased = sum(1 for b in BOOKS if b["purchased"])
            for b in BOOKS:
                genres[b["genre"]] = genres.get(b["genre"], 0) + 1
                countries[b["country"]] = countries.get(b["country"], 0) + 1
            self._json({
                "total": len(BOOKS),
                "purchased": purchased,
                "not_purchased": len(BOOKS) - purchased,
                "by_genre": genres,
                "by_country": countries,
                "avg_price": round(sum(b["price"] for b in BOOKS) / len(BOOKS), 2),
                "avg_rating": round(sum(b["rating"] for b in BOOKS) / len(BOOKS), 2),
            })

        else:
            self.send_error(404, f"Unknown endpoint: {path}")

    def _json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"  [{self.address_string()}] {fmt % args}")


# ── Entry point ───────────────────────────────────────────────

def main():
    global BOOKS
    parser = argparse.ArgumentParser(description="Mock book API server")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    BOOKS = load_books()

    server = HTTPServer((args.host, args.port), BookHandler)
    print(f"\n  Book API running at http://{args.host}:{args.port}")
    print(f"  Endpoints:")
    print(f"    GET /books          → {len(BOOKS)} records")
    print(f"    GET /books?limit=N  → first N records")
    print(f"    GET /books/stats    → aggregated stats")
    print(f"    GET /health         → status")
    print(f"\n  Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
