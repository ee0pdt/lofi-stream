"""
E2e tests for lofi forever. Each test gets a fresh page pre-navigated to
http://localhost:8000. The dev server is started once per session by conftest.
"""

import time

import pytest
from playwright.sync_api import Page, expect

ALL_MOODS = ["rainy", "late", "cafe", "sleepy", "transit"]
ALL_SLIDERS = [
    "volSlider",
    "reverbSlider",
    "warpSlider",
    "bpmSlider",
    "complexitySlider",
    "rainSlider",
]


# ---------------------------------------------------------------------------
# Page load
# ---------------------------------------------------------------------------


def test_page_loads_without_console_errors(page: Page):
    # Errors captured during initial load by the conftest fixture.
    assert page.console_errors == [], f"Console errors on load: {page.console_errors}"  # type: ignore[attr-defined]


def test_play_button_present(page: Page):
    expect(page.locator("#playBtn")).to_be_visible()


def test_initial_status_is_ready(page: Page):
    expect(page.locator("#statusTxt")).to_have_text("ready")


def test_all_mood_buttons_present(page: Page):
    for mood in ALL_MOODS:
        btn = page.locator(f'[data-mood="{mood}"]')
        expect(btn).to_be_visible()


def test_initial_mood_is_rainy(page: Page):
    rainy = page.locator('[data-mood="rainy"]')
    expect(rainy).to_have_class("mood-btn active")


def test_all_sliders_present(page: Page):
    # Sliders live inside the bottom sheet which starts collapsed, so they
    # are attached to the DOM but not necessarily visible.
    for slider_id in ALL_SLIDERS:
        expect(page.locator(f"#{slider_id}")).to_be_attached()


# ---------------------------------------------------------------------------
# Play / pause
# ---------------------------------------------------------------------------


def test_play_starts_audio(page: Page):
    page.click("#playBtn")
    # setStatusPlaying(true) fires synchronously after the toggle; give
    # initAudio a beat to run (it's sync but resuming the context is async).
    expect(page.locator("#statusTxt")).to_have_text("playing ∞", timeout=5000)
    expect(page.locator("#dot")).to_have_class("dot live")

    # Verify AudioContext is actually running via the debug hook.
    state = page.evaluate("window.__lofi.actxState()")
    assert state == "running", f"Expected AudioContext 'running', got '{state}'"


def test_pause_after_play(page: Page):
    page.click("#playBtn")
    expect(page.locator("#statusTxt")).to_have_text("playing ∞", timeout=5000)

    page.click("#playBtn")
    expect(page.locator("#statusTxt")).to_have_text("paused", timeout=5000)
    expect(page.locator("#dot")).not_to_have_class("dot live")


# ---------------------------------------------------------------------------
# Mood switching
# ---------------------------------------------------------------------------


def test_mood_switch_changes_active_button(page: Page):
    page.click('[data-mood="cafe"]')
    expect(page.locator('[data-mood="cafe"]')).to_have_class("mood-btn active")
    expect(page.locator('[data-mood="rainy"]')).not_to_have_class("mood-btn active")


def test_mood_switch_changes_css_accent(page: Page):
    rainy_warm = page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--warm').trim()"
    )
    page.click('[data-mood="cafe"]')
    time.sleep(0.1)  # applyMoodUI is synchronous but rAF may batch
    cafe_warm = page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--warm').trim()"
    )
    assert rainy_warm != cafe_warm, "Expected --warm to change on mood switch"


@pytest.mark.parametrize("mood", ALL_MOODS)
def test_each_mood_button_activates(page: Page, mood: str):
    page.click(f'[data-mood="{mood}"]')
    expect(page.locator(f'[data-mood="{mood}"]')).to_have_class("mood-btn active")
