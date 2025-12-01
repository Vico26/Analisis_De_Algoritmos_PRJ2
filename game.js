export function mulberry32(seed) {// Generador de números aleatorios
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
    EXTEND_PADDLE: 0, // Extiende la paleta
    MULTIBALL: 1// Crea 2 bolas adicionales
};

export class Arkanoid { // Juego principal
    constructor(config, seed) {
        this.config = config;
        this.rng = mulberry32(seed);
        this.reset();
    }

    reset(seed) {// Reinicia el juego
        if (seed !== undefined) this.rng = mulberry32(seed);
        
        this.score = 0;
        this.lives = this.config.maxLives;
        this.done = false;
        
        // Paddle (tamaño base)
        this.paddleWidth = this.config.paddleWidth;
        this.paddleX = (this.config.width - this.paddleWidth) / 2;
        this.paddleY = this.config.height - 20;
        
        // Ball - velocidad fija
        this.balls = [{
            x: this.config.width / 2,
            y: this.paddleY - this.config.ballSize - 5,
            vx: (this.rng() * 2 - 1) || 1.5,
            vy: -this.config.ballSpeed,
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
        for (let row = 0; row < this.config.brickRows; row++) {
            for (let col = 0; col < this.config.brickCols; col++) {
                this.bricksAlive.push(true);
            }
        }
        
        return this.observe();
    }

    // Función para mantener velocidad constante
    normalizeBallSpeed(ball) {
        const speed = this.config.ballSpeed;
        const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (currentSpeed > 0) {
            ball.vx = (ball.vx / currentSpeed) * speed; // Ajustar velocidad
            ball.vy = (ball.vy / currentSpeed) * speed; 
        }
    }

    observe() {// Extrae las características del estado actual
        const mainBall = this.balls[0];
        const features = [
            mainBall.x / this.config.width,
            mainBall.y / this.config.height,
            mainBall.vx / 5,
            mainBall.vy / 5,
            this.paddleX / this.config.width,
            0.5, 0.5, 1.0
        ];

        let minDist = Infinity;
        let nearestX = 0.5;
        let nearestY = 0.5;
        
        for (let row = 0; row < this.config.brickRows; row++) {// Buscar el ladrillo más cercano
            for (let col = 0; col < this.config.brickCols; col++) {
                const idx = row * this.config.brickCols + col;
                if (this.bricksAlive[idx]) {
                    const brickX = col * (this.config.brickWidth + this.config.brickMargin) + this.config.brickMargin;
                    const brickY = row * (this.config.brickHeight + this.config.brickMargin) + this.config.brickMargin + 40;
                    
                    const dist = Math.sqrt((mainBall.x - brickX)**2 + (mainBall.y - brickY)**2);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestX = brickX / this.config.width;
                        nearestY = brickY / this.config.height;
                    }
                }
            }
        }
        
        features[5] = nearestX;
        features[6] = nearestY;
        features[7] = Math.min(minDist / this.config.width, 1.0);
        
        return features;
    }

    createPowerUp(x, y) {// Crea un power-up en la posición dada
        // SOLO si no hemos alcanzado el límite de 2 power-ups
        if (this.powerUpsDropped >= this.maxPowerUps) {
            return null;
        }
        
        this.powerUpsDropped++; // Contar que soltamos uno
        
        const types = Object.values(POWERUP_TYPES);
        const type = types[Math.floor(this.rng() * types.length)];
        
        return {
            x: x + this.config.brickWidth / 2 - this.config.powerUpSize / 2,
            y: y,
            type: type,
            width: this.config.powerUpSize,
            height: this.config.powerUpSize,
            active: true
        };
    }

    applyPowerUp(type) {// Aplica el efecto del power-up recogido
        switch(type) {
            case POWERUP_TYPES.EXTEND_PADDLE:
                if (!this.activePowerUps.extendedPaddle) {
                    this.paddleWidth = this.config.paddleWidth * 1.5;
                    this.activePowerUps.extendedPaddle = true;
                    setTimeout(() => {
                        this.paddleWidth = this.config.paddleWidth;
                        this.activePowerUps.extendedPaddle = false;
                    }, 10000); // 10 segundos
                }
                break;
                
            case POWERUP_TYPES.MULTIBALL:// Crea 2 bolas adicionales> es decir, el POWER-UP
                if (!this.activePowerUps.multiball) {
                    this.activePowerUps.multiball = true;
                    // Crear 2 bolas adicionales (total 3)
                    for (let i = 0; i < 2; i++) {// SOLO 2 bolas adicionales
                        const newBall = {
                            x: this.paddleX + this.paddleWidth / 2,
                            y: this.paddleY - this.config.ballSize - 5,
                            vx: (this.rng() * 4 - 2) || 2,
                            vy: -this.config.ballSpeed, // Velocidad fija
                            active: true
                        };
                        this.normalizeBallSpeed(newBall);
                        this.balls.push(newBall);
                    }
                }
                break;
        }
    }

    step(action) {// Realiza un paso del juego con la acción dada
        if (this.done) return { reward: 0, done: true };

        let reward = 0;

        // Move paddle
        const paddleSpeed = 8;
        if (action === -1) 
            this.paddleX -= paddleSpeed;

        if (action === 1) 
            this.paddleX += paddleSpeed;

        this.paddleX = clamp(this.paddleX, 0, this.config.width - this.paddleWidth);

        // Mover power-ups cayendo
        this.fallingPowerUps = this.fallingPowerUps.filter(powerUp => {
            powerUp.y += this.config.powerUpSpeed;
            
            // Colisión con paddle
            if (powerUp.y + this.config.powerUpSize >= this.paddleY && 

                powerUp.y <= this.paddleY + this.config.paddleHeight &&

                powerUp.x + this.config.powerUpSize >= this.paddleX && 

                powerUp.x <= this.paddleX + this.paddleWidth) {

                this.applyPowerUp(powerUp.type);
                reward += 0.5;
                return false;
            }
            
            // Si sale de la pantalla
            if (powerUp.y > this.config.height) return false;
            
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
            if (ball.x <= 0 || ball.x >= this.config.width - this.config.ballSize) {

                ball.vx *= -1;

                ball.x = clamp(ball.x, 0, this.config.width - this.config.ballSize);

                this.normalizeBallSpeed(ball);
            }
            if (ball.y <= 0) {

                ball.vy *= -1;

                ball.y = 0;

                this.normalizeBallSpeed(ball);
            }

            // Ball-paddle collision
            if (ball.y + this.config.ballSize >= this.paddleY && 

                ball.y <= this.paddleY + this.config.paddleHeight &&

                ball.x + this.config.ballSize >= this.paddleX && 

                ball.x <= this.paddleX + this.paddleWidth) {// Colisión con la paleta
                
                const hitPos = (ball.x - this.paddleX) / this.paddleWidth * 2 - 1;
                ball.vx = hitPos * 3;
                ball.vy = -this.config.ballSpeed;
                this.normalizeBallSpeed(ball);
                ball.y = this.paddleY - this.config.ballSize;
                reward += 0.1;
            }

            // Ball-brick collisions
            for (let row = 0; row < this.config.brickRows; row++) {
                for (let col = 0; col < this.config.brickCols; col++) {
                    const idx = row * this.config.brickCols + col;
                    if (this.bricksAlive[idx]) {

                        const brickX = col * (this.config.brickWidth + this.config.brickMargin) + this.config.brickMargin;
                        const brickY = row * (this.config.brickHeight + this.config.brickMargin) + this.config.brickMargin + 40;
                        
                        if (ball.x + this.config.ballSize > brickX &&// Colisión con ladrillo

                            ball.x < brickX + this.config.brickWidth &&

                            ball.y + this.config.ballSize > brickY && 

                            ball.y < brickY + this.config.brickHeight) {
                            
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
                            const ballCenterX = ball.x + this.config.ballSize / 2;

                            const ballCenterY = ball.y + this.config.ballSize / 2;

                            const brickCenterX = brickX + this.config.brickWidth / 2;

                            const brickCenterY = brickY + this.config.brickHeight / 2;

                            
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

            // Ball out of bounds(se salio de limites xd)
            if (ball.y >= this.config.height) {
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
                    x: this.config.width / 2,
                    y: this.paddleY - this.config.ballSize - 5,
                    vx: (this.rng() * 2 - 1) || 1.5,
                    vy: -this.config.ballSpeed,
                    active: true
                }];
                this.normalizeBallSpeed(this.balls[0]);
                
                // Limpiar power-ups cayendo y resetear paleta
                this.fallingPowerUps = [];
                this.paddleWidth = this.config.paddleWidth;
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

    render(ctx) {// Dibuja el estado actual del juego en el contexto dado
        if (!ctx) return;
        
        // Clear canvas
        ctx.fillStyle = '#0b0c10';
        ctx.fillRect(0, 0, this.config.width, this.config.height);
        
        // Draw paddle
        ctx.fillStyle = this.activePowerUps.extendedPaddle ? '#4ecdc4' : '#e8eaf1';
        ctx.fillRect(this.paddleX, this.paddleY, this.paddleWidth, this.config.paddleHeight);
        
        // Draw balls
        ctx.fillStyle = '#ffffff';
        this.balls.forEach(ball => {
            if (ball.active) {
                ctx.fillRect(ball.x, ball.y, this.config.ballSize, this.config.ballSize);
            }
        });
        
        // Draw power-ups cayendo
        this.fallingPowerUps.forEach(powerUp => {

            switch(powerUp.type) {// Diferenciar tipos de power-ups
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
        for (let row = 0; row < this.config.brickRows; row++) {
            for (let col = 0; col < this.config.brickCols; col++) {
                const idx = row * this.config.brickCols + col;
                if (this.bricksAlive[idx]) {
                    const brickX = col * (this.config.brickWidth + this.config.brickMargin) + this.config.brickMargin;
                    
                    const brickY = row * (this.config.brickHeight + this.config.brickMargin) + this.config.brickMargin + 40;
                    
                    const hue = (row * 30) % 360;
                    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
                    ctx.fillRect(brickX, brickY, this.config.brickWidth, this.config.brickHeight);
                }
            }
        }
        
        // Draw score and lives
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';

        ctx.fillText(`Score: ${this.score}`, 10, 20);
        ctx.fillText(`Lives: ${this.lives}`, this.config.width - 60, 20);
        
        // Draw active power-ups y contador
        let powerUpText = '';
        if (this.activePowerUps.extendedPaddle) 
            powerUpText += 'BIG ';

        if (this.activePowerUps.multiball) 
            powerUpText += 'MULTI ';
        
        if (powerUpText) {
            ctx.fillText(`Power: ${powerUpText}`, 10, 35);
        }
        
        // Draw ball count
        const activeBallCount = this.balls.filter(ball => ball.active).length;

        ctx.fillText(`Balls: ${activeBallCount}`, this.config.width - 100, 35);// Contador de bolas activas
        
        // Draw power-ups restantes (nuevo)
        const powerUpsLeft = this.maxPowerUps - this.powerUpsDropped;
        ctx.fillText(`Power-ups: ${powerUpsLeft}/2`, this.config.width / 2 - 50, 20);
    }
}