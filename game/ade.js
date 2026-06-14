/**
 * FLUX - Adaptive Difficulty Engine (ADE)
 * Governs signal collection, normalization, stress indexing, and difficulty controller transitions.
 */

export const TIERS = {
    LULLABY: 'LULLABY',
    CHILL: 'CHILL',
    FLOW: 'FLOW',
    SWEAT: 'SWEAT',
    BEAST: 'BEAST'
};

export const TIER_ORDER = [TIERS.LULLABY, TIERS.CHILL, TIERS.FLOW, TIERS.SWEAT, TIERS.BEAST];

// Map tiers to color variables
export const TIER_COLORS = {
    [TIERS.LULLABY]: '#00ff88',
    [TIERS.CHILL]: '#00f0ff',
    [TIERS.FLOW]: '#d200ff',
    [TIERS.SWEAT]: '#ff6c00',
    [TIERS.BEAST]: '#ff0055'
};

/**
 * Tracks response speed to visible danger indicators.
 * Spawns threat warning zones centered on player and logs exit speed.
 */
export class ReactionTimeTracker {
    constructor(maxSize = 10) {
        this.buffer = []; // rolling buffer of reaction time samples (ms)
        this.maxSize = maxSize;
        this.activeTelegraph = null; // current active telegraph { spawnTime, radius, x, y, resolved }
    }

    /**
     * Spawns a warning zone exactly at the player's position.
     * @param {number} x Player X
     * @param {number} y Player Y
     * @param {number} radius Telegraph radius
     * @param {number} duration MS before detonation
     */
    triggerTelegraph(x, y, radius, duration) {
        this.activeTelegraph = {
            spawnTime: performance.now(),
            duration: duration,
            x: x,
            y: y,
            radius: radius,
            resolved: false,
            exitTime: null
        };
        return this.activeTelegraph;
    }

    /**
     * Called on each game tick to track if the player has exited the active zone.
     * @param {number} px Player X
     * @param {number} py Player Y
     */
    update(px, py) {
        if (!this.activeTelegraph || this.activeTelegraph.resolved) return;

        const dx = px - this.activeTelegraph.x;
        const dy = py - this.activeTelegraph.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if player has moved outside warning radius
        if (dist > this.activeTelegraph.radius) {
            this.activeTelegraph.exitTime = performance.now();
            const latency = this.activeTelegraph.exitTime - this.activeTelegraph.spawnTime;
            this.logReaction(latency);
            this.activeTelegraph.resolved = true;
        } else if (performance.now() - this.activeTelegraph.spawnTime > this.activeTelegraph.duration) {
            // Detonated before escaping (failure)
            this.logReaction(this.activeTelegraph.duration + 300); // Penalty latency
            this.activeTelegraph.resolved = true;
        }
    }

    /**
     * Add latency to buffer and maintain size limit
     */
    logReaction(latencyMs) {
        // Clamp sanity check to prevent NaN or erratic values
        const safeLatency = Math.max(100, Math.min(3000, isNaN(latencyMs) ? 1500 : latencyMs));
        this.buffer.push(safeLatency);
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    }

    /**
     * Returns average reaction time in ms. Returns default of 500ms if buffer is empty.
     */
    getAverageReactionTime() {
        if (this.buffer.length === 0) return 500;
        const sum = this.buffer.reduce((a, b) => a + b, 0);
        return sum / this.buffer.length;
    }

    clear() {
        this.buffer = [];
        this.activeTelegraph = null;
    }
}

/**
 * Tracks movement speeds, path variance, direction shifts, and hesitation metrics.
 */
export class MovementAnalyzer {
    constructor(windowSizeMs = 5000) {
        this.windowSizeMs = windowSizeMs; // Default 5s rolling window
        this.history = []; // Array of { time, x, y, speed, vx, vy, angle }
        this.lastSampleTime = 0;
        this.lastPosition = null;
        this.directionChanges = []; // Timestamps of sharp turns (>45 degrees)
    }

