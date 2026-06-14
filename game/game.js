/**
 * FLUX - Main Game Module
 * Orchestrates the game loop, state transitions, physics, collisions, inputs, and canvas scaling.
 */

import { ReactionTimeTracker, MovementAnalyzer, DifficultyController, TIERS, TIER_COLORS } from './ade.js';
import { EnemyManager } from './enemies.js';
import { SoundSynth, ParticleManager, DopamineController } from './dopamine.js';
import { UIManager } from './ui.js';
import { runUnitTests } from './tests.js';

// Global configurations
const DEV_MODE = true; // Enabled for hackathon judging demo visibility

const STATES = {
    IDLE: 'IDLE',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER'
};

class Game {
    constructor() {
        this.state = STATES.IDLE;
        
        // Canvas Setup
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Core systems
        this.reactionTracker = new ReactionTimeTracker();
        this.movementAnalyzer = new MovementAnalyzer();
        this.difficultyController = new DifficultyController(this.reactionTracker, this.movementAnalyzer);
        this.enemyManager = new EnemyManager(this.width, this.height);
        
        this.soundSynth = new SoundSynth();
        this.particleManager = new ParticleManager();
        this.dopamineController = new DopamineController(this.soundSynth, this.particleManager);
        this.uiManager = new UIManager();

        // Game state variables
        this.score = 0;
        this.timeSurvived = 0; // seconds
        this.player = {
            x: this.width / 2,
            y: this.height / 2,
            radius: 14,
            shield: 100, // 100 max shield
            color: '#00f0ff',
            targetX: this.width / 2,
            targetY: this.height / 2
        };

        // Analytics logger
        this.sessionLog = [];
        this.lastLogTime = 0;
        
        // Spawning intervals
        this.lastSpawnTime = 0;
        this.lastTelegraphTime = 0;
        this.telegraphInterval = 5500; // spawn reaction check warning every 5.5s

        // Highscore tracking (local storage)
        this.highscore = parseInt(localStorage.getItem('flux_highscore') || '0');

        // Loop management
        this.lastTime = 0;
        this.animationFrameId = null;

        // Custom stats tracking for Death screen
        this.sessionStats = {
            score: 0,
            peakTier: TIERS.LULLABY,
            avgReaction: 500,
            bestStreak: 1.0
        };

        // Event hooks & listeners
        this.setupInputListeners();
        this.setupCustomHooks();
        
        // Initialize menu systems
        this.uiManager.showStartScreen();
        if (DEV_MODE) {
            document.getElementById('debug-panel').classList.remove('hidden');
        }

        // Start background visual preview loops for Menu screen
        this.startBackgroundLoop();
    }

