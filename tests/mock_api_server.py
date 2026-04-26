"""Thread-based mock HTTP JSON API server.

Usage:
    server = MockApiServer(data=[...])
    server.start()
    print(server.url)   # e.g. http://127.0.0.1:54321
    server.stop()

The server responds to ANY GET request with:
  Content-Type: application/json
  Body: the `data` array passed at construction

Use `server.set_data(new_data)` to change what's served between calls.
"""

import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler


class MockApiServer:
    def __init__(self, data: list, port: int = 0):
        self._data = data
        self._lock = threading.Lock()

        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                with outer._lock:
                    body = json.dumps(outer._data).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, fmt, *args):
                pass  # silence request logs

        self._server = HTTPServer(("127.0.0.1", port), Handler)
        self._thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        host, port = self._server.server_address
        return f"http://{host}:{port}"

    def set_data(self, data: list):
        with self._lock:
            self._data = data

    def start(self):
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self):
        self._server.shutdown()
        if self._thread:
            self._thread.join(timeout=2)
