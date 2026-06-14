/**
 * FLUX - Enemy & Telegraph System
 * Handles enemy behaviors, movement math, warning indicators, and zero-allocation object pooling.
 */

export const ENEMY_TYPES = {
    STRAIGHT: 'straight',
    SINE: 'sine',
    HOMING: 'homing',
    BURST: 'burst'
};

class Enemy {
    constructor() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.radius = 12;
        this.type = ENEMY_TYPES.STRAIGHT;
        
        // Physics
        this.vx = 0;
        this.vy = 0;
        this.speed = 2;
        this.angle = 0;
        
        // Pattern math parameters
        this.spawnTime = 0;
        this.startX = 0;
        this.startY = 0;
        this.baseAngle = 0;
        
        // Homing/Burst State
        this.stateTimer = 0;
        this.burstState = 'wait'; // 'wait' or 'dash'
        
        // Visual
        this.color = '#ffffff';
        this.pulseTime = 0;
    }

    /**
     * Initializes or recycles an enemy
     */
    init(x, y, targetX, targetY, type, speed, color) {
        this.active = true;
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.type = type;
        this.speed = speed;
        this.color = color;
        
        this.spawnTime = performance.now();
        this.stateTimer = 0;
        this.burstState = 'wait';
        this.radius = type === ENEMY_TYPES.HOMING ? 14 : 10;
        
        const dx = targetX - x;
        const dy = targetY - y;
        this.angle = Math.atan2(dy, dx);
        this.baseAngle = this.angle;
        
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.pulseTime = Math.random() * 100;
    }

    /**
     * Updates positions based on type and difficulty tier
     */
    update(dt, px, py, targetSpeed) {
        if (!this.active) return;
        this.pulseTime += 0.05;

        // Smooth speed interpolation to prevent jarring teleport speed changes
        this.speed = this.speed * 0.95 + targetSpeed * 0.05;

        const timeElapsed = (performance.now() - this.spawnTime) / 1000;

        switch (this.type) {
            case ENEMY_TYPES.STRAIGHT: {
                this.x += this.vx * dt * 60;
                this.y += this.vy * dt * 60;
                break;
            }
            case ENEMY_TYPES.SINE: {
                // Travels along baseAngle, oscillates perpendicularly
                const d = this.speed * timeElapsed * 60;
                const offset = 45 * Math.sin(timeElapsed * 6.0); // Amplitude and Frequency
                this.x = this.startX + d * Math.cos(this.baseAngle) - offset * Math.sin(this.baseAngle);
                this.y = this.startY + d * Math.sin(this.baseAngle) + offset * Math.cos(this.baseAngle);
                break;
            }
            case ENEMY_TYPES.HOMING: {
                // Gradually turn towards player
                const targetAngle = Math.atan2(py - this.y, px - this.x);
                let diff = targetAngle - this.angle;
                
                // Wrap angle difference
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                
                // Steer speed (approx. 2 degrees per frame max)
                const steerLimit = 0.035; 
                this.angle += Math.max(-steerLimit, Math.min(steerLimit, diff));
                
                this.x += Math.cos(this.angle) * this.speed * dt * 60;
                this.y += Math.sin(this.angle) * this.speed * dt * 60;
                break;
            }
            case ENEMY_TYPES.BURST: {
                this.stateTimer += dt * 1000;
                
                if (this.burstState === 'wait') {
                    // Slow drift & aim
                    const targetAngle = Math.atan2(py - this.y, px - this.x);
                    this.angle = this.angle * 0.9 + targetAngle * 0.1;
                    
                    this.x += Math.cos(this.angle) * (this.speed * 0.2) * dt * 60;
                    this.y += Math.sin(this.angle) * (this.speed * 0.2) * dt * 60;
                    
                    if (this.stateTimer >= 800) {
                        this.burstState = 'dash';
                        this.stateTimer = 0;
                    }
                } else if (this.burstState === 'dash') {
                    // Fast rush
                    this.x += Math.cos(this.angle) * (this.speed * 2.4) * dt * 60;
                    this.y += Math.sin(this.angle) * (this.speed * 2.4) * dt * 60;
                    
                    if (this.stateTimer >= 450) {
                        this.burstState = 'wait';
                        this.stateTimer = 0;
                    }
                }
                break;
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;

        // Draw glowing inner core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius - 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw colored outer shell (pulsing size slightly)
        const pulseRadius = this.radius + Math.sin(this.pulseTime) * 1.5;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Specific pattern visuals
        if (this.type === ENEMY_TYPES.BURST && this.burstState === 'dash') {
            // Dash trailing line
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - Math.cos(this.angle) * 25, this.y - Math.sin(this.angle) * 25);
            ctx.stroke();
        }

        ctx.restore();
    }
}