    resizeCanvas() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.enemyManager) {
            this.enemyManager.setDimensions(this.width, this.height);
        }
    }

    setupInputListeners() {
        // Track mouse movement
        const handleMove = (x, y) => {
            if (this.state !== STATES.PLAYING) {
                // Renders mouse followers on idle screen
                this.player.targetX = x;
                this.player.targetY = y;
                return;
            }
            // Clamped coordinates to stay inside canvas view boundary
            this.player.targetX = Math.max(15, Math.min(this.width - 15, x));
            this.player.targetY = Math.max(15, Math.min(this.height - 15, y));
            this.movementAnalyzer.sample(this.player.x, this.player.y);
        };

        window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));

        // Touch support
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        // Start button trigger
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());

        // Pauses loop when tab is hidden (prevents false stress measurements)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.state === STATES.PLAYING) {
                    this.pauseGame();
                }
            } else {
                if (this.state === STATES.PLAYING) {
                    this.resumeGame();
                }
            }
        });

        // Developer Mode Hotkeys
        window.addEventListener('keydown', (e) => {
            // Shift + D cycles difficulty tiers
            if (e.shiftKey && e.key.toUpperCase() === 'D') {
                this.cycleDifficultyDebug();
            }
            // 'T' key runs unit tests overlay
            if (e.key.toLowerCase() === 't') {
                this.toggleTestsOverlay();
            }
        });

        document.getElementById('close-tests-btn').addEventListener('click', () => {
            document.getElementById('test-overlay').classList.add('hidden');
        });
    }

    /**
     * Set event integrations emitted by other components
     */
    setupCustomHooks() {
        window.addEventListener('closecall', (e) => {
            const { x, y } = e.detail;
            this.uiManager.addFloatingText(x, y, `+100 CLOSE!`, '#ff00c8');
            this.score += 100 * this.dopamineController.multiplier;
        });

        window.addEventListener('multiplierup', (e) => {
            const mult = e.detail.mult;
            this.uiManager.showToast(`STREAK: ${mult.toFixed(1)}x`, '#ffcc00');
        });

        window.addEventListener('clutchmode', (e) => {
            const active = e.detail.active;
            if (active) {
                this.uiManager.showToast('CLUTCH MODE ACTIVATED', '#ff00c8');
                document.body.classList.add('shake');
                setTimeout(() => document.body.classList.remove('shake'), 400);
            } else {
                this.uiManager.showToast('CLUTCH MODE EXPIRED', '#8fa0dd');
            }
        });
    }

    /**
     * Cycles difficulty level manually for developer demos
     */
    cycleDifficultyDebug() {
        const order = [TIERS.LULLABY, TIERS.CHILL, TIERS.FLOW, TIERS.SWEAT, TIERS.BEAST];
        const nextIdx = (order.indexOf(this.difficultyController.currentTier) + 1) % order.length;
        const nextTier = order[nextIdx];
        
        this.difficultyController.forceTier(nextTier);
        this.uiManager.setTierTheme(nextTier);
        this.uiManager.showToast(`FORCE DEV TIER: ${nextTier}`, TIER_COLORS[nextTier]);
        this.soundSynth.playPowerUp();
    }

    toggleTestsOverlay() {
        const overlay = document.getElementById('test-overlay');
        if (overlay.classList.contains('hidden')) {
            overlay.classList.remove('hidden');
            runUnitTests();
        } else {
            overlay.classList.add('hidden');
        }
    }

    startGame() {
        // Initialize synthesized Audio context
        this.soundSynth.init();

        this.state = STATES.PLAYING;
        this.score = 0;
        this.timeSurvived = 0;
        this.player.shield = 100;
        this.player.x = this.width / 2;
        this.player.y = this.height / 2;
        this.player.targetX = this.width / 2;
        this.player.targetY = this.height / 2;

        this.sessionLog = [];
        this.lastLogTime = performance.now();
        this.lastSpawnTime = performance.now();
        this.lastTelegraphTime = performance.now();

        // Clear tracking buffers
        this.reactionTracker.clear();
        this.movementAnalyzer.clear();
        this.difficultyController.reset();
        this.enemyManager.clearAll();
        this.particleManager.clear();
        this.dopamineController.clear();
        this.uiManager.clear();

        this.uiManager.showGameplayHUD();
        this.uiManager.setTierTheme(this.difficultyController.currentTier);
        this.uiManager.showToast("SURVIVE THE FLUX", '#00f0ff');
        this.soundSynth.playPowerUp();

        // Cancel menu background loops
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    pauseGame() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    resumeGame() {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    gameOver() {
        this.state = STATES.GAME_OVER;
        this.pauseGame();
        
        this.soundSynth.playHit();
        
        // Save best achievements
        if (this.score > this.highscore) {
            this.highscore = Math.floor(this.score);
            localStorage.setItem('flux_highscore', this.highscore);
        }

        // Calculate analytics stats
        const activeTiers = this.sessionLog.map(h => h.tier);
        let peakTier = TIERS.LULLABY;
        const tierOrder = [TIERS.LULLABY, TIERS.CHILL, TIERS.FLOW, TIERS.SWEAT, TIERS.BEAST];
        for (const t of activeTiers) {
            if (tierOrder.indexOf(t) > tierOrder.indexOf(peakTier)) {
                peakTier = t;
            }
        }

        this.sessionStats = {
            score: this.score,
            peakTier: peakTier,
            avgReaction: this.reactionTracker.getAverageReactionTime(),
            bestStreak: this.dopamineController.multiplier
        };

        this.uiManager.showDeathScreen(this.sessionStats, this.sessionLog);
        
        // Restart background loop
        this.startBackgroundLoop();
    }

    /**
     * Poll Gamepad input if available on system
     */
    pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0];
        if (gp) {
            const stickX = gp.axes[0]; // Range -1.0 to 1.0
            const stickY = gp.axes[1];
            const speed = 7;
            
            // apply deadzone
            if (Math.abs(stickX) > 0.15 || Math.abs(stickY) > 0.15) {
                const nx = this.player.targetX + stickX * speed;
                const ny = this.player.targetY + stickY * speed;
                this.player.targetX = Math.max(15, Math.min(this.width - 15, nx));
                this.player.targetY = Math.max(15, Math.min(this.height - 15, ny));
            }
        }
    }

    /**
     * Renders background visuals for title menu
     */
    startBackgroundLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        const tick = () => {
            this.ctx.fillStyle = 'rgba(5, 7, 18, 0.1)';
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Draw glowing matrix lines or dummy particles
            const now = performance.now();
            
            // Move player to target with slow interpolation
            this.player.x += (this.player.targetX - this.player.x) * 0.05;
            this.player.y += (this.player.targetY - this.player.y) * 0.05;
            
            // Draw player preview
            this.ctx.save();
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = '#00f0ff';
            this.ctx.strokeStyle = '#00f0ff';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();

            this.animationFrameId = requestAnimationFrame(tick);
        };
        
        tick();
    }

    loop(timestamp) {
        if (this.state !== STATES.PLAYING) return;
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));

        // Time delta (clamped to prevent frame drop tunneling)
        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (dt > 0.1) dt = 0.1;

        // Apply Clutch Mode time slow down (50%)
        const timeScale = this.dopamineController.getSpeedMultiplier();
        const adjustedDt = dt * timeScale;

        // Inputs
        this.pollGamepad();

        // Update positions
        this.player.x += (this.player.targetX - this.player.x) * 0.25; // responsive movement
        this.player.y += (this.player.targetY - this.player.y) * 0.25;

        // Update warning indicator tracking
        this.reactionTracker.update(this.player.x, this.player.y);

        const currentParams = this.difficultyController.getEnemyParams();

        // 1. Spawning enemies
        if (timestamp - this.lastSpawnTime > currentParams.spawnInterval) {
            this.lastSpawnTime = timestamp;
            const color = TIER_COLORS[this.difficultyController.currentTier];
            this.enemyManager.spawnEnemy(this.player.x, this.player.y, currentParams, color);
        }

        // 2. Spawning warning telegraph events
        if (timestamp - this.lastTelegraphTime > this.telegraphInterval) {
            this.lastTelegraphTime = timestamp;
            const duration = currentParams.telegraphDuration;
            const t = this.enemyManager.spawnTelegraph(this.player.x, this.player.y, duration);
            if (t) {
                this.reactionTracker.triggerTelegraph(this.player.x, this.player.y, t.radius, duration);
            }
        }

        // 3. Update subsystems
        this.enemyManager.update(adjustedDt, this.player.x, this.player.y, currentParams.baseSpeed);
        this.particleManager.update(adjustedDt);
        this.dopamineController.update(dt);
        this.uiManager.updateFloatingTexts(adjustedDt);

        // 4. Collision resolution
        this.resolveCollisions();

        // 5. Bio-adaptation ticks
        const didTierChange = this.difficultyController.update(timestamp);
        if (didTierChange) {
            const nextTier = this.difficultyController.getCurrentTier();
            this.uiManager.setTierTheme(nextTier);
            this.uiManager.showToast(`↑ ${nextTier} MODE`, TIER_COLORS[nextTier]);
            this.soundSynth.playPowerUp();
        }

        // Track stress drop logs for Clutch Mode
        this.dopamineController.trackStress(this.difficultyController.stressIndex);

        // Increment stats scores
        this.timeSurvived += dt;
        this.score += dt * 10 * this.dopamineController.getScoreMultiplier() * currentParams.multiplier;

        // Update HUD display
        this.uiManager.updateHUD(this.score, this.dopamineController.getScoreMultiplier(), this.difficultyController.stressIndex);
        
        // Update dev debugger diagnostics
        if (DEV_MODE) {
            this.uiManager.updateDebugPanel(this.reactionTracker, this.movementAnalyzer, this.difficultyController);
        }

        // 6. Analytics logger (every 1s)
        if (timestamp - this.lastLogTime >= 1000) {
            this.lastLogTime = timestamp;
            this.sessionLog.push({
                timestamp: Math.round(this.timeSurvived),
                tier: this.difficultyController.currentTier,
                stressIndex: this.difficultyController.stressIndex,
                reactionTime: this.reactionTracker.getAverageReactionTime(),
                score: Math.round(this.score)
            });
        }

        // 7. Drawing elements
        this.draw();
    }

    resolveCollisions() {
        const enemies = this.enemyManager.enemies;
        const player = this.player;

        // Direct collisions with enemies
        for (const enemy of enemies) {
            if (!enemy.active) continue;

            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const sumR = player.radius + enemy.radius;

            if (dist < sumR) {
                // Take Damage
                enemy.active = false;
                this.damagePlayer(25); // Take 25 damage per hit
            }
        }

        // Check if player failed a warning zone detonation (still inside radius)
        const tZones = this.enemyManager.activeTelegraphs;
        const now = performance.now();
        for (const t of tZones) {
            if (!t.active) continue;
            
            const elapsed = now - t.spawnTime;
            if (elapsed >= t.duration) {
                const dx = player.x - t.x;
                const dy = player.y - t.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= t.radius) {
                    this.damagePlayer(35); // Heavy penalty damage
                }
            }
        }

        // Proximity checks for Close-Call Dopamine trigger
        this.dopamineController.checkCloseCalls(player, enemies);
    }

    damagePlayer(amount) {
        this.player.shield -= amount;
        this.difficultyController.incrementMissStreak();
        this.dopamineController.resetStreak();

        this.soundSynth.playHit();
        this.particleManager.spawn(this.player.x, this.player.y, '#ff003c', 16, 5);
        this.dopamineController.shakeIntensity = Math.max(this.dopamineController.shakeIntensity, 12);

        if (this.player.shield <= 0) {
            this.gameOver();
        }
    }

    draw() {
        this.ctx.save();
        
        // 1. Screenshake translation matrix
        if (this.dopamineController.shakeIntensity > 0) {
            const sx = (Math.random() - 0.5) * this.dopamineController.shakeIntensity;
            const sy = (Math.random() - 0.5) * this.dopamineController.shakeIntensity;
            this.ctx.translate(sx, sy);
        }

        // Clear view
        this.ctx.fillStyle = 'rgba(7, 9, 19, 0.2)'; // trail effect for movement
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw HUD grid gridlines for cyberpunk context
        this.drawBackgroundGrid();

        // 2. Render warning telegraphs & spawns
        this.enemyManager.draw(this.ctx);

        // 3. Render visual particle system
        this.particleManager.draw(this.ctx);

        // 4. Render Player
        this.drawPlayer();

        // 5. Draw floating scoreboard texts
        this.uiManager.drawFloatingTexts(this.ctx);

        this.ctx.restore();
    }

    drawBackgroundGrid() {
        const gridGap = 80;
        this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.02)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 0; x < this.width; x += gridGap) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
        }
        for (let y = 0; y < this.height; y += gridGap) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
        }
        this.ctx.stroke();
    }

    drawPlayer() {
        this.ctx.save();
        
        // Draw glow backplate
        const currentTier = this.difficultyController.getCurrentTier();
        const tierColor = TIER_COLORS[currentTier];

        // Draw Clutch Mode pulse visual ring
        if (this.dopamineController.clutchActive) {
            this.ctx.strokeStyle = 'rgba(255,0,200,0.3)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            const radiusPulse = this.player.radius + 15 + Math.sin(performance.now() * 0.015) * 5;
            this.ctx.arc(this.player.x, this.player.y, radiusPulse, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        // Radial glowing gradients
        const gradient = this.ctx.createRadialGradient(
            this.player.x, this.player.y, 2,
            this.player.x, this.player.y, this.player.radius + 8
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, this.player.color);
        gradient.addColorStop(1, 'rgba(0, 240, 255, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius + 8, 0, Math.PI * 2);
        this.ctx.fill();

        // Solid core
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius - 3, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw health/shield circular indicators
        this.ctx.strokeStyle = this.player.color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2 * (this.player.shield / 100));
        this.ctx.stroke();

        this.ctx.restore();
    }
}

// Start Game instance
window.addEventListener('load', () => {
    new Game();
});
