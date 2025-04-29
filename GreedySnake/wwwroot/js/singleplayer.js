// File: singleplayer.js

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    // UI Elements (from singleplayer.html)
    const usernameDisplaySpan = document.getElementById('current-username-display');
    const p1ScoreSpan = document.getElementById('p1-current-score');
    const highScoreElement = document.getElementById('high-score');
    const survivalTimeSpan = document.getElementById('current-survival-time');
    const messageElement = document.getElementById('message-area');
    const gameResultArea = document.getElementById('game-result-area');
    const startButton = document.getElementById('start-button');
    const leaderboardList = document.getElementById('leaderboard-list');


    // Game State Variables (Single Player)
    let player;
    let food;
    let speed = 120;
    let gameLoopTimeout;
    let isGameRunning = false;
    let gameStartTime = null;
    let currentSurvivalTime = 0;
    let currentUsername = '玩家';


    // --- Initialization ---
    function initSinglePlayer() {
        console.log("Single player game initializing...");

        const urlParams = new URLSearchParams(window.location.search);
        currentUsername = urlParams.get('username') || '玩家';

        if (usernameDisplaySpan) usernameDisplaySpan.textContent = escapeHTML(currentUsername);


        player = {
            snake: [{ x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) }],
            score: 0,
            direction: 'right',
            nextDirection: 'right',
            alive: true,
            color: '#008000',
            name: currentUsername,
            startTime: null,
            survivalTime: 0
        };


        food = null;
        isGameRunning = false;
        gameStartTime = null;
        currentSurvivalTime = 0;

        // Fetch and display leaderboard, also update user's high score
        fetchLeaderboard();

        updateScoreDisplays();
        updateSurvivalTimeDisplay();
        messageElement.textContent = '按空格键开始游戏';
        gameResultArea.textContent = '';
        startButton.textContent = '开始游戏';
        startButton.disabled = false;

        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        draw();

        console.log(`Single player game initialized for user: ${currentUsername}`);
    }

    // --- Food Generation (Single Player) ---
    function generateFood() {
        let newFoodPosition;
        do {
            newFoodPosition = {
                x: Math.floor(Math.random() * GRID_WIDTH),
                y: Math.floor(Math.random() * GRID_HEIGHT)
            };
        } while (isPositionOnSnake(newFoodPosition, player.snake));
        food = newFoodPosition;
        console.log("Food generated at:", food);
    }


    // --- API Interaction (Leaderboard) ---
    async function fetchLeaderboard() {
        if (!leaderboardList) return;

        console.log("Fetching leaderboard...");
        try {
            const response = await fetch(LEADERBOARD_API_URL);
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`);
                const errorText = await response.text();
                console.error("Error response body:", errorText);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const leaderboardEntries = await response.json();
            console.log("Received leaderboard data:", leaderboardEntries);

            // --- FIX: Find and display the current user's highest score ---
            let maxScoreForCurrentUser = 0;
            const currentUserLower = currentUsername.toLowerCase(); // Use lowercase for comparison

            leaderboardEntries.forEach(entry => {
                if (entry.username && entry.username.toLowerCase() === currentUserLower) {
                    if (entry.score > maxScoreForCurrentUser) {
                        maxScoreForCurrentUser = entry.score;
                    }
                }
            });

            if (highScoreElement) {
                highScoreElement.textContent = maxScoreForCurrentUser; // Display user's max score
            }
            // --- End FIX ---


            // Display the overall leaderboard list (as before)
            displayLeaderboard(leaderboardEntries);


            console.log("Leaderboard loaded.");
        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            messageElement.textContent = "无法加载排行榜";
            if (leaderboardList) leaderboardList.innerHTML = '<li>无法加载排行榜</li>';
            // Also set user's high score to 0 on error
            if (highScoreElement) highScoreElement.textContent = 0;
        }
    }

    async function submitScore(entry) {
        console.log("Submitting score...", entry);
        try {
            const response = await fetch(LEADERBOARD_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(entry),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP error! status: ${response.status}. Body: ${errorText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            if (text) {
                const result = JSON.parse(text);
                console.log("Score submitted successfully:", result.message);
            } else {
                console.log("Score submitted successfully (no response body).");
            }

            fetchLeaderboard(); // Refresh leaderboard and user's high score

        } catch (error) {
            console.error("Error submitting score:", error);
            messageElement.textContent = "无法保存得分记录";
        }
    }

    function displayLeaderboard(entries) {
        if (!leaderboardList) return;
        leaderboardList.innerHTML = '';
        if (entries.length === 0) {
            leaderboardList.innerHTML = '<li>暂无记录</li>';
            return;
        }

        entries.forEach((entry, index) => {
            const listItem = document.createElement('li');
            const safeUsername = escapeHTML(entry.username);
            const safeScore = escapeHTML(entry.score);
            const safeTime = escapeHTML(entry.survivalTime);

            listItem.innerHTML = `
                 <div class="leaderboard-entry-username">${safeUsername}</div>
                 <div class="leaderboard-entry-score-time">
                     <span class="score">得分: ${safeScore}</span>
                     <span class="time">时长: ${safeTime}s</span>
                 </div>
             `;

            leaderboardList.appendChild(listItem);
        });
    }

    // --- Game Loop ---
    function gameLoop() {
        if (!isGameRunning) {
            return;
        }

        if (gameStartTime) {
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
            updateSurvivalTimeDisplay();
        }

        gameLoopTimeout = setTimeout(() => {
            update();
            draw();

            if (player.alive && isGameRunning) {
                gameLoop();
            } else if (isGameRunning) {
                gameOver();
            }

        }, speed);
    }

    // --- Update Game State ---
    function update() {
        if (!player.alive) return;

        player.direction = player.nextDirection;

        const head = { ...player.snake[0] };
        switch (player.direction) {
            case 'up': head.y -= 1; break;
            case 'down': head.y += 1; break;
            case 'left': head.x -= 1; break;
            case 'right': head.x += 1; break;
        }

        if (checkWallCollision(head) || checkSelfCollision(head, player.snake)) {
            console.log(`${player.name} collided with wall or self.`);
            player.alive = false;
            return;
        }

        if (food && head.x === food.x && head.y === food.y) {
            player.score++;
            generateFood();
        } else {
            player.snake.pop();
        }

        player.snake.unshift(head);

        updateScoreDisplays();
    }

    // --- Drawing ---
    function draw() {
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        if (food) {
            drawRect(ctx, food.x, food.y, 'red');
        }

        if (player.alive) {
            player.snake.forEach((segment, index) => {
                const color = (index === 0) ? darkenColor(player.color, 20) : player.color;
                drawRect(ctx, segment.x, segment.y, color);
            });
        } else {
            player.snake.forEach(segment => {
                drawRect(ctx, segment.x, segment.y, '#888888');
            });
        }
    }

    function updateScoreDisplays() {
        if (p1ScoreSpan) p1ScoreSpan.textContent = player.score;
    }

    function updateSurvivalTimeDisplay() {
        if (survivalTimeSpan) survivalTimeSpan.textContent = currentSurvivalTime;
    }


    // --- Helper Functions ---
    // isPositionOnSnake, checkWallCollision, checkSelfCollision, drawRect, darkenColor, escapeHTML are in common.js
    // generateFood is defined in this file


    // --- Game State Control ---
    function startGame() {
        if (isGameRunning) return;

        console.log("Starting single player game...");

        initSinglePlayer();

        isGameRunning = true;
        gameStartTime = Date.now();
        currentSurvivalTime = 0;
        messageElement.textContent = '';
        gameResultArea.textContent = '';
        startButton.textContent = '进行中...';
        startButton.disabled = true;

        generateFood();

        gameLoop();
    }

    function gameOver() {
        if (!isGameRunning) return;

        console.log("Single player Game Over!");
        isGameRunning = false;
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        if (gameStartTime) {
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
            updateSurvivalTimeDisplay();
            player.survivalTime = currentSurvivalTime;
        }


        messageElement.textContent = `游戏结束!`;
        startButton.disabled = false;
        startButton.textContent = '重新开始';

        const singlePlayerEntry = {
            Username: player.name,
            Score: player.score,
            SurvivalTime: player.survivalTime,
            Timestamp: new Date().toISOString()
        };
        submitScore(singlePlayerEntry);

        gameResultArea.textContent = `最终得分: ${player.score}, 游戏时长: ${player.survivalTime}s`;

        draw();
        messageElement.textContent += ' 按空格键开始新游戏';
    }

    // --- Event Listeners ---
    if (startButton) startButton.addEventListener('click', startGame);

    document.addEventListener('keydown', handleKeyDownSinglePlayer);

    function handleKeyDownSinglePlayer(e) {
        if (!isGameRunning && e.key === ' ') {
            e.preventDefault();
            startGame();
            return;
        }

        if (!isGameRunning || !player.alive) return;


        let requestedDirection = null;

        switch (e.key) {
            case 'ArrowUp': requestedDirection = 'up'; break;
            case 'ArrowDown': requestedDirection = 'down'; break;
            case 'ArrowLeft': requestedDirection = 'left'; break;
            case 'ArrowRight': requestedDirection = 'right'; break;
        }

        if (requestedDirection === null) {
            switch (e.key.toLowerCase()) {
                case 'w': requestedDirection = 'up'; break;
                case 's': requestedDirection = 'down'; break;
                case 'a': requestedDirection = 'left'; break;
                case 'd': requestedDirection = 'right'; break;
            }
        }


        if (requestedDirection !== null) {
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
    initSinglePlayer();

});