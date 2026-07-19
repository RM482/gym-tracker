# Testing

Test levels per plan §17.0: Vitest unit suites (logic), phone-sized Playwright checks (WebKit for iPhone wiring; Chromium for reliable automated offline emulation), and manual device scripts (Safari/PWA truth). This file records device-script runs and the measured E2E tap counts per release.

## Tap-counting convention (plan §7)

Every discrete touch counts (buttons, fields, keyboard "done"); the keystrokes/speech of typing or dictating content itself do not.

## Manual E2E script — primary workflow (plan §17.3)

On the owner's iPhone, from the home screen:

1. Open the app. 2. Select a commonly used exercise. 3. Confirm the previous performance is visible without further taps. 4. Enter a new set. 5. Save it. 6. Add another set. 7. Confirm both appear in history. 8. Confirm the dashboard updated.

Acceptance bounds (plan §19.2): ≤ 5 taps for 3 repeat sets from app open; ≤ 5 taps + dictation for the sentence flow.

| Date | App version | Repeat-flow taps | Sentence-flow taps | Pass? | Notes |
|------|-------------|------------------|--------------------|-------|-------|
| — | — | — | — | — | first measurement due at Phase 9 |

## Device script (plan §17.2)

Run per release once deployed: Add to Home Screen; standalone launch; airplane-mode full workflow; dictation into quick entry; export to Files; import round-trip; force-quit persistence; storage-persist status; dark mode; update toast → new version; CSP check (no console violations / external requests); VoiceOver walkthrough of the log flow; 200 % zoom; contrast spot-check.

| Date | App version | Result | Notes |
|------|-------------|--------|-------|
| — | gt-v0.11.0 | Pending owner run | Automated offline reload, stale-tab lockout, dark mode, 200% text layout and modal focus pass; native install/dictation/share/VoiceOver/update notice still require the iPhone. |