/**
 * Manages pooling and allocation of enemies.
 */
export class EnemyManager {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        
        // Zero-allocation pre-allocated arrays
        this.maxEnemies = 150;
        this.enemies = Array.from({ length: this.maxEnemies }, () => new Enemy());
        
        this.maxTelegraphs = 20;
        this.activeTelegraphs = Array.from({ length: this.maxTelegraphs }, () => ({
            active: false,
            x: 0,
            y: 0,
            radius: 80,
            duration: 0,
            spawnTime: 0,
            alpha: 0
        }));
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
    }

    /**
     * Spawns an enemy around the border
     */
    spawnEnemy(playerX, playerY, tierParams, color) {
        // Find first inactive enemy
        const enemy = this.enemies.find(e => !e.active);
        if (!enemy) return null; // Buffer full, skip spawn to prevent memory leak/crash

        // Pick side (0: top, 1: right, 2: bottom, 3: left)
        const side = Math.floor(Math.random() * 4);
        let x = 0;
        let y = 0;
        const padding = 20;

        if (side === 0) { // top
            x = Math.random() * this.width;
            y = -padding;
        } else if (side === 1) { // right
            x = this.width + padding;
            y = Math.random() * this.height;
        } else if (side === 2) { // bottom
            x = Math.random() * this.width;
            y = this.height + padding;
        } else { // left
            x = -padding;
            y = Math.random() * this.height;
        }

        // Determine pattern based on tier percentages
        const mix = tierParams.patternMix;
        const rand = Math.random();
        let type = ENEMY_TYPES.STRAIGHT;

        if (rand < mix.straight) {
            type = ENEMY_TYPES.STRAIGHT;
        } else if (rand < mix.straight + mix.sine) {
            type = ENEMY_TYPES.SINE;
        } else if (rand < mix.straight + mix.sine + mix.homing) {
            type = ENEMY_TYPES.HOMING;
        } else {
            type = ENEMY_TYPES.BURST;
        }
        
        enemy.init(x, y, playerX, playerY, type, tierParams.baseSpeed, color);
        return enemy;
    }

    /**
     * Spawns a reaction test telegraph zone centered at player
     */
    spawnTelegraph(playerX, playerY, duration) {
        const t = this.activeTelegraphs.find(item => !item.active);
        if (!t) return null; // Buffer full

        t.active = true;
        t.x = playerX;
        t.y = playerY;
        t.radius = 80;
        t.duration = duration;
        t.spawnTime = performance.now();
        t.alpha = 0.1;
        
        return t;
    }

    update(dt, px, py, targetSpeed) {
        // Update active enemies
        const margin = 100;
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            enemy.update(dt, px, py, targetSpeed);

            // Boundary cleanup (set active to false instead of splicing)
            if (enemy.x < -margin || enemy.x > this.width + margin ||
                enemy.y < -margin || enemy.y > this.height + margin) {
                enemy.active = false;
            }
        }

        // Update active telegraph warning zones
        const now = performance.now();
        for (const t of this.activeTelegraphs) {
            if (!t.active) continue;
            
            const elapsed = now - t.spawnTime;
            // Pulse opacity
            t.alpha = 0.15 + 0.25 * Math.sin(elapsed * 0.015);
            
            if (elapsed >= t.duration) {
                t.active = false;
            }
        }
    }

    draw(ctx) {
        // Render warning telegraph areas first (underneath enemies)
        for (const t of this.activeTelegraphs) {
            if (!t.active) continue;
            
            ctx.save();
            ctx.strokeStyle = `rgba(255, 0, 85, ${t.alpha + 0.3})`;
            ctx.fillStyle = `rgba(255, 0, 85, ${t.alpha * 0.4})`;
            ctx.lineWidth = 2;
            
            // Detonation warning progress rings
            const elapsed = performance.now() - t.spawnTime;
            const progressRatio = Math.max(0, Math.min(1, elapsed / t.duration));
            const progressRadius = t.radius * (1 - progressRatio);

            // Red warning area
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Detonation closing boundary ring
            ctx.strokeStyle = `rgba(255, 0, 85, 0.8)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(t.x, t.y, progressRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }

        // Render enemies
        for (const enemy of this.enemies) {
            if (!enemy.active) continue;
            enemy.draw(ctx);
        }
    }

    /**
     * Cleanups all active list containers
     */
    clearAll() {
        for (const enemy of this.enemies) {
            enemy.active = false;
        }
        for (const t of this.activeTelegraphs) {
            t.active = false;
        }
    }
}
