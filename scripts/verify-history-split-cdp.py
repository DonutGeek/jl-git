#!/usr/bin/env python3
"""验证历史分栏默认约 82/18。"""

from __future__ import annotations

import base64
import json
import os
import signal
import socket
import struct
import subprocess
import time
from urllib.parse import urlparse
from urllib.request import urlopen

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT = 9342
USER = "/tmp/jlgit-history-split-verify2"
PROJECT = "b5a74845-42f8-4ec8-96d0-95dcdec899e0"
HOME = "http://localhost:1420/"
REPO = f"http://localhost:1420/repo/{PROJECT}"

MOCK_JS = r"""
(() => {
  const project = {
    id: "b5a74845-42f8-4ec8-96d0-95dcdec899e0",
    workspaceId: null,
    name: "developer-portal",
    path: "/Users/jingling/Documents/demo/developer-portal/developer-portal",
    lastOpenedAt: "2026-07-10T00:00:00.000Z",
    pinned: false,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
  const handlers = {
    project_list: async () => ({ projects: [project] }),
    recent_list: async () => ({ items: [{ projectId: project.id, openedAt: project.lastOpenedAt }] }),
    project_touch_opened: async () => ({ ok: true }),
    git_status: async () => ({
      branch: "main", upstream: null, ahead: 0, behind: 0, detached: false, entries: [],
    }),
    git_branches: async () => ({
      branches: [{ name: "main", isCurrent: true, isRemote: false, upstream: null }],
    }),
    git_log: async () => ({
      commits: [{
        id: "6f819f4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shortId: "6f819f4",
        authorName: "DonutGeek",
        authoredAt: "2026-07-02T00:00:00.000Z",
        subject: "feat: refine jingling chat interface",
        refs: ["main", "origin&main"],
      }],
      hasMore: false,
    }),
    fs_list_dir: async () => ({ entries: [] }),
  };
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      const fn = handlers[cmd];
      if (!fn) throw new Error("unmocked: " + cmd);
      return await fn();
    },
    transformCallback: () => 0,
    unregisterCallback: () => {},
  };
})();
"""


def wait_cdp(timeout: float = 15.0) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1).read()
            return True
        except Exception:
            time.sleep(0.25)
    return False


def pick_page_tab() -> dict:
    tabs = json.load(urlopen(f"http://127.0.0.1:{PORT}/json/list"))
    for tab in tabs:
        if tab.get("type") == "page" and "localhost:1420" in tab.get("url", ""):
            return tab
    for tab in tabs:
        if tab.get("type") == "page":
            return tab
    raise RuntimeError(f"no page tab: {tabs}")


def ws_connect(url: str) -> socket.socket:
    parsed = urlparse(url)
    sock = socket.create_connection((parsed.hostname, parsed.port), timeout=5)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {parsed.path} HTTP/1.1\r\n"
        f"Host: {parsed.hostname}:{parsed.port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode())
    data = b""
    while b"\r\n\r\n" not in data:
        data += sock.recv(4096)
    return sock


def ws_send(sock: socket.socket, payload: str) -> None:
    data = payload.encode("utf-8")
    mask = os.urandom(4)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    header = bytearray([0x81])
    n = len(data)
    if n < 126:
        header.append(0x80 | n)
    elif n < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", n))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", n))
    header.extend(mask)
    sock.sendall(header + masked)


def ws_recv(sock: socket.socket, timeout: float = 2.0) -> str | None:
    sock.settimeout(timeout)
    try:
        hdr = sock.recv(2)
        if len(hdr) < 2:
            return None
        length = hdr[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", sock.recv(8))[0]
        data = b""
        while len(data) < length:
            chunk = sock.recv(length - len(data))
            if not chunk:
                break
            data += chunk
        return data.decode("utf-8", "replace")
    except Exception:
        return None


def main() -> int:
    subprocess.run(
        ["pkill", "-f", f"remote-debugging-port={PORT}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(["rm", "-rf", USER], check=False)
    os.makedirs(USER, exist_ok=True)

    proc = subprocess.Popen(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            f"--remote-debugging-port={PORT}",
            "--remote-allow-origins=*",
            f"--user-data-dir={USER}",
            "--window-size=1400,900",
            HOME,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        if not wait_cdp():
            print("FAIL: CDP not up")
            return 1

        time.sleep(1.2)
        tab = pick_page_tab()
        sock = ws_connect(tab["webSocketDebuggerUrl"])
        msg_id = 0

        def cdp(method: str, params: dict | None = None, wait: float = 8.0) -> dict | None:
            nonlocal msg_id
            msg_id += 1
            current = msg_id
            ws_send(sock, json.dumps({"id": current, "method": method, "params": params or {}}))
            end = time.time() + wait
            while time.time() < end:
                raw = ws_recv(sock, 0.5)
                if not raw:
                    continue
                obj = json.loads(raw)
                if obj.get("id") == current:
                    return obj
            return None

        cdp("Runtime.enable")
        cdp("Page.enable")
        cdp("Page.addScriptToEvaluateOnNewDocument", {"source": MOCK_JS})
        cdp("Page.navigate", {"url": REPO})
        time.sleep(3.0)

        # 等加载完成并点历史
        for _ in range(20):
            ready = cdp(
                "Runtime.evaluate",
                {
                    "expression": """
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('历史'));
  if (!btn) return { ok: false, text: document.body.innerText.slice(0,120) };
  btn.click();
  return { ok: true };
})()
""",
                    "returnByValue": True,
                },
            )
            val = ((ready or {}).get("result") or {}).get("result") or {}
            value = val.get("value") if isinstance(val, dict) else None
            # CDP wraps as {type,value}
            if isinstance(val, dict) and "value" in val:
                value = val["value"]
            print("ready", value)
            if isinstance(value, dict) and value.get("ok"):
                break
            time.sleep(0.4)

        time.sleep(0.8)
        measure = cdp(
            "Runtime.evaluate",
            {
                "expression": """
(() => {
  const el = document.querySelector('[data-split-key="jlgit:split:history-detail-v9"]');
  if (!el) {
    return {
      error: 'no-split',
      keys: [...document.querySelectorAll('[data-split-key]')].map(e => e.getAttribute('data-split-key')),
      text: document.body.innerText.slice(0, 200),
    };
  }
  const kids = [...el.children].filter((c) => c.getAttribute('role') !== 'separator');
  const a = kids[0].getBoundingClientRect();
  const b = kids[1].getBoundingClientRect();
  const total = a.width + b.width;
  return {
    ratioAttr: el.getAttribute('data-split-ratio'),
    firstW: Math.round(a.width),
    secondW: Math.round(b.width),
    firstPct: Math.round((a.width / total) * 100),
    secondPct: Math.round((b.width / total) * 100),
  };
})()
""",
                "returnByValue": True,
            },
        )
        result = ((measure or {}).get("result") or {}).get("result") or {}
        value = result.get("value") if isinstance(result, dict) else result
        print("measure", json.dumps(value, ensure_ascii=False))

        if not isinstance(value, dict) or value.get("error"):
            return 2
        if value.get("firstPct", 0) < 55:
            print("FAIL: list too narrow")
            return 1
        if value.get("secondPct", 100) > 45:
            print("FAIL: detail too wide")
            return 1
        if value.get("secondPct", 0) < 25:
            print("FAIL: detail too narrow")
            return 1
        print("OK")
        return 0
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
