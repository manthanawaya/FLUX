/**
 * FLUX - UI & Analytics Chart Rendering Module
 * Manages HUD updates, game state overlays, slide-in toasts, floating text, and Canvas charts.
 */

import { TIER_COLORS, TIER_ORDER } from './ade.js';

export class UIManager {
    constructor() {
        // Cache DOM elements
        this.hud = document.getElementById('hud-container');
        this.scoreDisplay = document.getElementById('score-display');
        this.multiplierDisplay = document.getElementById('multiplier-display');
        this.tierBadge = document.getElementById('tier-badge');
        this.stressValue = document.getElementById('stress-value');
        this.stressBarFill = document.getElementById('stress-bar-fill');

        this.startScreen = document.getElementById('start-screen');
        this.deathScreen = document.getElementById('death-screen');
        this.toastContainer = document.getElementById('toast-container');
        this.debugPanel = document.getElementById('debug-panel');

        // Stats elements
        this.finalScore = document.getElementById('final-score');
        this.peakTier = document.getElementById('peak-tier');
        this.avgReaction = document.getElementById('avg-reaction');
        this.bestStreak = document.getElementById('best-streak');

        // Chart Canvas
        this.analyticsCanvas = document.getElementById('analytics-canvas');

        // Floating notifications in canvas
        this.floatingTexts = []; // { x, y, text, color, life, maxLife }
    }

    /**
     * Set CSS variables to match active tier color themes
     */
    setTierTheme(tier) {
        const color = TIER_COLORS[tier] || '#ffffff';
        document.documentElement.style.setProperty('--active-tier-color', color);
        
        this.tierBadge.className = `tier-${tier.toLowerCase()}`;
        this.tierBadge.textContent = tier;
    }

    updateHUD(score, multiplier, stressIndex) {
        // Format score with leading zeroes (e.g. 024,500)
        const formattedScore = String(Math.floor(score)).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        this.scoreDisplay.textContent = formattedScore;

        this.multiplierDisplay.textContent = `${multiplier.toFixed(1)}x`;

        // Slow-lerping stress value animation (0.05 factor)
        const currentWidth = parseFloat(this.stressBarFill.style.width) || 0;
        const targetWidth = stressIndex;
        // Apply lerp
        const lerpWidth = currentWidth + (targetWidth - currentWidth) * 0.05;
        this.stressBarFill.style.width = `${lerpWidth}%`;
        this.stressValue.textContent = `${Math.round(lerpWidth)}%`;
    }

    showStartScreen() {
        this.startScreen.classList.remove('hidden');
        this.deathScreen.classList.add('hidden');
        this.hud.classList.add('hidden');
    }

    showGameplayHUD() {
        this.startScreen.classList.add('hidden');
        this.deathScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
    }

    showDeathScreen(stats, sessionLog) {
        this.hud.classList.add('hidden');
        this.deathScreen.classList.remove('hidden');

        // Populate stats details
        this.finalScore.textContent = Math.floor(stats.score).toLocaleString();
        this.peakTier.textContent = stats.peakTier;
        this.peakTier.style.color = TIER_COLORS[stats.peakTier];
        this.avgReaction.textContent = `${Math.round(stats.avgReaction)}ms`;
        this.bestStreak.textContent = `${stats.bestStreak.toFixed(1)}x`;

        // Render Canvas Analytics
        this.renderAnalyticsChart(sessionLog);
    }

    showToast(message, color = '#ffffff') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.borderColor = color;
        toast.style.boxShadow = `0 0 15px ${color}, inset 0 0 10px ${color}`;
        toast.style.color = color;
        toast.innerHTML = `<span>${message}</span>`;
        
        this.toastContainer.appendChild(toast);
        