    /**
     * Sample player position every 100ms
     */
    sample(x, y) {
        const now = performance.now();
        if (now - this.lastSampleTime < 100) return;

        let speed = 0;
        let vx = 0;
        let vy = 0;
        let angle = 0;

        if (this.lastPosition) {
            vx = (x - this.lastPosition.x) / 0.1; // px per second
            vy = (y - this.lastPosition.y) / 0.1;
            speed = Math.sqrt(vx * vx + vy * vy);
            angle = Math.atan2(vy, vx);

            // Direction change detection (> 45 deg)
            if (this.history.length > 0) {
                const prev = this.history[this.history.length - 1];
                let diff = Math.abs(angle - prev.angle);
                if (diff > Math.PI) diff = 2 * Math.PI - diff;

                if (diff > Math.PI / 4 && speed > 50) {
                    this.directionChanges.push(now);
                }
            }
        }

        this.history.push({ time: now, x, y, speed, vx, vy, angle });
        this.lastPosition = { x, y };
        this.lastSampleTime = now;

        this._prune(now);
    }

    /**
     * Cleans history older than rolling window
     */
    _prune(now) {
        const threshold = now - this.windowSizeMs;
        this.history = this.history.filter(h => h.time >= threshold);
        this.directionChanges = this.directionChanges.filter(t => t >= threshold);
    }

    /**
     * Computes variance of speeds in rolling window
     */
    getVelocityVariance() {
        if (this.history.length < 2) return 0;
        const speeds = this.history.map(h => h.speed);
        const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        const sqDiffs = speeds.map(s => Math.pow(s - mean, 2));
        const variance = sqDiffs.reduce((a, b) => a + b, 0) / speeds.length;
        return isNaN(variance) ? 0 : variance;
    }

    /**
     * Computes direction changes in the last 500ms
     */
    getInputBurstRate() {
        const now = performance.now();
        const threshold = now - 500;
        return this.directionChanges.filter(t => t >= threshold).length;
    }

    /**
     * Hesitation = percentage of time in window spent standing still (<30 px/s) for >300ms continuous chunks
     */
    getHesitationRatio() {
        if (this.history.length < 3) return 0;

        let hesitationSamples = 0;
        let consecutiveLowSpeed = 0;

        for (let i = 0; i < this.history.length; i++) {
            if (this.history[i].speed < 30) {
                consecutiveLowSpeed++;
                // If velocity remains low for >300ms (3 samples since sampling rate is 100ms)
                if (consecutiveLowSpeed >= 3) {
                    hesitationSamples++;
                }
            } else {
                consecutiveLowSpeed = 0;
            }
        }

        const ratio = hesitationSamples / this.history.length;
        return isNaN(ratio) ? 0 : ratio;
    }

    clear() {
        this.history = [];
        this.lastPosition = null;
        this.directionChanges = [];
        this.lastSampleTime = 0;
    }
}

/**
 * Difficulty Controller compiles the signals and maps them to difficulty levels.
 * Evaluates every 3 seconds and applies hysteresis (must agree twice before changing).
 */
export class DifficultyController {
    constructor(reactionTracker, movementAnalyzer) {
        this.reactionTracker = reactionTracker;
        this.movementAnalyzer = movementAnalyzer;
        
        this.currentTier = TIERS.LULLABY;
        this.stressIndex = 0;
        this.missStreak = 0; // hits taken in succession

        // Hysteresis buffers
        this.pendingTier = TIERS.LULLABY;
        this.pendingTicks = 0;
        this.evalInterval = 3000; // 3 seconds
        this.lastEvalTime = 0;
    }

    incrementMissStreak() {
        this.missStreak = Math.min(5, this.missStreak + 1);
    }

    resetMissStreak() {
        this.missStreak = 0;
    }

    /**
     * Calculates the composite StressIndex (0 - 100)
     */
    calculateStressIndex() {
        // 1. Reaction normalized (200ms = 0, 1200ms = 1)
        const avgReaction = this.reactionTracker.getAverageReactionTime();
        const normReaction = Math.min(1, Math.max(0, (avgReaction - 200) / 1000));

        // 2. Hesitation ratio (0 to 1)
        const hesitation = Math.min(1, Math.max(0, this.movementAnalyzer.getHesitationRatio()));

        // 3. Velocity variance normalized (0 to 80000 px^2/s^2)
        // High speed variance suggests erratic panicking/bursty movement.
        const variance = this.movementAnalyzer.getVelocityVariance();
        const normVariance = Math.min(1, Math.max(0, variance / 80000));

        // 4. Input burst rate (direction changes in last 500ms)
        const burstRate = this.movementAnalyzer.getInputBurstRate();
        const normBurst = Math.min(1, Math.max(0, burstRate / 6));

        // 5. Miss streak (hits in succession)
        const normMiss = Math.min(1, Math.max(0, this.missStreak / 3));

        // Composite weights
        // Reaction (30%), Hesitation (20%), Variance (20%), Input burst (10%), Misses (20%)
        const composite = (normReaction * 0.30) + 
                          (hesitation * 0.20) + 
                          (normVariance * 0.20) + 
                          (normBurst * 0.10) + 
                          (normMiss * 0.20);

        this.stressIndex = Math.min(100, Math.max(0, isNaN(composite) ? 0 : composite * 100));
        return this.stressIndex;
    }

