// File: twoplayer.js

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    // UI Elements (from twoplayer.html)
    const p1ScoreSpan = document.getElementById('p1-current-score');
    const p2ScoreSpan = document.getElementById('p2-current-score');
    const survivalTimeSpan = document.getElementById('current-survival-time'); // Still using this ID for the match timer display during game
    const messageElement = document.getElementById('message-area');
    const gameResultArea = document.getElementById('game-result-area');
    const startButton = document.getElementById('start-button');


    // Game State Variables (Two Player)
    let players = []; // Array of player objects { ..., alive: true/false, timeOfDeath: null, ... }
    let food;
    let speed = 120;
    let gameLoopTimeout;
    let isGameRunning = false;
    let gameStartTime = null;
    let currentMatchTime = 0; // Renamed from currentSurvivalTime to be less confusing


    // --- Initialization ---
    function initTwoPlayer() {
        console.log("Two player game initializing...");

        players = [];
        players.push({ // Player 1 (WASD)
            snake: [{ x: Math.floor(GRID_WIDTH / 4), y: Math.floor(GRID_HEIGHT / 2) }],
            score: 0,
            direction: 'right',
            nextDirection: 'right',
            alive: true,
            color: '#0000FF', // Blue
            name: '玩家一',
            startTime: null,
            survivalTime: 0, // Individual survival time
            timeOfDeath: null // New property to record death time
        });
        players.push({ // Player 2 (Arrows)
            snake: [{ x: Math.floor(GRID_WIDTH * 3 / 4), y: Math.floor(GRID_HEIGHT / 2) }],
            score: 0,
            direction: 'left',
            nextDirection: 'left',
            alive: true,
            color: '#FF0000', // Red
            name: '玩家二',
            startTime: null,
            survivalTime: 0, // Individual survival time
            timeOfDeath: null // New property
        });

        food = null;
        isGameRunning = false;
        gameStartTime = null;
        currentMatchTime = 0; // Reset match timer

        updateScoreDisplays();
        updateMatchTimeDisplay(); // Update display function name
        messageElement.textContent = '';
        gameResultArea.textContent = '';
        startButton.textContent = '开始游戏';
        startButton.disabled = false;

        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        draw();

        console.log("Two player game initialized.");
    }

    // --- Food Generation (Two Player) ---
    function generateFood() {
        let newFoodPosition;
        let isCollidingWithAnySnake;
        do {
            newFoodPosition = {
                x: Math.floor(Math.random() * GRID_WIDTH),
                y: Math.floor(Math.random() * GRID_HEIGHT)
            };
            isCollidingWithAnySnake = players.some(p =>
                isPositionOnSnake(newFoodPosition, p.snake) // Use common isPositionOnSnake
            );
        } while (isCollidingWithAnySnake);
        food = newFoodPosition;
        console.log("Food generated at:", food);
    }


    // --- Game Loop ---
    function gameLoop() {
        if (!isGameRunning) {
            return;
        }

        // Update match time display
        if (gameStartTime) {
            currentMatchTime = Math.floor((Date.now() - gameStartTime) / 1000);
            updateMatchTimeDisplay(); // Update display function name
        }

        gameLoopTimeout = setTimeout(() => {
            update();
            draw();

            const anyAlive = players.some(player => player.alive);
            if (anyAlive && isGameRunning) {
                gameLoop();
            } else if (isGameRunning) { // All players just died
                gameOver();
            }

        }, speed);
    }

    // --- Update Game State ---
    function update() {
        const nextPositions = players.map(player => {
            if (!player.alive) return null;

            const nextHead = { ...player.snake[0] };
            const direction = player.nextDirection;
            switch (direction) {
                case 'up': nextHead.y -= 1; break;
                case 'down': nextHead.y += 1; break;
                case 'left': nextHead.x -= 1; break;
                case 'right': nextHead.x += 1; break;
            }
            return nextHead;
        });

        const playersDyingThisFrame = new Array(players.length).fill(false);

        players.forEach((player, pIndex) => {
            if (!player.alive) return;

            const nextHead = nextPositions[pIndex];

            if (checkWallCollision(nextHead) || checkSelfCollision(nextHead, player.snake)) { // Use common helpers
                console.log(`${player.name} collided with wall or self.`);
                playersDyingThisFrame[pIndex] = true;
            }

            players.forEach((otherPlayer, otherPIndex) => {
                if (pIndex === otherPIndex || !otherPlayer.alive) return;

                const otherNextHead = nextPositions[otherPIndex];

                // Check head-to-head collision (using potential next positions)
                if (!playersDyingThisFrame[pIndex] && !playersDyingThisFrame[otherPIndex] &&
                    nextHead.x === otherNextHead.x && nextHead.y === otherNextHead.y) {
                    console.log(`${player.name} and ${otherPlayer.name} had head-to-head collision.`);
                    playersDyingThisFrame[pIndex] = true;
                    playersDyingThisFrame[otherPIndex] = true;
                }

                // Check current player's *potential* next head vs other player's *current* body
                // Excluding the other player's current head (index 0) to avoid double-counting head-to-head
                if (!playersDyingThisFrame[pIndex] && isPositionOnSnake(nextHead, otherPlayer.snake.slice(1))) {
                    console.log(`${player.name}'s head collided with ${otherPlayer.name}'s body.`);
                    playersDyingThisFrame[pIndex] = true;
                }
            });
        });


        let foodEatenThisFrame = false;

        players.forEach((player, pIndex) => {
            if (!player.alive) return;

            if (playersDyingThisFrame[pIndex]) {
                player.alive = false;
                player.timeOfDeath = Date.now(); // Record the time of death
                console.log(`${player.name} died at time: ${player.timeOfDeath}`);
                return;
            }

            player.direction = player.nextDirection;
            const nextHead = nextPositions[pIndex];

            if (food && nextHead.x === food.x && nextHead.y === food.y) {
                player.score++;
                foodEatenThisFrame = true;
            } else {
                player.snake.pop();
            }

            player.snake.unshift(nextHead);
        });

        if (foodEatenThisFrame) {
            generateFood(); // Use two player generateFood
        }

        updateScoreDisplays();
    }


    // --- Drawing ---
    function draw() {
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        if (food) {
            drawRect(ctx, food.x, food.y, 'lightgreen'); // Use common drawRect
        }

        players.forEach(player => {
            player.snake.forEach((segment, index) => {
                const color = (index === 0) ? darkenColor(player.color, 20) : player.color; // Use common darkenColor
                drawRect(ctx, segment.x, segment.y, player.alive ? color : '#888888'); // Use common drawRect
            });
        });
    }

    function updateScoreDisplays() {
        if (p1ScoreSpan) p1ScoreSpan.textContent = players[0]?.score ?? 0;
        if (p2ScoreSpan) p2ScoreSpan.textContent = players[1]?.score ?? 0;
    }

    // Update function name for clarity
    function updateMatchTimeDisplay() {
        if (survivalTimeSpan) survivalTimeSpan.textContent = currentMatchTime;
    }


    // --- Helper Functions ---
    // isPositionOnSnake, checkWallCollision, checkSelfCollision, drawRect, darkenColor, escapeHTML are in common.js
    // generateFood is defined in this file


    // --- Game State Control ---
    function startGame() {
        if (isGameRunning) return;

        console.log("Starting two player game...");

        initTwoPlayer(); // Re-initialize state

        isGameRunning = true;
        gameStartTime = Date.now();
        currentMatchTime = 0; // Reset match timer
        messageElement.textContent = '';
        gameResultArea.textContent = '';
        startButton.textContent = '进行中...';
        startButton.disabled = true;

        generateFood();

        gameLoop();
    }

    function gameOver() {
        if (!isGameRunning) return;

        console.log("Two player Game Over!");
        isGameRunning = false;
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        // Calculate individual survival times
        const gameEndTime = Date.now(); // Record the exact end time of the match
        players.forEach(player => {
            if (player.alive) {
                // If player survived until the end of the match
                player.survivalTime = Math.floor((gameEndTime - gameStartTime) / 1000);
            } else {
                // If player died before the end of the match
                if (player.timeOfDeath !== null) {
                    player.survivalTime = Math.floor((player.timeOfDeath - gameStartTime) / 1000);
                } else {
                    // Fallback, should not happen if timeOfDeath is set correctly
                    player.survivalTime = 0;
                }
            }
        });


        messageElement.textContent = `游戏结束!`;
        startButton.disabled = false;
        startButton.textContent = '重新开始';

        let resultText = `<h3>对战结果</h3>`;
        const p1 = players.find(p => p.name === '玩家一');
        const p2 = players.find(p => p.name === '玩家二');

        // Display individual survival times
        if (p1) resultText += `<p><strong>${escapeHTML(p1.name)}</strong> (${p1.color === '#0000FF' ? '蓝色' : '红色'}): 得分 ${p1.score}, 游戏时长 ${p1.survivalTime}s ${p1.alive ? '(幸存)' : '(死亡)'}</p>`;
        if (p2) resultText += `<p><strong>${escapeHTML(p2.name)}</strong> (${p2.color === '#FF0000' ? '红色' : '蓝色'}): 得分 ${p2.score}, 游戏时长 ${p2.survivalTime}s ${p2.alive ? '(幸存)' : '(死亡)'}</p>`;


        if (p1 && p2) {
            if (p1.score > p2.score) {
                resultText += `<p><strong>${escapeHTML(p1.name)}</strong> 获胜!</p>`;
            } else if (p2.score > p1.score) {
                resultText += `<p><strong>${escapeHTML(p2.name)}</strong> 获胜!</p>`;
            } else {
                if (p1.survivalTime > p2.survivalTime) {
                    resultText += `<p><strong>${escapeHTML(p1.name)}</strong> 获胜 (游戏时长更长)!</p>`;
                } else if (p2.survivalTime > p1.survivalTime) {
                    resultText += `<p><strong>${escapeHTML(p2.name)}</strong> 获胜 (游戏时长更长)!</p>`;
                } else {
                    resultText += `<p>平局!</p>`;
                }
            }
        }

        gameResultArea.innerHTML = resultText;
    }

    // --- Event Listeners ---
    if (startButton) startButton.addEventListener('click', startGame);

    document.addEventListener('keydown', handleKeyDownTwoPlayer);

    function handleKeyDownTwoPlayer(e) {
        if (!isGameRunning && e.key === ' ') {
            e.preventDefault();
            startGame();
            return;
        }

        if (!isGameRunning) return;


        let requestedDirection = null;
        let playerIndex = -1;

        // Player 1 (WASD)
        switch (e.key.toLowerCase()) {
            case 'w': playerIndex = 0; requestedDirection = 'up'; break;
            case 's': playerIndex = 0; requestedDirection = 'down'; break;
            case 'a': playerIndex = 0; requestedDirection = 'left'; break;
            case 'd': playerIndex = 0; requestedDirection = 'right'; break;
        }
        // Player 2 (Arrows)
        switch (e.key) {
            case 'ArrowUp': playerIndex = 1; requestedDirection = 'up'; break;
            case 'ArrowDown': playerIndex = 1; requestedDirection = 'down'; break;
            case 'ArrowLeft': playerIndex = 1; requestedDirection = 'left'; break;
            case 'ArrowRight': playerIndex = 1; requestedDirection = 'right'; break;
        }


        if (playerIndex !== -1 && requestedDirection !== null && players[playerIndex]?.alive) {
            const player = players[playerIndex];
            const oppositeDirections = {
                'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'
            };
            if (player.direction !== oppositeDirections[requestedDirection]) {
                player.nextDirection = requestedDirection;
                e.preventDefault();
            }
        }
    }

    // --- Initial Setup ---
    initTwoPlayer();

});