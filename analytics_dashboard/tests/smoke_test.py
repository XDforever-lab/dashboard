#!/usr/bin/env python
"""FastAPI Dashboard Smoke Test"""

import sys
import urllib.request
import urllib.error
import json
import time
import os
import subprocess

BASE_URL = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:8000")
MAX_RETRIES = 30
RETRY_DELAY = 2


def request(path, expected_status=200):
    url = BASE_URL + path
    try:
        req = urllib.request.Request(url)
        resp = urllib.request.urlopen(req, timeout=30)
        body = resp.read().decode("utf-8")
        status = resp.status
        if expected_status and status != expected_status:
            print(f"FAIL: {path} returned {status}, expected {expected_status}")
            return None
        if body.strip().startswith("{") or body.strip().startswith("["):
            return json.loads(body)
        return body
    except urllib.error.HTTPError as e:
        print(f"FAIL: {path} HTTP error {e.code}")
        return None
    except urllib.error.URLError as e:
        print(f"FAIL: {path} connection error: {e.reason}")
        return None
    except Exception as e:
        print(f"FAIL: {path} unexpected error: {e}")
        return None


def check_server_ready():
    print(f"Waiting for server at {BASE_URL}...")
    for i in range(MAX_RETRIES):
        try:
            resp = request("/health")
            if resp and resp.get("status") == "ok":
                print(f"Server ready after {i + 1} attempts.")
                return True
        except Exception:
            pass
        time.sleep(RETRY_DELAY)
    print("FAIL: server did not become ready")
    return False


def start_server():
    proj_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    server_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    if os.name == "nt":
        venv_python = os.path.join(server_path, "venv", "Scripts", "python.exe")
    else:
        venv_python = os.path.join(server_path, "venv", "bin", "python")
    if not os.path.isfile(venv_python):
        venv_python = sys.executable

    cmd = [
        venv_python, "-m", "uvicorn",
        "app.main:app",
        "--app-dir", "analytics_dashboard",
        "--host", "127.0.0.1",
        "--port", "8000"
    ]
    print(f"Starting server: {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd,
        cwd=server_path,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    return proc


def main():
    started = False
    proc = None

    if not check_server_ready():
        print("Server not running, starting...")
        proc = start_server()
        started = True
        if not check_server_ready():
            print("FAIL: Could not start server")
            if proc:
                proc.terminate()
            return 1

    errors = []

    health = request("/health")
    if not health or health.get("status") != "ok":
        errors.append("health check failed")

    summary = request("/api/summary")
    if not summary or "kpi" not in summary:
        errors.append("api/summary missing kpi")
    else:
        kpi = summary.get("kpi", {})
        print(f"KPI: GMV={kpi.get('gmv')}, orders={kpi.get('orders')}, buyers={kpi.get('buyers')}")
        if kpi.get("gmv") is not None:
            print("  KPI data valid")

    subprojects = request("/api/subprojects")
    if not subprojects or "subprojects" not in subprojects:
        errors.append("api/subprojects failed")
    else:
        sp_list = subprojects.get("subprojects", [])
        print(f"Subprojects: {len(sp_list)} found")
        if len(sp_list) < 3:
            errors.append(f"only {len(sp_list)} subprojects, expected >= 3")

    decision = request("/api/decision-board")
    if not decision or "decisions" not in decision:
        errors.append("api/decision-board missing decisions")
    else:
        decs = decision.get("decisions", [])
        print(f"Decisions: {len(decs)} found")
        if len(decs) < 3:
            errors.append(f"only {len(decs)} decisions, expected >= 3")

    index_page = request("/")
    if not index_page:
        errors.append("root page not accessible")

    if errors:
        print(f"\nFAIL: {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        if started and proc:
            proc.terminate()
        return 1

    print("\nFastAPI dashboard smoke test passed")
    if started and proc:
        proc.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
