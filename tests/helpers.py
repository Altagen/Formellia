"""HTTP client helpers for the test suite.
No third-party dependencies — stdlib only.
"""

import json
import uuid
import urllib.request
import urllib.parse
import urllib.error
from http.client import HTTPResponse
from typing import Any


class ApiClient:
    """Session-aware HTTP client that handles cookies and multipart uploads."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session_cookie: str | None = None  # "name=value"

    # ── low-level ────────────────────────────────────────────────

    def _headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        h: dict[str, str] = {}
        if self.session_cookie:
            h["Cookie"] = self.session_cookie
        if extra:
            h.update(extra)
        return h

    def _request(
        self,
        method: str,
        path: str,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, Any]]:
        url = self.base_url + path
        req = urllib.request.Request(
            url,
            data=data,
            headers=self._headers(headers),
            method=method,
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read()
            try:
                payload = json.loads(body)
            except Exception:
                payload = {"_raw": body.decode(errors="replace")}
            return e.code, payload

    # ── auth ─────────────────────────────────────────────────────

    def login(self, identifier: str, password: str) -> tuple[int, dict[str, Any]]:
        url = self.base_url + "/api/auth/login"
        body = json.dumps({"identifier": identifier, "password": password}).encode()
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                # Capture session cookie from Set-Cookie header
                raw_cookie = resp.headers.get("Set-Cookie", "")
                if raw_cookie:
                    # Take only name=value part (before first semicolon)
                    self.session_cookie = raw_cookie.split(";")[0].strip()
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read()
            try:
                payload = json.loads(body)
            except Exception:
                payload = {}
            return e.code, payload

    # ── JSON requests ─────────────────────────────────────────────

    def get(self, path: str) -> tuple[int, Any]:
        return self._request("GET", path)

    def post_json(self, path: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        body = json.dumps(payload).encode()
        return self._request("POST", path, data=body, headers={"Content-Type": "application/json"})

    def put_json(self, path: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        body = json.dumps(payload).encode()
        return self._request("PUT", path, data=body, headers={"Content-Type": "application/json"})

    def delete(self, path: str) -> tuple[int, dict[str, Any]]:
        return self._request("DELETE", path)

    # ── multipart file upload ─────────────────────────────────────

    def upload_file(
        self,
        path: str,
        file_content: bytes,
        filename: str,
        content_type: str = "text/plain",
    ) -> tuple[int, dict[str, Any]]:
        boundary = uuid.uuid4().hex
        crlf = b"\r\n"

        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n"
            f"\r\n"
        ).encode() + file_content + f"\r\n--{boundary}--\r\n".encode()

        return self._request(
            "POST",
            path,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )


# ── Convenience ───────────────────────────────────────────────────────────────

def load_fixture(name: str) -> bytes:
    """Load a fixture file from tests/fixtures/ as bytes."""
    import os
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    with open(os.path.join(fixtures_dir, name), "rb") as f:
        return f.read()
