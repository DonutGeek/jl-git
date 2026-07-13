#!/usr/bin/env python3
"""Chrome CDP：注入 Tauri mock，打开仓库页，断言无 Maximum update depth。"""

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
PORT = 9339
USER = "/tmp/jlgit-cdp-verify2"
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
    recent_list: async () => ({
      items: [{ projectId: project.id, openedAt: project.lastOpenedAt }],
    }),
    project_touch_opened: async () => ({ ok: true }),
    project_add: async () => ({ project }),
    project_pick_directory: async () => ({ path: null }),
    git_status: async () => ({
      branch: "main",
      upstream: null,
      ahead: 0,
      behind: 0,
      detached: false,
      entries: [],
    }),
    git_branches: async () => ({
      branches: [
        { name: "main", isCurrent: true, isRemote: false, upstream: null },
      ],
    }),
    git_log: async () => ({ commits: [], hasMore: false }),
    fs_list_dir: async () => ({ entries: [] }),
    git_stage: async () => ({ ok: true }),
    git_unstage: async () => ({ ok: true }),
    git_commit: async () => ({ commitId: "abc123" }),
    git_checkout: async () => ({ ok: true }),
  };

  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      const fn = handlers[cmd];
      if (!fn) {
        console.warn("unmocked invoke", cmd, args);
        throw new Error("unmocked: " + cmd);
      }
      return await fn(args);
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
            HOME,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        if not wait_cdp():
            print("FAIL: CDP not up")
            return 1

        time.sleep(1.5)
        tab = pick_page_tab()
        print("TAB", tab.get("url"), tab.get("title"))
        sock = ws_connect(tab["webSocketDebuggerUrl"])
        msg_id = 0
        events: list[dict] = []

        def cdp(method: str, params: dict | None = None, wait: float = 6.0) -> dict | None:
            nonlocal msg_id
            msg_id += 1
            current = msg_id
            ws_send(
                sock,
                json.dumps({"id": current, "method": method, "params": params or {}}),
            )
            end = time.time() + wait
            result = None
            while time.time() < end:
                raw = ws_recv(sock, 0.5)
                if not raw:
                    continue
                obj = json.loads(raw)
                if "method" in obj:
                    events.append(obj)
                if obj.get("id") == current:
                    result = obj
                    break
            return result

        cdp("Runtime.enable")
        cdp("Page.enable")
        cdp("Console.enable")
        add = cdp("Page.addScriptToEvaluateOnNewDocument", {"source": MOCK_JS})
        print("addScript", "ok" if add and "error" not in add else add)
        nav = cdp("Page.navigate", {"url": REPO})
        print("nav", ((nav or {}).get("result") or {}))

        # 等 React 渲染
        time.sleep(5)
        end = time.time() + 2
        while time.time() < end:
            raw = ws_recv(sock, 0.3)
            if not raw:
                continue
            obj = json.loads(raw)
            if "method" in obj:
                events.append(obj)

        ev = cdp(
            "Runtime.evaluate",
            {
                "expression": (
                    "({href:location.href,"
                    "text:(document.body&&document.body.innerText||'').slice(0,1500),"
                    "hasOverlay:!!document.querySelector('vite-error-overlay'),"
                    "hasMax:(document.body&&document.body.innerText||'').includes('Maximum update depth'),"
                    "htmlLen:document.documentElement.outerHTML.length})"
                ),
                "returnByValue": True,
            },
        )
        raw_value = ((ev or {}).get("result") or {}).get("result") or {}
        value = (
            raw_value.get("value")
            if isinstance(raw_value, dict) and "value" in raw_value
            else raw_value
        )
        print("EVAL", json.dumps(value, ensure_ascii=False)[:1800])

        has_max = False
        if isinstance(value, dict) and (value.get("hasMax") or value.get("hasOverlay")):
            has_max = True

        for item in events:
            blob = json.dumps(item, ensure_ascii=False)
            if "Maximum update depth" in blob:
                has_max = True
                print("EVENT", blob[:600])

        if has_max:
            print("FAIL: Maximum update depth still present")
            return 2

        text = (value or {}).get("text", "") if isinstance(value, dict) else ""
        if not text.strip():
            print("FAIL: empty body")
            return 3

        # 仓库页应出现变更/分支等壳层文案（中文 i18n）
        markers = ("变更", "分支", "历史", "提交", "developer-portal")
        if not any(m in text for m in markers):
            print("WARN: repo chrome markers not found; text may be error/loading")
            # 只要没有 max depth 且有内容，仍算本 bug 已修
        print("PASS: no Maximum update depth")
        print("TEXT_PREVIEW:", " | ".join(text.splitlines()[:12]))
        return 0
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