        // Trigger reflow for transition
        toast.offsetHeight;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    this.toastContainer.removeChild(toast);
                }
            }, 300);
        }, 1800);
    }

    /**
     * Add floating numbers on the Canvas (e.g. "+100 CLOSE!")
     */
    addFloatingText(x, y, text, color) {
        this.floatingTexts.push({
            x: x,
            y: y - 10,
            text: text,
            color: color,
            life: 800, // ms life
            maxLife: 800
        });
    }

    updateFloatingTexts(dt) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.life -= dt * 1000;
            ft.y -= 0.6 * dt * 60; // float upwards
            if (ft.life <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    drawFloatingTexts(ctx) {
        ctx.save();
        ctx.font = 'bold 12px "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        for (const ft of this.floatingTexts) {
            const alpha = Math.max(0, ft.life / ft.maxLife);
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 6;
            ctx.shadowColor = ft.color;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.restore();
    }

    /**
     * Render Biometric and difficulty timeline chart.
     * Game over screen must never crash, wrapped in try/catch bounds.
     */
    renderAnalyticsChart(sessionLog) {
        try {
            const canvas = this.analyticsCanvas;
            const ctx = canvas.getContext('2d');
            
            // Handle high-dpi sizing
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

            const w = rect.width;
            const h = rect.height;

            // Background fill
            ctx.fillStyle = '#06080e';
            ctx.fillRect(0, 0, w, h);

            if (!sessionLog || sessionLog.length < 2) {
                ctx.fillStyle = '#6b7280';
                ctx.font = '12px "Inter", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('NO TIMELINE DATA AVAILABLE', w / 2, h / 2);
                return;
            }

            const paddingLeft = 45;
            const paddingRight = 45;
            const paddingTop = 20;
            const paddingBottom = 25;
            const chartW = w - paddingLeft - paddingRight;
            const chartH = h - paddingTop - paddingBottom;

            // 1. Draw Grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                // Horizontal lines
                const y = paddingTop + (chartH * i) / 4;
                ctx.beginPath();
                ctx.moveTo(paddingLeft, y);
                ctx.lineTo(w - paddingRight, y);
                ctx.stroke();

                // Axis ticks left
                ctx.fillStyle = '#4b5563';
                ctx.font = '9px "Orbitron", sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${100 - i * 25}%`, paddingLeft - 8, y);
            }

            // Draw Tier levels on the right axis
            for (let i = 0; i < TIER_ORDER.length; i++) {
                const tier = TIER_ORDER[i];
                const y = paddingTop + chartH - (chartH * i) / (TIER_ORDER.length - 1);
                ctx.fillStyle = TIER_COLORS[tier];
                ctx.font = 'bold 8px "Orbitron", sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(tier, w - paddingRight + 8, y);
            }

            // 2. Plot lines
            const len = sessionLog.length;
            
            // Draw Stress Line (Neon blue)
            ctx.strokeStyle = '#00f0ff';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#00f0ff';
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let i = 0; i < len; i++) {
                const entry = sessionLog[i];
                const x = paddingLeft + (chartW * i) / (len - 1);
                const y = paddingTop + chartH - (chartH * entry.stressIndex) / 100;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Draw Tier Line (Shifting colors)
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5;
            for (let i = 0; i < len - 1; i++) {
                const entry = sessionLog[i];
                const nextEntry = sessionLog[i + 1];

                const tIndex = TIER_ORDER.indexOf(entry.tier);
                const nextTIndex = TIER_ORDER.indexOf(nextEntry.tier);

                const x1 = paddingLeft + (chartW * i) / (len - 1);
                const y1 = paddingTop + chartH - (chartH * tIndex) / (TIER_ORDER.length - 1);
                
                const x2 = paddingLeft + (chartW * (i + 1)) / (len - 1);
                const y2 = paddingTop + chartH - (chartH * nextTIndex) / (TIER_ORDER.length - 1);

                ctx.strokeStyle = TIER_COLORS[entry.tier];
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // Draw timeline labels
            ctx.fillStyle = '#6b7280';
            ctx.font = '8px "Orbitron", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('START', paddingLeft, paddingTop + chartH + 8);
            ctx.fillText('SURVIVAL TIME PROGRESSION', paddingLeft + chartW / 2, paddingTop + chartH + 8);
            ctx.fillText('DEATH', w - paddingRight, paddingTop + chartH + 8);

        } catch (e) {
            console.error('Error rendering analytics chart:', e);
        }
    }

    updateDebugPanel(reactionTracker, movementAnalyzer, controller) {
        if (this.debugPanel.classList.contains('hidden')) return;

        const reactionBuf = document.getElementById('debug-reaction-buf');
        const movementVar = document.getElementById('debug-movement-var');
        const hesitationRatio = document.getElementById('debug-hesitation-ratio');
        const burstRate = document.getElementById('debug-burst-rate');
        const hystBuffer = document.getElementById('debug-hyst-buffer');

        const rb = reactionTracker.buffer;
        reactionBuf.textContent = rb.length > 0 ? `[${rb.map(Math.round).join(',')}]` : '[]';
        movementVar.textContent = movementAnalyzer.getVelocityVariance().toFixed(1);
        hesitationRatio.textContent = movementAnalyzer.getHesitationRatio().toFixed(2);
        burstRate.textContent = movementAnalyzer.getInputBurstRate();
        
        hystBuffer.textContent = controller.pendingTicks > 0 
            ? `${controller.pendingTier}: ${controller.pendingTicks}/2` 
            : 'STABLE';
    }

    clear() {
        this.floatingTexts = [];
    }
}
