# FLUX - Adaptive difficulty survival arena

**FLUX** is a browser-based 2D survival arcade game where the enemy AI difficulty dynamically scales in real-time based on biometric and behavioral signals. It leverages player reaction latency, movement trajectories, and stress proxy inputs to curate a continuous state of flow, creating a "dopamine factory" that feels challenging yet highly rewarding.

---

## Architecture Overview

FLUX is built using **Vanilla HTML5 Canvas & ES6 modules** with a structured, component-oriented codebase:

1. **[index.html](file:///e:/neuro-game/index.html)**: Container structure holding HUD, Start/Death screen templates, and DEV_MODE diagnostics overlays.
2. **[style.css](file:///e:/neuro-game/style.css)**: Glassmorphism layout designs, screen-shake styles, and color tier palettes.
3. **[game.js](file:///e:/neuro-game/js/game.js)**: Orchestrates the main update cycle (`requestAnimationFrame`), event-bindings, collisions, and gameplay states.
4. **[ade.js](file:///e:/neuro-game/js/ade.js)**: *Adaptive Difficulty Engine*. Tracks reaction latencies, movement speeds, calculates StressIndex, and regulates hysteresis.
5. **[enemies.js](file:///e:/neuro-game/js/enemies.js)**: Handles sine wave, homing, and burst enemy movement physics, warning zones, and memory-safe object-pooling.
6. **[dopamine.js](file:///e:/neuro-game/js/dopamine.js)**: Governs micro-rewards (close calls, streaks), screen shake multipliers, sound synthesis (Web Audio API), and Clutch Mode slowdown triggers.
7. **[ui.js](file:///e:/neuro-game/js/ui.js)**: Controls HUD readouts, float text warnings, and graphs the session logs onto the results Canvas chart.
8. **[tests.js](file:///e:/neuro-game/js/tests.js)**: Lightweight, built-in test suite asserting calculations, distance geometry, and a 60s synthetic user simulation.

---

## Adaptive Difficulty Engine (ADE) Breakdown

The difficulty evaluates every 3 seconds across 5 tiers: **Lullaby**, **Chill**, **Flow**, **Sweat**, and **Beast**.

*   **Reaction Latency (30%)**: Spawns threat warning telegraph zones at the player's position. Measures the time (ms) to exit the radius. Clamped between 200ms (elite) and 1200ms (struggling).
*   **Hesitation Ratio (20%)**: Measures the duration spent moving under 30 px/s for consecutive 300ms chunks.
*   **Velocity Variance (20%)**: Variance of player movement speeds over a rolling 5-second window. High values show erratic panicking.
*   **Input Burst Rate (10%)**: Measures high-frequency directions changes (>45 degrees) in a 500ms window.
*   **Miss Streak (20%)**: Hits taken in quick succession.

### Hysteresis (Anti-Oscillation)
To prevent jarring speed modifications, the ADE checks target difficulty tiers. A tier change is only approved if it receives **two consecutive** evaluations pointing to that same new tier. Smooth speed interpolation is applied over 1.0s to active enemies to prevent teleportation.

---

## Dopamine & Visual Juice Triggers

*   **Close Calls**: Passing within 15px of a hazard spawns "+100 CLOSE!" text, triggers a particle burst, shakes the screen, and increments the score multiplier streak.
*   **Streak Multipliers**: Consecutive clean warning dodges scale score multipliers up to $5.0\text{x}$.
*   **Clutch Mode (Comeback Mechanic)**: Triggered when the player's StressIndex drops from $>80$ to $<50$ within a 10-second window. The game goes into slow-motion (50% speed) for 3 seconds, flashing chromatic aberration colors, and doubling score gains.
*   **Sound Synthesis**: High-quality retro sound effects are generated dynamically using the Web Audio API—no heavy asset downloads needed.

---

## Setup & Running the Game

Due to browser CORS policies regarding ES6 modules, files cannot be run directly via `file://`. A local web server is required.

### Options to Run:
1.  **Python** (Pre-installed on most systems):
    ```bash
    python -m http.server 8000
    ```
    Then open: `http://localhost:8000`

2.  **Node.js / npm**:
    ```bash
    npx serve
    ```
    Then open the URL shown in terminal (usually `http://localhost:3000` or `http://localhost:5000`).

3.  **VS Code Live Server**:
    Right-click `index.html` and select "Open with Live Server".

---

## Developer Hotkeys (For Demos & Testing)

*   **`Shift + D`**: Force cycles the difficulty tier for live inspection.
*   **`T`**: Launches the built-in Unit Tests overlay window and executes assertion test suites instantly.
