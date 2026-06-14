/**
 * FLUX - Dopamine & Visual Juice System
 * Handles micro-rewards (close calls, streaks), custom Audio Synthesis, screen shake, particles, and Clutch Mode.
 */

// Custom synthesized sound utility using Web Audio API
export class SoundSynth {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
        }
    }

    _playTone(freq, type, duration, volume, slideTo = 0) {
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        
        // Resume if suspended (browser autoplay policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        if (slideTo > 0) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCloseCall() {
        // High soft blip
        this._playTone(880, 'sine', 0.1, 0.08, 1200);
    }

    playHit() {
        // Low explosive rumble
        this._playTone(180, 'sawtooth', 0.45, 0.25, 40);
    }

    playChime() {
        // Rising power-up chime
        this._playTone(440, 'triangle', 0.2, 0.15, 880);
    }

    playPowerUp() {
        // Futuristic chord sweep
        this._playTone(330, 'sine', 0.4, 0.12, 660);
        setTimeout(() => this._playTone(528, 'sine', 0.35, 0.1, 1056), 60);
    }

    playClutchMode() {
        // Long pitch sweep down for slow-mo
        this._playTone(600, 'sine', 0.8, 0.2, 100);
    }
}

// Particle pool object representation
class Particle {
    constructor() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.color = '#ffffff';
        this.size = 2;
        this.life = 0;
        this.maxLife = 500;
    }

    init(x, y, vx, vy, color, size, maxLife) {
        this.active = true;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = maxLife;
        this.maxLife = maxLife;
    }

    update(dt) {
        if (!this.active) return;
        this.life -= dt * 1000;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        // Apply friction
        this.vx *= 0.96;
        this.vy *= 0.96;
        this.x += this.vx * dt * 60;
        this.y += this.vy * dt * 60;
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export class ParticleManager {
    constructor(maxParticles = 600) {
        // Pre-allocate array of particles
        this.particles = Array.from({ length: maxParticles }, () => new Particle());
    }

    spawn(x, y, color, count = 10, maxSpeed = 3) {
        let spawned = 0;
        for (const p of this.particles) {
            if (p.active) continue;

            const angle = Math.random() * Math.PI * 2;
            const speed = (0.3 + Math.random() * 0.7) * maxSpeed;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const size = 2 + Math.random() * 3;
            const life = 300 + Math.random() * 500;

            p.init(x, y, vx, vy, color, size, life);
            spawned++;
            if (spawned >= count) break;
        }
    }

    update(dt) {
        for (const p of this.particles) {
            if (!p.active) continue;
            p.update(dt);
        }
    }

    draw(ctx) {
        for (const p of this.particles) {
            if (!p.active) continue;
            p.draw(ctx);
        }
    }

    clear() {
        for (const p of this.particles) {
            p.active = false;
        }
    }
}

/**
 * Handles close calls, multipliers, and Clutch Mode trigger checks
 */
export class DopamineController {
    constructor(soundSynth, particleManager) {
        this.synth = soundSynth;
        this.particles = particleManager;

        // Close Calls
        this.closeCallThreshold = 15; // 15px radius boundary
        this.closeCallCooldown = 250; // ms cooldown per close call text
        this.lastCloseCallTimes = new Map(); // tracks enemy -> timestamp

        // Multipliers
        this.dodgeStreak = 0;
        this.multiplier = 1.0;

        // Clutch mode variables
        this.clutchActive = false;
        this.clutchTimer = 0;
        this.clutchDuration = 3000; // 3 seconds slowdown
        this.stressHistory = []; // rolling queue of { time, stress }
        
        // Screenshake
        this.shakeIntensity = 0;
    }

    /**
     * Checks distance between player and active enemies for close call events.
     * Trigger parameters: player sphere boundary and enemy sphere boundary distance.
     */
    checkCloseCalls(player, enemies) {
        const now = performance.now();
        let closeCallOccurred = false;

        for (const enemy of enemies) {
            if (!enemy.active) continue;

            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Core collision checks (player touches enemy)
            const sumRadius = player.radius + enemy.radius;

            // Close call is defined as passing outside collision, but within 15px boundary limit
            if (distance > sumRadius && distance <= sumRadius + this.closeCallThreshold) {
                const lastTime = this.lastCloseCallTimes.get(enemy) || 0;
                
                if (now - lastTime > this.closeCallCooldown) {
                    this.lastCloseCallTimes.set(enemy, now);
                    this.triggerCloseCall(enemy.x, enemy.y, enemy.color);
                    closeCallOccurred = true;
                }
            }
        }

        return closeCallOccurred;
    }

    triggerCloseCall(ex, ey, color) {
        this.synth.playCloseCall();
        this.particles.spawn(ex, ey, color, 8, 4);
        
        // Micro screen shake
        this.shakeIntensity = Math.max(this.shakeIntensity, 6);
        
        // Multiplier streak bonus
        this.incrementStreak();
        
        // Create custom custom-floating-text event for game overlay
        const event = new CustomEvent('closecall', { detail: { x: ex, y: ey } });
        window.dispatchEvent(event);
    }

    incrementStreak() {
        this.dodgeStreak++;
        if (this.dodgeStreak % 5 === 0) {
            // Level up multiplier every 5 dodges
            this.multiplier = Math.min(5.0, this.multiplier + 0.5);
            this.synth.playChime();
            
            const event = new CustomEvent('multiplierup', { detail: { mult: this.multiplier } });
            window.dispatchEvent(event);
        }
    }

    resetStreak() {
        if (this.multiplier > 1.0) {
            this.multiplier = 1.0;
            this.dodgeStreak = 0;
        }
    }

    /**
     * Tracks history of StressIndex to evaluate Clutch Mode trigger.
     * Triggered if StressIndex drops from >80 to <50 within 10 seconds.
     */
    trackStress(stressIndex) {
        const now = performance.now();
        this.stressHistory.push({ time: now, stress: stressIndex });

        // Clean values older than 10 seconds
        const tenSecondsAgo = now - 10000;
        this.stressHistory = this.stressHistory.filter(h => h.time >= tenSecondsAgo);

        if (this.clutchActive) return;

        // Scan history: check if there is an item in the queue with stress > 80, 
        // and current stress is < 50
        if (stressIndex < 50) {
            const hasHighStress = this.stressHistory.some(h => h.stress > 80);
            if (hasHighStress) {
                this.triggerClutchMode();
            }
        }
    }

    triggerClutchMode() {
        this.clutchActive = true;
        this.clutchTimer = this.clutchDuration;
        this.synth.playClutchMode();
        this.shakeIntensity = Math.max(this.shakeIntensity, 15);
        this.stressHistory = []; // Reset history to avoid double triggers

        const event = new CustomEvent('clutchmode', { detail: { active: true } });
        window.dispatchEvent(event);
    }

    update(dt) {
        // Update screen shake decay
        if (this.shakeIntensity > 0) {
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.2) this.shakeIntensity = 0;
        }

        // Update clutch slow-mo timer
        if (this.clutchActive) {
            this.clutchTimer -= dt * 1000;
            if (this.clutchTimer <= 0) {
                this.clutchActive = false;
                const event = new CustomEvent('clutchmode', { detail: { active: false } });
                window.dispatchEvent(event);
            }
        }
    }

    getSpeedMultiplier() {
        return this.clutchActive ? 0.5 : 1.0;
    }

    getScoreMultiplier() {
        // Clutch Mode gives double multiplier score gains
        return this.multiplier * (this.clutchActive ? 2.0 : 1.0);
    }

    clear() {
        this.lastCloseCallTimes.clear();
        this.dodgeStreak = 0;
        this.multiplier = 1.0;
        this.clutchActive = false;
        this.clutchTimer = 0;
        this.stressHistory = [];
        this.shakeIntensity = 0;
    }
}
