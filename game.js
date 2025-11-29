// /arkanoid-ga/game.js (SOLO 2 POWER-UPS)
// /arkanoid-ga/game.js (SOLO 2 POWER-UPS POR PARTIDA)
export function mulberry32(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}

export class ArkanoidConfig {
    constructor() {
        this.width = 480;
        this.height = 320;
        this.paddleWidth = 60;
        this.paddleHeight = 10;
        this.ballSize = 8;
        this.brickRows = 6;
        this.brickCols = 10;
        this.brickWidth = 40;
        this.brickHeight = 15;
        this.brickMargin = 2;
        this.maxLives = 3;
        this.horizonT = 5000;
        this.episodes = 2;
        this.powerUpSize = 12;
        this.powerUpSpeed = 2;
        this.ballSpeed = 3; // Velocidad fija
    }
}

// Solo 2 tipos de power-ups
const POWERUP_TYPES = {
    EXTEND_PADDLE: 0,
    MULTIBALL: 1
};

export class Arkanoid {
    constructor(cfg, seed) {
        this.cfg = cfg;
        this.rng = mulberry32(seed);
        this.reset();
    }

    reset(seed) {
        if (seed !== undefined) this.rng = mulberry32(seed);
        
        this.score = 0;
        this.lives = this.cfg.maxLives;
        this.done = false;
        
        // Paddle (tamaño base)
        this.paddleWidth = this.cfg.paddleWidth;
        this.paddleX = (this.cfg.width - this.paddleWidth) / 2;
        this.paddleY = this.cfg.height - 20;
        
        // Ball - velocidad fija
        this.balls = [{
            x: this.cfg.width / 2,
            y: this.paddleY - this.cfg.ballSize - 5,
            vx: (this.rng() * 2 - 1) || 1.5,
            vy: -this.cfg.ballSpeed,
            active: true
        }];
        
        // Normalizar velocidad para que sea constante
        this.normalizeBallSpeed(this.balls[0]);
        
        // Power-ups activos
        this.activePowerUps = {
            extendedPaddle: false,
            multiball: false
        };
        
        // Power-ups cayendo
        this.fallingPowerUps = [];
        
        // Contador de power-ups soltados en esta partida
        this.powerUpsDropped = 0;
        this.maxPowerUps = 2; // SOLO 2 POR PARTIDA
        
        // Bricks
        this.bricksAlive = [];
        for (let row = 0; row < this.cfg.brickRows; row++) {
            for (let col = 0; col < this.cfg.brickCols; col++) {
                this.bricksAlive.push(true);
            }
        }
        
        return this.observe();
    }

    // Función para mantener velocidad constante
    normalizeBallSpeed(ball) {
        const speed = this.cfg.ballSpeed;
        const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (currentSpeed > 0) {
            ball.vx = (ball.vx / currentSpeed) * speed;
            ball.vy = (ball.vy / currentSpeed) * speed;
        }
    }

    observe() {
        const mainBall = this.balls[0];
        const features = [
            mainBall.x / this.cfg.width,
            mainBall.y / this.cfg.height,
            mainBall.vx / 5,
            mainBall.vy / 5,
            this.paddleX / this.cfg.width,
            0.5, 0.5, 1.0
        ];

        let minDist = Infinity;
        let nearestX = 0.5;
        let nearestY = 0.5;
        
        for (let row = 0; row < this.cfg.brickRows; row++) {
            for (let col = 0; col < this.cfg.brickCols; col++) {
                const idx = row * this.cfg.brickCols + col;
                if (this.bricksAlive[idx]) {
                    const brickX = col * (this.cfg.brickWidth + this.cfg.brickMargin) + this.cfg.brickMargin;
                    const brickY = row * (this.cfg.brickHeight + this.cfg.brickMargin) + this.cfg.brickMargin + 40;
                    
                    const dist = Math.sqrt((mainBall.x - brickX)**2 + (mainBall.y - brickY)**2);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestX = brickX / this.cfg.width;
                        nearestY = brickY / this.cfg.height;
                    }
                }
            }
        }
        
        features[5] = nearestX;
        features[6] = nearestY;
        features[7] = Math.min(minDist / this.cfg.width, 1.0);
        
