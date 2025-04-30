/*
 * File: twoplayer.js
 * Description: Contains the main game logic and UI interactions for the two player mode.
 * Handles movement for two snakes, food generation, collision detection
 * (wall, self, player-to-player), score, game state (start/game over), time tracking,
 * and keyboard input specific to two players (WASD and Arrows).
 * Includes dynamic speed adjustment based on combined player scores using a common helper function
 * with difficulty-specific step rates. Does NOT submit scores to the leaderboard.
 * Relies on common.js for helper functions and constants.
 */

// Execute script after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas'); // The main game canvas element
    const ctx = canvas.getContext('2d'); // The 2D rendering context for drawing on the canvas

    // --- UI Element References ---
    const p1ScoreSpan = document.getElementById('p1-current-score'); // Span displaying Player 1's score
    const p2ScoreSpan = document.getElementById('p2-current-score'); // Span displaying Player 2's score
    const survivalTimeSpan = document.getElementById('current-survival-time'); // Span displaying the match survival time
    const messageElement = document.getElementById('message-area'); // Element for displaying general game messages
    const gameResultArea = document.getElementById('game-result-area'); // Element for displaying final game results
    const startButton = document.getElementById('start-button'); // The game start/restart button


    // --- Game State Variables ---
    let players = []; // Array containing player objects (Player 1 and Player 2)
    let food; // Object representing the food position ({x, y})
    let speed = 120; // Game speed in milliseconds (interval between game ticks, lower value means faster)
    let initialTwoPlayerSpeed = 120; // Stores the speed set by the initial difficulty, used as a baseline for dynamic speed adjustment
    let twoPlayerScoreStepReduction = 5; // Amount speed decreases per point for the current difficulty
    let gameLoopTimeout; // Stores the ID returned by setTimeout for the game loop
    let isGameRunning = false; // Flag indicating if the game is currently running
    let gameStartTime = null; // Timestamp (milliseconds) when the current match started (for survival time calculation)
    let currentMatchTime = 0; // Current match time in seconds
    let gameDifficulty = 'medium'; // Difficulty level selected (read from URL parameters)


    // --- Game Initialization ---
    // Sets up the initial game state for two players. Reads difficulty from URL.
    function initTwoPlayer() {
        console.log("Two player game initializing...");

        // Read difficulty from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        gameDifficulty = urlParams.get('difficulty') || 'easy'; // Get 'difficulty' param or default to 'easy'

        // Set the initial game speed and score step reduction rate based on the selected difficulty level
        setGameSpeed(gameDifficulty);
        initialTwoPlayerSpeed = speed; // Store the speed set by the initial difficulty

        // Initialize player states for both players to starting values
        players = []; // Clear the existing players array
        players.push({ // Player 1 (WASD, Blue) setup
            snake: [{ x: Math.floor(GRID_WIDTH / 4), y: Math.floor(GRID_HEIGHT / 2) }], // Initial position for P1
            score: 0, // Initial score
            direction: 'right', // Initial direction
            nextDirection: 'right', // Next direction
            alive: true, // Player starts alive
            color: '#0000FF', // Blue color
            name: '玩家一', // Player name
            startTime: null, // Game start time (not strictly necessary per player here but kept)
            survivalTime: 0, // Individual survival time
            timeOfDeath: null // Timestamp of death (null if alive)
        });
        players.push({ // Player 2 (Arrows, Red) setup
            snake: [{ x: Math.floor(GRID_WIDTH * 3 / 4), y: Math.floor(GRID_HEIGHT / 2) }], // Initial position for P2
            score: 0, // Initial score
            direction: 'left', // Initial direction
            nextDirection: 'left', // Next direction
            alive: true, // Alive state
            color: '#FF0000', // Red color
            name: '玩家二', // Player name
            startTime: null,
            survivalTime: 0,
            timeOfDeath: null
        });

        // Reset food and game state flags
        food = null; // No food on initialization
        isGameRunning = false; // Game is not running until Start is clicked
        gameStartTime = null; // Reset match start time
        currentMatchTime = 0; // Reset current match time

        // Update UI displays to initial values
        updateScoreDisplays();
        updateMatchTimeDisplay();
        messageElement.textContent = ''; // Clear previous messages
        gameResultArea.textContent = ''; // Clear previous results display
        startButton.textContent = '开始游戏'; // Set start button text
        startButton.disabled = false; // Enable the start button

        // Clear any potentially existing game loop timeout from a previous session/page load
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        // Perform initial drawing of the game board (empty) and the snakes
        draw();

        console.log(`Two player game initialized. Difficulty: ${gameDifficulty}, Initial Speed: ${initialTwoPlayerSpeed}ms, Speed Step: ${twoPlayerScoreStepReduction}ms/point`); // Log initialization details
    }

    // --- Game Speed Configuration ---
    // Sets the initial global 'speed' variable and the score step reduction rate
    // based on the selected two-player difficulty level.
    // This function is typically called only once during initialization and at the start of a new game.
    // Dynamic speed changes based on combined player scores happen in the update function using the determined step rate.
    // difficulty: string - The difficulty level ('super_easy', 'easy', 'medium', 'hard').
    function setGameSpeed(difficulty) {
        switch (difficulty) {
            case 'super_easy':
                speed = 200; // Slowest initial speed (longest interval)
                twoPlayerScoreStepReduction = 2; // Very small speed increase per point
                break;
            case 'easy':
                speed = 150; // Slower initial speed
                twoPlayerScoreStepReduction = 3; // Small speed increase per point
                break;
            case 'hard':
                speed = 50; // Fastest initial speed
                twoPlayerScoreStepReduction = 7; // Large speed increase per point
                break;
            case 'medium':
            default:
                speed = 100; // Default (medium) initial speed
                twoPlayerScoreStepReduction = 5; // Medium speed increase per point
                break;
        }
    }


    // --- Food Generation ---
    // Generates a new food position on the grid.
    // Ensures the new food position does not overlap with ANY segment of ANY alive snake.
    function generateFood() {
        let newFoodPosition;
        let isCollidingWithAnySnake;
        do {
            // Generate random integer grid coordinates within bounds
            newFoodPosition = {
                x: Math.floor(Math.random() * GRID_WIDTH), // Random x-coordinate
                y: Math.floor(Math.random() * GRID_HEIGHT) // Random y-coordinate
            };
            // Check if the new position overlaps with ANY segment of ANY alive snake (using common helper)
            isCollidingWithAnySnake = players.some(p =>
                p.alive && isPositionOnSnake(newFoodPosition, p.snake) // 'some' checks if at least one player's snake contains the position
            );
        } while (isCollidingWithAnySnake); // Keep generating until the position is not occupied by any snake
        food = newFoodPosition; // Assign the valid, non-overlapping food position
        console.log("Food generated at:", food); // Log the food position
    }


    // --- Game Loop ---
    // The main function controlling the game flow and timing.
    // It uses setTimeout to repeatedly call the update and draw functions at intervals determined by the game speed.
    function gameLoop() {
        // Stop the loop if the game is not currently running.
        if (!isGameRunning) {
            return;
        }

        // Update the current match time display every tick if the game has started.
        if (gameStartTime) {
            currentMatchTime = Math.floor((Date.now() - gameStartTime) / 1000); // Calculate elapsed time in seconds
            updateMatchTimeDisplay(); // Update the corresponding UI element
        }

        // Schedule the next execution of the gameLoop function after a delay equal to the 'speed'.
        // The 'speed' variable is dynamically updated in the 'update' function based on combined scores.
        gameLoopTimeout = setTimeout(() => {
            update(); // Call the function to update the game state (move snakes, check collisions, etc.)
            draw(); // Call the function to redraw the canvas with the updated state

            // Check game continuation conditions:
            // Check if at least one player is still alive
            const anyAlive = players.some(player => player.alive);
            // Continue the loop if ANY player is still alive AND the gameRunning flag is true.
            if (anyAlive && isGameRunning) {
                gameLoop(); // Recursively call gameLoop for the next tick.
            } else if (isGameRunning) { // If no players are alive, but the game is still marked as running (meaning game just ended).
                gameOver(); // End the game.
            }

        }, speed); // The delay for the setTimeout is set by the global 'speed' variable (controlled by difficulty and total score).
    }

    // --- Game State Update ---
    // Updates the position of both snakes, checks for all types of collisions (wall, self, player-to-player),
    // and food consumption. Determines which players die during this tick.
    // Dynamically adjusts game speed based on the combined score of all players using a common helper function
    // and the difficulty-specific step rate.
    function update() {
        // Calculate potential next head positions for all players (including those who might be dying)
        const nextPositions = players.map(player => {
            if (!player.alive) return null; // If player is not alive, their position doesn't update, return null

            const nextHead = { ...player.snake[0] }; // Create a copy of the current head position object
            const direction = player.nextDirection; // Get player's next intended direction
            switch (direction) {
                case 'up': nextHead.y -= 1; break; // Move one grid cell up
                case 'down': nextHead.y += 1; break; // Move one grid cell down (increase y-coordinate).
                case 'left': nextHead.x -= 1; break; // Move one grid cell left (decrease x-coordinate).
                case 'right': nextHead.x += 1; break; // Move one grid cell right (increase x-coordinate).
            }
            return nextHead; // Return the calculated potential next head position
        });

        // Array to track which players are marked as dying during this update tick.
        // Initialize all to false. A player marked true will die at the end of this tick.
        const playersDyingThisFrame = new Array(players.length).fill(false);

        // --- Collision Detection Phase ---
        // Determine who dies based on potential next positions and current occupied positions.
        // This phase calculates *all* deaths before committing any moves.

        players.forEach((player, pIndex) => {
            // Only check collisions for players who are currently alive
            if (!player.alive) return;

            const nextHead = nextPositions[pIndex]; // Get the calculated potential next head position for this player

            // 1. Check Wall Collision
            if (checkWallCollision(nextHead)) { // Use common helper function to check if nextHead is outside bounds
                playersDyingThisFrame[pIndex] = true; // Mark this player as dying
                console.log(`${player.name} collided with wall.`); // Log the collision
            }

            // 2. Check Self Collision (current player's next head hits current player's body)
            // Only check if the player hasn't already collided with a wall this frame
            if (!playersDyingThisFrame[pIndex] && checkSelfCollision(nextHead, player.snake)) { // Use common helper function
                playersDyingThisFrame[pIndex] = true; // Mark this player as dying
                console.log(`${player.name} collided with self.`); // Log the collision
            }

            // 3. Check Collisions with Other Player(s)
            // Iterate through all other players to check collisions against them
            players.forEach((otherPlayer, otherPIndex) => {
                // Skip checking collision with self
                // Only check against other players who are currently alive
                if (pIndex === otherPIndex || !otherPlayer.alive) return;

                const otherNextHead = nextPositions[otherPIndex]; // Get the other player's calculated potential next head

                // --- Player-to-Player Collision Logic ---

                // 3a. Head-to-Head Collision (both players moving to the same exact next position)
                // This needs to mark *both* players for death if it occurs, regardless of other collisions.
                if (nextHead.x === otherNextHead.x && nextHead.y === otherNextHead.y) {
                    playersDyingThisFrame[pIndex] = true; // Mark current player as dying
                    playersDyingThisFrame[otherPIndex] = true; // Mark other player as dying
                    console.log(`${player.name} and ${otherPlayer.name} had head-to-head collision at ${nextHead.x},${nextHead.y}.`); // Log the collision
                }

                // 3b. Current Player's Head vs Other Player's Body (including their head)
                // Check if the current player's potential next head collides with ANY segment
                // of the other player's *current* snake body (including their current head).
                if (!playersDyingThisFrame[pIndex] && isPositionOnSnake(nextHead, otherPlayer.snake.slice(0))) { // Use common helper function, slice(0) includes the head
                    playersDyingThisFrame[pIndex] = true; // Mark the current player as dying
                    console.log(`${player.name}'s head collided with ${otherPlayer.name}'s snake segment.`); // Log the collision
                }

                // 3c. Other Player's Head vs Current Player's Body (including head)
                // This specific check is handled implicitly when the outer loop iterates for the 'otherPlayer'
                // as the 'player'.
            });
        });
        // --- End Collision Detection Phase ---


        // --- State Update Phase (based on collision results) ---
        // Now that all deaths have been determined for this tick, update the game state.
        let foodEatenThisFrame = false; // Flag to track if any food was eaten this frame

        // Iterate through all players to update their state (position, score, alive status)
        players.forEach((player, pIndex) => {
            // Only process players who were alive at the start of this tick
            if (!player.alive) return; // Skip if player was already dead before this update tick began

            // If this player was marked as dying during the collision detection phase
            if (playersDyingThisFrame[pIndex]) {
                player.alive = false; // Set player status to not alive
                player.timeOfDeath = Date.now(); // Record the exact time of death
                console.log(`${player.name} confirmed dead.`); // Log confirmation
                // Do NOT update snake position for dying players - they freeze at their current spot of collision
                return; // Stop processing for this player in this tick
            }

            // If this player survived all collisions this tick
            player.direction = player.nextDirection; // Update current direction to the intended next direction
            const nextHead = nextPositions[pIndex]; // Get the calculated potential next head

            // Check food collision for this surviving player
            if (food && nextHead.x === food.x && nextHead.y === food.y) {
                player.score++; // Increase player's score
                foodEatenThisFrame = true; // Set flag to regenerate food later
            } else {
                // If no food was eaten, remove the last segment of the snake (simulating movement)
                player.snake.pop();
            }

            // Add the new head segment to the beginning of the snake array for the surviving player
            player.snake.unshift(nextHead);
        });

        // If any food was eaten this frame by any player, generate a new food item and adjust speed
        if (foodEatenThisFrame) {
            generateFood(); // Use the two-player specific generateFood function

            // --- Adjust speed based on total score using common helper function and difficulty-specific step ---
            const totalScore = players.reduce((sum, p) => sum + p.score, 0); // Calculate the sum of scores for all players
            // Calculate the new speed based on the initial speed, total score, and the mode's reduction rate per point.
            speed = calculateDynamicSpeed(initialTwoPlayerSpeed, totalScore, twoPlayerScoreStepReduction);
            console.log(`Total score increased to ${totalScore}, new speed: ${speed}ms`); // Log the total score and new speed
            // --- End speed adjustment ---
        }

        // Update the score displays in the UI for both players
        updateScoreDisplays();
    }


    // --- Drawing ---
    // Clears the canvas and redraws all game elements (background, food, snakes) based on the current game state.
    function draw() {
        // Clear the entire canvas by filling it with the background color.
        ctx.fillStyle = '#e0e0e0'; // Set the fill color for the background.
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Fill the rectangle covering the entire canvas dimensions.

        // Draw the food on the canvas if the 'food' object is not null.
        if (food) {
            drawRect(ctx, food.x, food.y, 'red'); // Use the common helper function to draw a red rectangle at the food's grid coordinates.
        }

        // Draw each player's snake segments.
        players.forEach(player => {
            player.snake.forEach((segment, index) => {
                // Darken the color specifically for the head segment (index 0) for visual distinction.
                const color = (index === 0) ? darkenColor(player.color, 20) : player.color; // Use common helper function to darken color.
                // Draw the segment. If the player is not alive, draw in grey; otherwise, use the player's color.
                drawRect(ctx, segment.x, segment.y, player.alive ? color : '#888888'); // Use common helper function to draw the segment.
            });
        });
    }

    // Updates the score display elements for Player 1 and Player 2 in the UI.
    function updateScoreDisplays() {
        // Check if the score display elements exist and update their text content.
        // Use optional chaining (?.) and nullish coalescing (??) for safety
        // in case players array or score property is temporarily undefined (e.g., during init).
        if (p1ScoreSpan) p1ScoreSpan.textContent = players[0]?.score ?? 0;
        if (p2ScoreSpan) p2ScoreSpan.textContent = players[1]?.score ?? 0;
    }

    // Updates the match survival time display element in the UI.
    function updateMatchTimeDisplay() {
        // Check if the survival time display element exists and update its text content.
        if (survivalTimeSpan) survivalTimeSpan.textContent = currentMatchTime;
    }


    // --- Game State Control ---
    // Starts a new two player game. Resets game state variables and UI elements.
    function startGame() {
        // Exit the function if the game is already running.
        if (isGameRunning) return;

        console.log("Starting two player game..."); // Log game start

        // Re-initialize player states fully for a new game.
        players = []; // Clear the existing players array
        players.push({ // Initialize Player 1 (WASD, Blue) state
            snake: [{ x: Math.floor(GRID_WIDTH / 4), y: Math.floor(GRID_HEIGHT / 2) }], // Reset snake position for P1
            score: 0, // Reset score
            direction: 'right', // Reset direction
            nextDirection: 'right', // Reset next direction
            alive: true, // Player starts alive
            color: '#0000FF', // Blue color
            name: '玩家一', // Player name
            startTime: null, // Reset start time
            survivalTime: 0, // Reset survival time
            timeOfDeath: null // Reset time of death
        });
        players.push({ // Initialize Player 2 (Arrows, Red) state
            snake: [{ x: Math.floor(GRID_WIDTH * 3 / 4), y: Math.floor(GRID_HEIGHT / 2) }], // Reset snake position for P2
            score: 0, // Reset score
            direction: 'left', // Reset direction
            nextDirection: 'left', // Reset next direction
            alive: true, // Player starts alive
            color: '#FF0000', // Red color
            name: '玩家二', // Player name
            startTime: null,
            survivalTime: 0,
            timeOfDeath: null
        });

        food = null; // Reset food position
        isGameRunning = true; // Mark game as running
        gameStartTime = Date.now(); // Record the exact timestamp when the game starts
        currentMatchTime = 0; // Reset current match time
        messageElement.textContent = ''; // Clear previous messages in the UI
        gameResultArea.textContent = ''; // Clear previous game results display
        startButton.textContent = '进行中...'; // Update the start button text
        startButton.disabled = true; // Disable the start button while the game is in progress

        generateFood(); // Generate the first food item for the new game

        // Reset speed to the initial difficulty speed and set the step rate at the start of a new game
        setGameSpeed(gameDifficulty);
        initialTwoPlayerSpeed = speed; // Ensure initial speed is correctly stored for the new game

        gameLoop(); // Start the main game loop execution
    }

    // Ends the current two player game. Determines winner and displays results.
    // Does NOT submit scores to the leaderboard as per requirements.
    function gameOver() {
        // Exit the function if the game is not running (e.g., already game over).
        if (!isGameRunning) return;

        console.log("Two player Game Over!"); // Log game over event
        isGameRunning = false; // Mark the game as no longer running

        // Clear the game loop timeout to stop further updates and drawing.
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        // Calculate and update final individual survival times based on game duration or time of death.
        const gameEndTime = Date.now(); // Record the exact timestamp when the match ended
        players.forEach(player => {
            if (player.alive) {
                // If player survived until the end of the match (i.e., the other player died)
                player.survivalTime = Math.floor((gameEndTime - gameStartTime) / 1000);
            } else {
                // If player died before the end of the match, use their recorded time of death
                if (player.timeOfDeath !== null) {
                    player.survivalTime = Math.floor((player.timeOfDeath - gameStartTime) / 1000);
                } else {
                    // Fallback case, should ideally not happen if timeOfDeath is set correctly on death
                    player.survivalTime = 0;
                }
            }
        });

        // Display game over messages and results in the UI.
        messageElement.textContent = `游戏结束!`; // Set game over message
        startButton.disabled = false; // Enable the start button for restart
        startButton.textContent = '重新开始'; // Update start button text for restarting

        // Format and display results for both players.
        let resultText = `<h3>对战结果</h3>`; // Title for the results section
        const p1 = players.find(p => p.name === '玩家一'); // Find player 1 object by name
        const p2 = players.find(p => p.name === '玩家二'); // Find player 2 object by name

        // Display individual player results
        if (p1) resultText += `<p><strong>${escapeHTML(p1.name)}</strong> (${p1.color === '#0000FF' ? '蓝色' : '红色'}): 得分 ${p1.score}, 游戏时长 ${p1.survivalTime}s ${p1.alive ? '(幸存)' : '(死亡)'}</p>`;
        if (p2) resultText += `<p><strong>${escapeHTML(p2.name)}</strong> (${p2.color === '#FF0000' ? '红色' : '蓝色'}): 得分 ${p2.score}, 游戏时长 ${p2.survivalTime}s ${p2.alive ? '(幸存)' : '(死亡)'}</p>`;

        // Determine and display the winner based on game outcomes (last player alive, then score, then time).
        if (p1 && p2) {
            if (p1.alive && !p2.alive) {
                resultText += `<p><strong>${escapeHTML(p1.name)}</strong> 获胜!</p>`;
            } else if (!p1.alive && p2.alive) {
                resultText += `<p><strong>${escapeHTML(p2.name)}</strong> 获胜!</p>`;
            } else {
                // Both players died (simultaneously or already dead before this tick) or both survived (implies tie-game)
                if (p1.score > p2.score) {
                    resultText += `<p><strong>${escapeHTML(p1.name)}</strong> 获胜 (得分更高)!</p>`;
                } else if (p2.score > p1.score) {
                    resultText += `<p><strong>${escapeHTML(p2.name)}</strong> 获胜 (得分更高)!</p>`;
                } else {
                    // Scores are tied, compare survival time
                    if (p1.survivalTime > p2.survivalTime) {
                        resultText += `<p><strong>${escapeHTML(p1.name)}</strong> 获胜 (游戏时长更长)!</p>`;
                    } else if (p2.survivalTime > p1.survivalTime) {
                        resultText += `<p><strong>${escapeHTML(p2.name)}</strong> 获胜 (游戏时长更长)!</p>`;
                    } else {
                        // Exact tie, no winner determined by score/time
                        resultText += `<p>平局!</p>`; // Both scores and times are tied
                    }
                }
            }
        }

        gameResultArea.innerHTML = resultText; // Display the results HTML in the results area

        // --- Score Submission Removed ---
        // As per requirements, two-player scores are not submitted to the leaderboard.
        // The submitScore function and its call were removed.
        // --- End Score Submission Removal ---


        draw(); // Perform a final draw to show snakes in grey to indicate game over state

        // Add a prompt message instructing the user how to start a new game.
        messageElement.textContent += ' 按空格键开始新游戏';
    }

    // --- API Interaction (Leaderboard) ---
    // The submitScore function and any calls to it have been removed from twoplayer.js
    // as scores are not submitted from this mode.

    // --- Event Listeners ---
    // Add event listener to the start button to call startGame function when clicked.
    // Ensure the button element exists before adding the listener.
    if (startButton) startButton.addEventListener('click', startGame);

    // Add a global keydown event listener to handle keyboard input for game controls and starting the game.
    document.addEventListener('keydown', handleKeyDownTwoPlayer);

    // Handles keydown events specifically for two player mode controls (WASD for P1, Arrows for P2) and starting the game with Spacebar.
    // e: The KeyboardEvent object containing information about the key press.
    function handleKeyDownTwoPlayer(e) {
        // Start the game using the Spacebar if the game is not currently running.
        if (!isGameRunning && e.key === ' ') {
            e.preventDefault(); // Prevent default browser action for Spacebar.
            startGame(); // Call the startGame function.
            return; // Exit the function after handling the Spacebar press.
        }

        // Ignore key presses related to movement if the game is not running.
        if (!isGameRunning) return;


        let requestedDirection = null; // Variable to store the intended new direction based on the key press.
        let playerIndex = -1; // Variable to store the index of the player whose key was pressed (0 for P1, 1 for P2).

        // Check Player 1 (WASD) keys (case-insensitive)
        switch (e.key.toLowerCase()) {
            case 'w': playerIndex = 0; requestedDirection = 'up'; break;
            case 's': playerIndex = 0; requestedDirection = 'down'; break;
            case 'a': playerIndex = 0; requestedDirection = 'left'; break;
            case 'd': playerIndex = 0; requestedDirection = 'right'; break;
        }
        // Check Player 2 (Arrow) keys
        switch (e.key) {
            case 'ArrowUp': playerIndex = 1; requestedDirection = 'up'; break;
            case 'ArrowDown': playerIndex = 1; requestedDirection = 'down'; break;
            case 'ArrowLeft': playerIndex = 1; requestedDirection = 'left'; break;
            case 'ArrowRight': playerIndex = 1; requestedDirection = 'right'; break;
        }

        // If a valid movement key was pressed for a player, and that player is currently alive
        if (playerIndex !== -1 && requestedDirection !== null && players[playerIndex]?.alive) {
            const player = players[playerIndex]; // Get the player object
            // Define an object mapping each direction to its opposite direction to prevent immediate reversal.
            const oppositeDirections = {
                'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'
            };
            // Check if the requested direction is NOT the opposite of the player's current direction.
            if (player.direction !== oppositeDirections[requestedDirection]) {
                player.nextDirection = requestedDirection; // Set the player's next intended direction.
                e.preventDefault(); // Prevent default browser action for arrow keys or WASD.
            }
        }
    }

    // --- Initial Setup ---
    // This function is called only once when the DOM is fully loaded to perform the initial setup
    // of the two player game page and game state variables.
    initTwoPlayer();

});