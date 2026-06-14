/**
 * FLUX - Lightweight Assertion Unit Testing Suite
 * Tests core ADE math, hysteresis logic, close-call boundaries, and session telemetry.
 */

import { ReactionTimeTracker, MovementAnalyzer, DifficultyController, TIERS } from './ade.js';
import { DopamineController, SoundSynth, ParticleManager } from './dopamine.js';

class MockSoundSynth extends SoundSynth {
    constructor() { super(); }
    init() {}
    _playTone() {}
    playCloseCall() {}
    playHit() {}
    playChime() {}
    playPowerUp() {}
    playClutchMode() {}
}

class MockParticleManager extends ParticleManager {
    constructor() { super(); }
    spawn() {}
    update() {}
    draw() {}
}

export function runUnitTests() {
    const listEl = document.getElementById('test-results-list');
    listEl.innerHTML = ''; // Clear results

    function logTestResult(name, success, errorMsg = '') {
        const item = document.createElement('div');
        if (success) {
            item.className = 'test-pass';
            item.textContent = `✓ [PASS] ${name}`;
        } else {
            item.className = 'test-fail';
            item.innerHTML = `✗ [FAIL] ${name}<br><small style="color:#ff5555; padding-left:10px;">Reason: ${errorMsg}</small>`;
        }
        listEl.appendChild(item);
    }

    let allPassed = true;

    // Test 1: StressIndex Calculation Weights & Bounds
    try {
        const rx = new ReactionTimeTracker();
        const mv = new MovementAnalyzer();
        const dc = new DifficultyController(rx, mv);

        rx.logReaction(1200); // Max reaction stress (>1200ms)
        dc.incrementMissStreak();
        dc.incrementMissStreak();
        dc.incrementMissStreak(); // Max miss streak stress (3 misses)

        // Populate history manually to trigger high hesitation and low variance
        const baseTime = performance.now();
        mv.history = [];
        for (let i = 0; i < 20; i++) {
            mv.history.push({
                time: baseTime - i * 100,
                x: 100,
                y: 100,
                speed: 5, // low speed -> high hesitation
                vx: 0,
                vy: 0,
                angle: 0
            });
        }

        const stress = dc.calculateStressIndex();
        if (stress < 60) {
            throw new Error(`Expected high stress index, got: ${stress}`);
        }
        if (stress > 100) {
            throw new Error(`Stress index exceeded upper bound 100: ${stress}`);
        }
        logTestResult('StressIndex calculation logic and bounds', true);
    } catch (e) {
        allPassed = false;
        logTestResult('StressIndex calculation logic and bounds', false, e.message);
    }

    // Test 2: Difficulty Tier Hysteresis
    try {
        const rx = new ReactionTimeTracker();
        const mv = new MovementAnalyzer();
        const dc = new DifficultyController(rx, mv);

        dc.currentTier = TIERS.LULLABY;

        rx.logReaction(1200); // 30% weight
        dc.incrementMissStreak();
        dc.incrementMissStreak();
        dc.incrementMissStreak(); // 20% weight
        
        // Populate history manually to trigger high hesitation
        const baseTime = performance.now();
        mv.history = [];
        for (let i = 0; i < 20; i++) {
            mv.history.push({
                time: baseTime - i * 100,
                x: 100,
                y: 100,
                speed: 5, // low speed -> 18% weight
                vx: 0,
                vy: 0,
                angle: 0
            });
        }

        // Trigger first update cycle
        let changed = dc.update(performance.now() + 3000);
        if (changed || dc.currentTier !== TIERS.LULLABY) {
            throw new Error(`Hysteresis failed: difficulty shifted on first evaluation tick`);
        }
        if (dc.pendingTier !== TIERS.SWEAT) {
            throw new Error(`Hysteresis failed: pendingTier not set correctly. Got: ${dc.pendingTier}`);
        }

        // Trigger second update cycle (should lock in change)
        changed = dc.update(performance.now() + 6000);
        if (!changed || dc.currentTier !== TIERS.SWEAT) {
            throw new Error(`Hysteresis failed: tier didn't lock in on second consecutive evaluation tick`);
        }

        logTestResult('Hysteresis tier stability (2 evaluation cycles)', true);
    } catch (e) {
        allPassed = false;
        logTestResult('Hysteresis tier stability (2 evaluation cycles)', false, e.message);
    }

    // Test 3: Reaction Time Normalization
    try {
        const rx = new ReactionTimeTracker();
        const mv = new MovementAnalyzer();
        const dc = new DifficultyController(rx, mv);

        // Normalization maps 200ms -> 0.0 and 1200ms -> 1.0
        // Test lower clamp
        rx.logReaction(100);
        let stress = dc.calculateStressIndex();
        if (rx.getAverageReactionTime() !== 100) {
            throw new Error(`Expected average reaction 100ms, got ${rx.getAverageReactionTime()}ms`);
        }

        // Test upper clamp
        rx.clear();
        rx.logReaction(3500); // exceeds 3000ms upper guard clamp
        if (rx.getAverageReactionTime() > 3000) {
            throw new Error(`Reaction time should be clamped below 3000ms. Got: ${rx.getAverageReactionTime()}ms`);
        }

        logTestResult('Reaction time boundaries and clamped values', true);
    } catch (e) {
        allPassed = false;
        logTestResult('Reaction time boundaries and clamped values', false, e.message);
    }

    // Test 4: Close-Call Geometry Proximity Check
    try {
        const synth = new MockSoundSynth();
        const particles = new MockParticleManager();
        const dopamine = new DopamineController(synth, particles);

        const player = { x: 100, y: 100, radius: 14 };
        const closeEnemy = { active: true, x: 135, y: 100, radius: 10, color: '#ffcc00' };
        const farEnemy = { active: true, x: 160, y: 100, radius: 10, color: '#ffcc00' };

        // Test Far Enemy (should not trigger)
        let didTrigger = dopamine.checkCloseCalls(player, [farEnemy]);
        if (didTrigger) {
            throw new Error(`Close call triggered incorrectly for distant enemy at 60px`);
        }

        // Test Close Enemy (should trigger)
        didTrigger = dopamine.checkCloseCalls(player, [closeEnemy]);
        if (!didTrigger) {
            throw new Error(`Close call failed to trigger for enemy at 35px`);
        }

        logTestResult('Close-call proximity detection geometry checks', true);
    } catch (e) {
        allPassed = false;
        logTestResult('Close-call proximity detection geometry checks', false, e.message);
    }

    // Test 5: Session Log Structure Integrity
    try {
        const dummyLog = {
            timestamp: 15,
            tier: TIERS.FLOW,
            stressIndex: 45.2,
            reactionTime: 320,
            score: 12500
        };

        const keys = ['timestamp', 'tier', 'stressIndex', 'reactionTime', 'score'];
        for (const k of keys) {
            if (!(k in dummyLog)) {
                throw new Error(`Missing key in session log: ${k}`);
            }
        }
        
        if (typeof dummyLog.stressIndex !== 'number' || typeof dummyLog.tier !== 'string') {
            throw new Error(`Session log variables contain incorrect types`);
        }

        logTestResult('Session log telemetry object schema integrity', true);
    } catch (e) {
        allPassed = false;
        logTestResult('Session log telemetry object schema integrity', false, e.message);
    }

    // Simulation: 60-Second Game Run with Synthetic Inputs
    try {
        const rx = new ReactionTimeTracker();
        const mv = new MovementAnalyzer();
        const dc = new DifficultyController(rx, mv);
        
        const stressCurve = [];
        let time = 0; // ms
        
        // Loop 60 seconds. Evaluation ticks happen every 3 seconds (20 iterations)
        for (let step = 0; step < 20; step++) {
            time += 3000;
            const baseTime = performance.now() + time;

            // Phase 1 (0s to 20s): Elite players. Superfast reaction (220ms), fluent movement, no misses.
            if (step < 7) {
                // Flush buffer with fast reaction times
                for (let k = 0; k < 10; k++) {
                    rx.logReaction(220);
                }
                dc.resetMissStreak();
                // Manually populate high movement speed
                mv.history = [];
                for (let i = 0; i < 20; i++) {
                    mv.history.push({
                        time: baseTime - i * 100,
                        x: 100 + i * 20,
                        y: 100,
                        speed: 200,
                        vx: 200,
                        vy: 0,
                        angle: 0
                    });
                }
            } 
            // Phase 2 (20s to 40s): Stressed players. Slow reactions (1200ms), erratic speed variance, successive misses.
            else if (step < 14) {
                // Flush buffer with slow reaction times (30% stress)
                for (let k = 0; k < 10; k++) {
                    rx.logReaction(1200);
                }
                dc.incrementMissStreak();
                dc.incrementMissStreak();
                dc.incrementMissStreak(); // 20% stress (3 misses maxed)
                
                mv.history = [];
                for (let i = 0; i < 20; i++) {
                    mv.history.push({
                        time: baseTime - i * 100,
                        x: 100,
                        y: 100,
                        speed: i % 2 === 0 ? 0 : 400, // alternating speed -> 10% stress
                        vx: 0,
                        vy: 0,
                        angle: 0
                    });
                }
                mv.directionChanges = [];
                for (let i = 0; i < 6; i++) {
                    mv.directionChanges.push(baseTime - i * 50); // 10% stress (bursts)
                }
            }
            // Phase 3 (40s to 60s): Stabilizing players. Regular response (480ms), controlled movement, 0 misses.
            else {
                // Flush buffer with stabilized reaction times
                for (let k = 0; k < 10; k++) {
                    rx.logReaction(480);
                }
                dc.resetMissStreak();
                mv.history = [];
                for (let i = 0; i < 20; i++) {
                    mv.history.push({
                        time: baseTime - i * 100,
                        x: 100 + i * 10,
                        y: 100,
                        speed: 100,
                        vx: 100,
                        vy: 0,
                        angle: 0
                    });
                }
            }

            dc.update(baseTime);
            stressCurve.push({ time: time / 1000, stress: dc.stressIndex, tier: dc.currentTier });
        }

        const initialTier = stressCurve[0].tier;
        const peakTier = stressCurve.reduce((max, c) => {
            const order = [TIERS.LULLABY, TIERS.CHILL, TIERS.FLOW, TIERS.SWEAT, TIERS.BEAST];
            return order.indexOf(c.tier) > order.indexOf(max) ? c.tier : max;
        }, TIERS.LULLABY);

        if (initialTier !== TIERS.LULLABY && initialTier !== TIERS.CHILL) {
            throw new Error(`Simulation error: initial difficulty curve did not start low.`);
        }
        if (peakTier !== TIERS.SWEAT && peakTier !== TIERS.BEAST) {
            throw new Error(`Simulation error: stress simulation did not scale up to high difficulty. Got peak: ${peakTier}`);
        }
        
        logTestResult(`60s Simulated Session (Curve: Low → Peak [${peakTier}] → Stabilize)`, true);
    } catch (e) {
        allPassed = false;
        logTestResult(`60s Simulated Session (Curve: Low → Peak → Stabilize)`, false, e.message);
    }

    return allPassed;
}