        return features;
    }

    createPowerUp(x, y) {
        // SOLO si no hemos alcanzado el límite de 2 power-ups
        if (this.powerUpsDropped >= this.maxPowerUps) {
            return null;
        }
        
        this.powerUpsDropped++; // Contar que soltamos uno
        
        const types = Object.values(POWERUP_TYPES);
        const type = types[Math.floor(this.rng() * types.length)];
        
        return {
            x: x + this.cfg.brickWidth / 2 - this.cfg.powerUpSize / 2,
            y: y,
            type: type,
            width: this.cfg.powerUpSize,
            height: this.cfg.powerUpSize,
            active: true
        };
    }

    applyPowerUp(type) {
        switch(type) {
            case POWERUP_TYPES.EXTEND_PADDLE:
                if (!this.activePowerUps.extendedPaddle) {
                    this.paddleWidth = this.cfg.paddleWidth * 1.5;
                    this.activePowerUps.extendedPaddle = true;
                    setTimeout(() => {
                        this.paddleWidth = this.cfg.paddleWidth;
                        this.activePowerUps.extendedPaddle = false;
                    }, 10000); // 10 segundos
                }
                break;
                
            case POWERUP_TYPES.MULTIBALL:
                if (!this.activePowerUps.multiball) {
                    this.activePowerUps.multiball = true;
                    // Crear 2 bolas adicionales (total 3)
                    for (let i = 0; i < 2; i++) {
                        const newBall = {
                            x: this.paddleX + this.paddleWidth / 2,
                            y: this.paddleY - this.cfg.ballSize - 5,
                            vx: (this.rng() * 4 - 2) || 2,
                            vy: -this.cfg.ballSpeed,
                            active: true
                        };
                        this.normalizeBallSpeed(newBall);
                        this.balls.push(newBall);
                    }
                }
                break;
        }
    }

    step(action) {
        if (this.done) return { reward: 0, done: true };

        let reward = 0;

        // Move paddle
        const paddleSpeed = 8;
        if (action === -1) this.paddleX -= paddleSpeed;
        if (action === 1) this.paddleX += paddleSpeed;
        this.paddleX = clamp(this.paddleX, 0, this.cfg.width - this.paddleWidth);

        // Mover power-ups cayendo
        this.fallingPowerUps = this.fallingPowerUps.filter(powerUp => {
            powerUp.y += this.cfg.powerUpSpeed;
            
            // Colisión con paddle
            if (powerUp.y + this.cfg.powerUpSize >= this.paddleY && 
                powerUp.y <= this.paddleY + this.cfg.paddleHeight &&
                powerUp.x + this.cfg.powerUpSize >= this.paddleX && 
                powerUp.x <= this.paddleX + this.paddleWidth) {
                this.applyPowerUp(powerUp.type);
                reward += 0.5;
                return false;
            }
            
            // Si sale de la pantalla
            if (powerUp.y > this.cfg.height) return false;
            
            return true;
        });

        // Procesar cada bola
        let activeBalls = 0;
        
        for (let ball of this.balls) {
            if (!ball.active) continue;
            
            activeBalls++;
            
            // Move ball
            ball.x += ball.vx;
            ball.y += ball.vy;

            // Ball-wall collisions
            if (ball.x <= 0 || ball.x >= this.cfg.width - this.cfg.ballSize) {
                ball.vx *= -1;
                ball.x = clamp(ball.x, 0, this.cfg.width - this.cfg.ballSize);
                this.normalizeBallSpeed(ball);
            }
            if (ball.y <= 0) {
                ball.vy *= -1;
                ball.y = 0;
                this.normalizeBallSpeed(ball);
            }

            // Ball-paddle collision
            if (ball.y + this.cfg.ballSize >= this.paddleY && 
                ball.y <= this.paddleY + this.cfg.paddleHeight &&
                ball.x + this.cfg.ballSize >= this.paddleX && 
                ball.x <= this.paddleX + this.paddleWidth) {
                
                const hitPos = (ball.x - this.paddleX) / this.paddleWidth * 2 - 1;
                ball.vx = hitPos * 3;
                ball.vy = -this.cfg.ballSpeed;
                this.normalizeBallSpeed(ball);
                ball.y = this.paddleY - this.cfg.ballSize;
                reward += 0.1;
            }

            // Ball-brick collisions
            for (let row = 0; row < this.cfg.brickRows; row++) {
                for (let col = 0; col < this.cfg.brickCols; col++) {
                    const idx = row * this.cfg.brickCols + col;
                    if (this.bricksAlive[idx]) {
                        const brickX = col * (this.cfg.brickWidth + this.cfg.brickMargin) + this.cfg.brickMargin;
                        const brickY = row * (this.cfg.brickHeight + this.cfg.brickMargin) + this.cfg.brickMargin + 40;
                        
                        if (ball.x + this.cfg.ballSize > brickX && 
                            ball.x < brickX + this.cfg.brickWidth &&
                            ball.y + this.cfg.ballSize > brickY && 
                            ball.y < brickY + this.cfg.brickHeight) {
                            
                            // Destroy brick
                            this.bricksAlive[idx] = false;
                            this.score += 10;
                            reward += 1.0;
                            
                            // SOLO soltar power-up si no hemos alcanzado el límite de 2
                            if (this.powerUpsDropped < this.maxPowerUps) {
                                const powerUp = this.createPowerUp(brickX, brickY);
                                if (powerUp) {
                                    this.fallingPowerUps.push(powerUp);
                                }
                            }
                            
                            // Determine bounce direction
                            const ballCenterX = ball.x + this.cfg.ballSize / 2;
                            const ballCenterY = ball.y + this.cfg.ballSize / 2;
                            const brickCenterX = brickX + this.cfg.brickWidth / 2;
                            const brickCenterY = brickY + this.cfg.brickHeight / 2;
                            
                            const dx = ballCenterX - brickCenterX;
                            const dy = ballCenterY - brickCenterY;
                            
                            if (Math.abs(dx) > Math.abs(dy)) {
                                ball.vx *= -1;
                            } else {
                                ball.vy *= -1;
                            }
                            this.normalizeBallSpeed(ball);
                        }
                    }
                }
            }

            // Ball lost
            if (ball.y >= this.cfg.height) {
                ball.active = false;
            }
        }

        // Si no quedan bolas activas
        if (activeBalls === 0) {
            this.lives--;
            if (this.lives <= 0) {
                this.done = true;
                reward -= 2.0;
            } else {
                // Reset solo la bola principal
                this.balls = [{
                    x: this.cfg.width / 2,
                    y: this.paddleY - this.cfg.ballSize - 5,
                    vx: (this.rng() * 2 - 1) || 1.5,
                    vy: -this.cfg.ballSpeed,
                    active: true
                }];
                this.normalizeBallSpeed(this.balls[0]);
                
                // Limpiar power-ups cayendo y resetear paleta
                this.fallingPowerUps = [];
                this.paddleWidth = this.cfg.paddleWidth;
                this.activePowerUps.extendedPaddle = false;
                // NOTA: El contador de power-ups NO se resetea - siguen siendo solo 2 por partida
                reward -= 1.0;
            }
        }

        // Check win condition
        const bricksLeft = this.bricksAlive.filter(b => b).length;
        if (bricksLeft === 0) {
            this.done = true;
            reward += 5.0;
        }

        return { reward, done: this.done };
    }

    render(ctx) {
        if (!ctx) return;
        
        // Clear canvas
        ctx.fillStyle = '#0b0c10';
        ctx.fillRect(0, 0, this.cfg.width, this.cfg.height);
        
        // Draw paddle
        ctx.fillStyle = this.activePowerUps.extendedPaddle ? '#4ecdc4' : '#e8eaf1';
        ctx.fillRect(this.paddleX, this.paddleY, this.paddleWidth, this.cfg.paddleHeight);
        
        // Draw balls
        ctx.fillStyle = '#ffffff';
        this.balls.forEach(ball => {
            if (ball.active) {
                ctx.fillRect(ball.x, ball.y, this.cfg.ballSize, this.cfg.ballSize);
            }
        });
        
        // Draw power-ups cayendo
        this.fallingPowerUps.forEach(powerUp => {
            switch(powerUp.type) {
                case POWERUP_TYPES.EXTEND_PADDLE:
                    ctx.fillStyle = '#4ecdc4';
                    break;
                case POWERUP_TYPES.MULTIBALL:
                    ctx.fillStyle = '#ffe66d';
                    break;
            }
            ctx.fillRect(powerUp.x, powerUp.y, powerUp.width, powerUp.height);
            
            ctx.fillStyle = '#000000';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(
                powerUp.type === POWERUP_TYPES.EXTEND_PADDLE ? 'E' : 'M',
                powerUp.x + powerUp.width / 2,
                powerUp.y + powerUp.height / 2 + 3
            );
        });
        
        // Draw bricks
        for (let row = 0; row < this.cfg.brickRows; row++) {
            for (let col = 0; col < this.cfg.brickCols; col++) {
                const idx = row * this.cfg.brickCols + col;
                if (this.bricksAlive[idx]) {
                    const brickX = col * (this.cfg.brickWidth + this.cfg.brickMargin) + this.cfg.brickMargin;
                    const brickY = row * (this.cfg.brickHeight + this.cfg.brickMargin) + this.cfg.brickMargin + 40;
                    
                    const hue = (row * 30) % 360;
                    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
                    ctx.fillRect(brickX, brickY, this.cfg.brickWidth, this.cfg.brickHeight);
                }
            }
        }
        
        // Draw score and lives
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${this.score}`, 10, 20);
        ctx.fillText(`Lives: ${this.lives}`, this.cfg.width - 60, 20);
        
        // Draw active power-ups y contador
        let powerUpText = '';
        if (this.activePowerUps.extendedPaddle) powerUpText += 'BIG ';
        if (this.activePowerUps.multiball) powerUpText += 'MULTI ';
        
        if (powerUpText) {
            ctx.fillText(`Power: ${powerUpText}`, 10, 35);
        }
        
        // Draw ball count
        const activeBallCount = this.balls.filter(ball => ball.active).length;
        ctx.fillText(`Balls: ${activeBallCount}`, this.cfg.width - 100, 35);
        
        // Draw power-ups restantes (nuevo)
        const powerUpsLeft = this.maxPowerUps - this.powerUpsDropped;
        ctx.fillText(`Power-ups: ${powerUpsLeft}/2`, this.cfg.width / 2 - 50, 20);
    }
}