"""
Pytest fixtures for e2e tests. Starts the dev server once per session,
then provides a fresh Playwright page per test.
"""

import os
import socket
import subprocess
import time
from typing import List

import pytest
from playwright.sync_api import Browser, Page, sync_playwright

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "http://localhost:8000"


def _wait_for_port(port: int, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("localhost", port), timeout=0.5):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.2)
    return False


@pytest.fixture(scope="session")
def dev_server():
    """Start `deno task dev` once for the whole test session."""
    proc = subprocess.Popen(
        ["deno", "task", "dev"],
        cwd=PROJECT_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if not _wait_for_port(8000):
        proc.kill()
        raise RuntimeError("dev server failed to start on port 8000")
    yield BASE_URL
    proc.kill()
    proc.wait()


@pytest.fixture(scope="session")
def browser(dev_server) -> Browser:
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()


@pytest.fixture
def page(browser, dev_server) -> Page:
    """
    Fresh page per test, pre-navigated to the app.
    Console errors that occur during the initial load are stored on
    `page.console_errors` so tests can assert on them without reloading.
    """
    ctx = browser.new_context()
    pg = ctx.new_page()

    errors: List[str] = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    pg.goto(dev_server)
    pg.wait_for_load_state("load")
    # Brief pause to let any async errors surface (e.g. module import failures).
    time.sleep(0.3)

    pg.console_errors = errors  # type: ignore[attr-defined]
    yield pg
    ctx.close()