    /**
     * Checks if it's time to evaluate and run hysteresis updates.
     * Evaluates every 3 seconds.
     * @param {number} now current performance.now()
     * @returns {boolean} True if difficulty tier changed
     */
    update(now) {
        if (now - this.lastEvalTime < this.evalInterval) {
            return false;
        }
        this.lastEvalTime = now;

        const stress = this.calculateStressIndex();
        let targetTier = TIERS.LULLABY;

        if (stress >= 85) {
            targetTier = TIERS.BEAST;
        } else if (stress >= 65) {
            targetTier = TIERS.SWEAT;
        } else if (stress >= 40) {
            targetTier = TIERS.FLOW;
        } else if (stress >= 20) {
            targetTier = TIERS.CHILL;
        }

        // Hysteresis: requires 2 consecutive checks yielding the same target tier before switching
        if (targetTier === this.currentTier) {
            this.pendingTier = this.currentTier;
            this.pendingTicks = 0;
            return false;
        }

        if (targetTier === this.pendingTier) {
            this.pendingTicks++;
            if (this.pendingTicks >= 2) {
                // Confirm tier shift
                this.currentTier = this.pendingTier;
                this.pendingTicks = 0;
                return true; // Tier changed!
            }
        } else {
            this.pendingTier = targetTier;
            this.pendingTicks = 1;
        }

        return false;
    }

    getCurrentTier() {
        return this.currentTier;
    }

    /**
     * Forces a specific tier (for debug purposes)
     */
    forceTier(tier) {
        if (TIERS[tier]) {
            this.currentTier = tier;
            this.pendingTier = tier;
            this.pendingTicks = 0;
            return true;
        }
        return false;
    }

    /**
     * Retrieves difficulty params for enemy systems based on active tier
     */
    getEnemyParams() {
        switch (this.currentTier) {
            case TIERS.LULLABY:
                return {
                    spawnInterval: 4000,
                    baseSpeed: 1.5,
                    telegraphDuration: 2500,
                    patternMix: { straight: 1.0, sine: 0.0, homing: 0.0, burst: 0.0 },
                    multiplier: 1.0
                };
            case TIERS.CHILL:
                return {
                    spawnInterval: 2500,
                    baseSpeed: 2.2,
                    telegraphDuration: 1800,
                    patternMix: { straight: 0.7, sine: 0.3, homing: 0.0, burst: 0.0 },
                    multiplier: 1.5
                };
            case TIERS.FLOW:
                return {
                    spawnInterval: 1500,
                    baseSpeed: 3.0,
                    telegraphDuration: 1200,
                    patternMix: { straight: 0.5, sine: 0.3, homing: 0.2, burst: 0.0 },
                    multiplier: 2.5
                };
            case TIERS.SWEAT:
                return {
                    spawnInterval: 1000,
                    baseSpeed: 4.0,
                    telegraphDuration: 800,
                    patternMix: { straight: 0.0, sine: 0.3, homing: 0.4, burst: 0.3 },
                    multiplier: 4.0
                };
            case TIERS.BEAST:
                return {
                    spawnInterval: 700,
                    baseSpeed: 5.2,
                    telegraphDuration: 500,
                    patternMix: { straight: 0.0, sine: 0.1, homing: 0.5, burst: 0.4 },
                    multiplier: 6.0
                };
            default:
                return {
                    spawnInterval: 3000,
                    baseSpeed: 2.0,
                    telegraphDuration: 2000,
                    patternMix: { straight: 1.0, sine: 0.0, homing: 0.0, burst: 0.0 },
                    multiplier: 1.0
                };
        }
    }

    reset() {
        this.currentTier = TIERS.LULLABY;
        this.stressIndex = 0;
        this.missStreak = 0;
        this.pendingTier = TIERS.LULLABY;
        this.pendingTicks = 0;
        this.lastEvalTime = performance.now();
    }
}
