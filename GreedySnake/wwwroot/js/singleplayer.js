/*
 * File: singleplayer.js
 * Description: Contains the main game logic and UI interactions for the single player mode.
 * Handles snake movement, food generation, collision detection (wall, self), score,
 * game state (start/game over), time tracking, leaderboard fetching/submission,
 * and keyboard input specific to single player (WASD/Arrows).
 * Relies on common.js for helper functions and constants.
 */

// Execute script after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- UI Element References ---
    const canvas = document.getElementById('game-canvas'); // The main game canvas element
    const ctx = canvas.getContext('2d'); // The 2D rendering context for drawing on the canvas

    const usernameDisplaySpan = document.getElementById('current-username-display'); // Span displaying the current username
    const p1ScoreSpan = document.getElementById('p1-current-score'); // Span displaying the player's current score
    const highScoreElement = document.getElementById('high-score'); // Element displaying the historical high score for the current user
    const survivalTimeSpan = document.getElementById('current-survival-time'); // Span displaying the current game survival time
    const messageElement = document.getElementById('message-area'); // Element for displaying general game messages (e.g., "Game Over")
    const gameResultArea = document.getElementById('game-result-area'); // Element for displaying the final game result summary
    const startButton = document.getElementById('start-button'); // The game start/restart button
    const leaderboardList = document.getElementById('leaderboard-list'); // The ul element for the leaderboard list display

    // --- Game State Variables ---
    let player; // Object representing the single snake player (position, score, direction, etc.)
    let food; // Object representing the food position ({x, y})
    let speed = 120; // Game speed in milliseconds (interval between game ticks, lower value means faster snake movement)
    let gameLoopTimeout; // Stores the ID returned by setTimeout, used to cancel the game loop
    let isGameRunning = false; // Flag indicating if the game is currently running
    let gameStartTime = null; // Timestamp (milliseconds) when the current game started (for survival time calculation)
    let currentSurvivalTime = 0; // Current survival time in seconds
    let currentUsername = '玩家'; // Current user's name (read from URL parameters)
    let gameDifficulty = 'medium'; // Difficulty level selected (read from URL parameters)


    // --- Game Initialization ---
    // Sets up the initial game state when the page loads.
    // Reads URL parameters for username and difficulty, sets initial player state,
    // fetches and displays the leaderboard.
    function initSinglePlayer() {
        console.log("Single player game initializing...");

        // Read username and difficulty from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        currentUsername = urlParams.get('username') || '玩家'; // Get 'username' param or default to '玩家'
        gameDifficulty = urlParams.get('difficulty') || 'medium'; // Get 'difficulty' param or default to 'medium'

        // Set game speed based on the selected difficulty level
        setGameSpeed(gameDifficulty);

        // Update the username display in the UI, escaping HTML for safety
        if (usernameDisplaySpan) usernameDisplaySpan.textContent = escapeHTML(currentUsername);

        // Initialize the player object to its starting state
        player = {
            snake: [{ x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) }], // Initial snake position (center of grid)
            score: 0, // Initial score is zero
            direction: 'right', // Initial movement direction
            nextDirection: 'right', // Next intended direction (same as initial)
            alive: true, // Player starts the game alive
            color: '#008000', // Snake color (green)
            name: currentUsername, // Player name is the current username
            startTime: null, // Game start time for this player (not strictly necessary in single player but kept for structure)
            survivalTime: 0 // Initial survival time is zero
        };

        // Reset food and game state flags
        food = null; // No food on initialization
        isGameRunning = false; // Game is not running until the start button is clicked
        gameStartTime = null; // Reset game start time
        currentSurvivalTime = 0; // Reset current survival time

        // Fetch and display the overall leaderboard data, and find the current user's high score
        fetchLeaderboard();

        // Update UI displays to reflect the initial game state
        updateScoreDisplays();
        updateSurvivalTimeDisplay();
        messageElement.textContent = '按空格键开始游戏'; // Set the initial instruction message
        gameResultArea.textContent = ''; // Clear any previous game results
        startButton.textContent = '开始游戏'; // Set the start button text
        startButton.disabled = false; // Ensure the start button is enabled

        // Clear any potentially existing game loop timeout from a previous session/page load
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        // Perform the initial drawing of the game board and the snake
        draw();

        console.log(`Single player game initialized for user: ${currentUsername}, Difficulty: ${gameDifficulty}, Speed: ${speed}ms`);
    }

    // --- Game Speed Configuration ---
    // Sets the global 'speed' variable based on the selected difficulty level for single player.
    // A lower 'speed' value results in a faster game loop and thus faster snake movement.
    // difficulty: string - The difficulty level ('easy', 'medium', 'hard').
    function setGameSpeed(difficulty) {
        switch (difficulty) {
            case 'easy':
                speed = 180; // Slowest speed (longer interval)
                break;
            case 'hard':
                speed = 80; // Fastest speed (shorter interval)
                break;
            case 'medium':
            default:
                speed = 120; // Default (medium) speed
                break;
        }
    }


    // --- Food Generation ---
    // Generates a new food position on the game grid.
    // Ensures the new food position does not overlap with the snake's current position.
    function generateFood() {
        let newFoodPosition;
        do {
            // Generate random integer grid coordinates for the food position
            newFoodPosition = {
                x: Math.floor(Math.random() * GRID_WIDTH),
                y: Math.floor(Math.random() * GRID_HEIGHT)
            };
        } while (isPositionOnSnake(newFoodPosition, player.snake)); // Keep generating until the position is not occupied by the snake (using common helper)
        food = newFoodPosition; // Assign the valid, non-overlapping food position
        console.log("Food generated at:", food);
    }


    // --- API Interaction (Leaderboard) ---
    // Fetches the leaderboard data from the backend API.
    // Updates both the full leaderboard display and the current user's personal high score.
    async function fetchLeaderboard() {
        // Exit the function if the leaderboard list element is not found on the page
        if (!leaderboardList) return;

        console.log("Fetching leaderboard...");
        try {
            // Send a GET request to the defined leaderboard API endpoint URL
            const response = await fetch(LEADERBOARD_API_URL);
            // Check if the HTTP response status indicates success (status code 2xx)
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`); // Log the HTTP status error
                const errorText = await response.text(); // Read the error response body
                console.error("Error response body:", errorText); // Log the error body
                throw new Error(`HTTP error! status: ${response.status}`); // Throw an error to trigger the catch block
            }
            // Parse the JSON response body into a JavaScript object or array
            const leaderboardEntries = await response.json();
            console.log("Received leaderboard data:", leaderboardEntries); // Log the received data

            // --- Find and display the current user's highest score ---
            let maxScoreForCurrentUser = 0; // Initialize the maximum score found for the current user to 0
            const currentUserLower = currentUsername.toLowerCase(); // Get the lowercase version of the current username for case-insensitive comparison

            // Iterate through each entry in the fetched leaderboard
            leaderboardEntries.forEach(entry => {
                // Check if the entry has a username and if it matches the current user's username (case-insensitive)
                if (entry.username && entry.username.toLowerCase() === currentUserLower) {
                    // If the entry belongs to the current user, check if its score is higher than the current maximum
                    if (entry.score > maxScoreForCurrentUser) {
                        maxScoreForCurrentUser = entry.score; // Update the maximum score found so far for this user
                    }
                }
            });

            // Update the UI element that displays the high score for the current user
            if (highScoreElement) {
                highScoreElement.textContent = maxScoreForCurrentUser;
            }
            // --- End finding user high score ---


            // Display the full overall leaderboard list in the UI using the fetched entries
            displayLeaderboard(leaderboardEntries);

            console.log("Leaderboard loaded."); // Log success message
        } catch (error) {
            console.error("Error fetching leaderboard:", error); // Log any error that occurred during fetching
            // Display an error message to the user in the UI
            messageElement.textContent = "无法加载排行榜";
            // Clear the leaderboard list and set the high score display to 0 on error
            if (leaderboardList) leaderboardList.innerHTML = '<li>无法加载排行榜</li>';
            if (highScoreElement) highScoreElement.textContent = 0;
        }
    }

    // Submits the current player's game score to the backend API via a POST request.
    // entry: Object containing the score data to be submitted ({ Username, Score, SurvivalTime, Timestamp }).
    async function submitScore(entry) {
        console.log("Submitting score...", entry); // Log the entry being submitted
        try {
            // Send a POST request to the defined leaderboard API endpoint URL
            const response = await fetch(LEADERBOARD_API_URL, {
                method: 'POST', // Specify the HTTP method as POST
                headers: {
                    'Content-Type': 'application/json', // Indicate that the request body is in JSON format
                },
                body: JSON.stringify(entry), // Convert the score entry object to a JSON string for the request body
            });
            // Check if the HTTP response status indicates success (status code 2xx)
            if (!response.ok) {
                const errorText = await response.text(); // Read the error response body
                console.error(`HTTP error! status: ${response.status}. Body: ${errorText}`); // Log the error details
                throw new Error(`HTTP error! status: ${response.status}`); // Throw an error to trigger the catch block
            }
            // Parse the response body as text (assuming backend might return a simple message)
            const text = await response.text();
            if (text) {
                try {
                    const result = JSON.parse(text); // Try to parse as JSON if not just plain text
                    console.log("Score submitted successfully:", result.message); // Log success message from JSON
                } catch (e) {
                    console.log("Score submitted successfully. Response:", text); // Log raw text if not valid JSON
                }
            } else {
                console.log("Score submitted successfully (no response body)."); // Log if response body is empty
            }

            // After successful submission, refresh the leaderboard display to show the new entry
            fetchLeaderboard();

        } catch (error) {
            console.error("Error submitting score:", error); // Log any error that occurred during submission
            // Display an error message to the user in the UI
            messageElement.textContent = "无法保存得分记录";
        }
    }

    // Displays the fetched leaderboard entries in the UI list (#leaderboard-list).
    // entries: Array of leaderboard entry objects to display.
    function displayLeaderboard(entries) {
        // Exit the function if the leaderboard list element is not found
        if (!leaderboardList) return;

        // Clear the current content of the leaderboard list
        leaderboardList.innerHTML = '';

        // Display a message if the list of entries is empty
        if (entries.length === 0) {
            leaderboardList.innerHTML = '<li>暂无记录</li>';
            return;
        }

        // Iterate through each entry in the provided array
        entries.forEach((entry, index) => {
            const listItem = document.createElement('li'); // Create a new list item element for this entry
            // Escape HTML special characters in the entry data for safety before displaying in HTML
            const safeUsername = escapeHTML(entry.username);
            const safeScore = escapeHTML(entry.score);
            const safeTime = escapeHTML(entry.survivalTime);

            // Create the HTML structure for a 2-line list item entry as requested:
            // First line is a div for the username (bold, left-aligned).
            // Second line is a div with flexbox for score (left) and time (right).
            listItem.innerHTML = `
                 <div class="leaderboard-entry-username">${safeUsername}</div>
                 <div class="leaderboard-entry-score-time">
                     <span class="score">得分: ${safeScore}</span>
                     <span class="time">时长: ${safeTime}s</span>
                 </div>
             `;

            leaderboardList.appendChild(listItem); // Add the newly created list item to the leaderboard list in the UI
        });
    }

    // --- Game Loop ---
    // The main function controlling the game flow and timing.
    // It uses setTimeout to repeatedly call the update and draw functions at intervals determined by the game speed.
    function gameLoop() {
        // Stop the loop if the game is not currently running.
        if (!isGameRunning) {
            return;
        }

        // Update the current survival time display every tick if the game has started.
        if (gameStartTime) {
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000); // Calculate elapsed time in seconds
            updateSurvivalTimeDisplay(); // Update the corresponding UI element
        }

        // Schedule the next execution of the gameLoop function after a delay equal to the 'speed'.
        gameLoopTimeout = setTimeout(() => {
            update(); // Call the function to update the game state (move snake, check collisions, etc.)
            draw(); // Call the function to redraw the canvas with the updated state

            // Check game continuation conditions:
            // Continue the loop if the player is still alive AND the gameRunning flag is true.
            if (player.alive && isGameRunning) {
                gameLoop(); // Recursively call gameLoop for the next tick.
            } else if (isGameRunning) { // If the player is no longer alive, but the game is still marked as running.
                gameOver(); // End the game.
            }

        }, speed); // The delay for the setTimeout is set by the global 'speed' variable (controlled by difficulty).
    }

    // --- Game State Update ---
    // Updates the position of the snake, checks for collisions (wall, self), and food consumption.
    function update() {
        // Exit the function early if the player is not alive.
        if (!player.alive) return;

        // Update the player's current direction to their intended next direction.
        // This handles directional input buffering and prevents immediate 180-degree turns.
        player.direction = player.nextDirection;

        // Calculate the potential position of the snake's next head segment based on the current direction.
        const head = { ...player.snake[0] }; // Create a copy of the current head position object.
        switch (player.direction) {
            case 'up': head.y -= 1; break; // Move one grid cell up (decrease y-coordinate).
            case 'down': head.y += 1; break; // Move one grid cell down (increase y-coordinate).
            case 'left': head.x -= 1; break; // Move one grid cell left (decrease x-coordinate).
            case 'right': head.x += 1; break; // Move one grid cell right (increase x-coordinate).
        }

        // Check for collisions with walls or the snake's own body using common helper functions.
        if (checkWallCollision(head) || checkSelfCollision(head, player.snake)) {
            console.log(`${player.name} collided with wall or self.`); // Log the collision
            player.alive = false; // Mark the player as not alive if a collision occurs.
            return; // Stop further update processing for this player in this tick if they died.
        }

        // Check if the snake's potential next head position overlaps with the food position.
        if (food && head.x === food.x && head.y === food.y) {
            player.score++; // Increase the player's score.
            generateFood(); // Generate new food using the single-player specific function.
        } else {
            // If no food was eaten in this tick, remove the last segment of the snake's body.
            // This simulates the snake moving forward without growing.
            player.snake.pop();
        }

        // Add the new head segment to the beginning (front) of the snake's body array.
        player.snake.unshift(head);

        // Update the score display in the UI to reflect any score change.
        updateScoreDisplays();
    }

    // --- Drawing ---
    // Clears the canvas and redraws all game elements (background, food, snake) based on the current game state.
    function draw() {
        // Clear the entire canvas by filling it with the background color.
        ctx.fillStyle = '#e0e0e0'; // Set the fill color for the background.
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Fill the rectangle covering the entire canvas dimensions.

        // Draw the food on the canvas if the 'food' object is not null.
        if (food) {
            drawRect(ctx, food.x, food.y, 'red'); // Use the common helper function to draw a red rectangle at the food's grid coordinates.
        }

        // Draw the snake segments.
        if (player.alive) {
            // If the player is alive, iterate through the snake's segments and draw them with the player's color.
            player.snake.forEach((segment, index) => {
                // Darken the color specifically for the head segment (index 0) for visual distinction.
                const color = (index === 0) ? darkenColor(player.color, 20) : player.color; // Use the common helper function to darken the color.
                drawRect(ctx, segment.x, segment.y, color); // Use the common helper function to draw the snake segment at its grid coordinates.
            });
        } else {
            // If the player is not alive (game over state), draw the snake in grey.
            player.snake.forEach(segment => {
                drawRect(ctx, segment.x, segment.y, '#888888'); // Use the common helper function to draw a grey rectangle for the segment.
            });
        }
    }

    // Updates the player's current score display element in the UI.
    function updateScoreDisplays() {
        // Check if the score display element exists before updating its text content.
        if (p1ScoreSpan) p1ScoreSpan.textContent = player.score;
    }

    // Updates the current game survival time display element in the UI.
    function updateSurvivalTimeDisplay() {
        // Check if the survival time display element exists before updating its text content.
        if (survivalTimeSpan) survivalTimeSpan.textContent = currentSurvivalTime;
    }


    // --- Game State Control ---
    // Starts a new single player game. Resets game state variables and UI elements.
    function startGame() {
        // Exit the function if the game is already running.
        if (isGameRunning) return;

        console.log("Starting single player game..."); // Log game start

        // Reset game-specific state for a new game.
        // Username and difficulty are initialized once on page load and persist across restarts.
        player = {
            snake: [{ x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) }], // Reset snake position to center
            score: 0, // Reset score
            direction: 'right', // Reset direction
            nextDirection: 'right', // Reset next direction
            alive: true, // Player starts alive
            color: '#008000', // Snake color
            name: currentUsername, // Keep current username
            startTime: null, // Reset start time
            survivalTime: 0 // Reset survival time
        };

        food = null; // Reset food position
        isGameRunning = true; // Mark game as running
        gameStartTime = Date.now(); // Record the exact timestamp when the game starts
        currentSurvivalTime = 0; // Reset survival time counter
        messageElement.textContent = ''; // Clear previous messages in the UI
        gameResultArea.textContent = ''; // Clear previous game results display
        startButton.textContent = '进行中...'; // Update the start button text
        startButton.disabled = true; // Disable the start button while the game is in progress

        generateFood(); // Generate the first food item for the new game

        gameLoop(); // Start the main game loop execution
    }

    // Ends the current single player game. Handles score submission, results display, and UI reset.
    function gameOver() {
        // Exit the function if the game is not running (e.g., already game over).
        if (!isGameRunning) return;

        console.log("Single player Game Over!"); // Log game over event
        isGameRunning = false; // Mark the game as no longer running

        // Clear the game loop timeout to stop further updates and drawing.
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        // Calculate and update final survival time based on game duration.
        if (gameStartTime) {
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000); // Calculate total time elapsed in seconds
            updateSurvivalTimeDisplay(); // Final update to display the total time in the UI
            player.survivalTime = currentSurvivalTime; // Store the final time in the player object
        }

        // Display game over messages and results in the UI.
        messageElement.textContent = `游戏结束!`; // Set game over message
        startButton.disabled = false; // Enable the start button for restart
        startButton.textContent = '重新开始'; // Update start button text for restarting

        // Create the score entry object containing game results for submission.
        const singlePlayerEntry = {
            Username: player.name,
            Score: player.score,
            SurvivalTime: player.survivalTime,
            Timestamp: new Date().toISOString() // Record current timestamp in ISO format
        };

        // Submit the score entry to the backend leaderboard API.
        // This function also triggers a leaderboard refresh after successful submission.
        submitScore(singlePlayerEntry);

        // Display the final score and time in the results area of the UI.
        gameResultArea.textContent = `最终得分: ${player.score}, 游戏时长: ${player.survivalTime}s`;

        // Perform a final draw to show the snake in a grey color, indicating game over state.
        draw();

        // Add a prompt message instructing the user how to start a new game.
        messageElement.textContent += ' 按空格键开始新游戏';
    }

    // --- Event Listeners ---
    // Add event listener to the start button to call startGame function when clicked.
    // Ensure the button element exists before adding the listener.
    if (startButton) startButton.addEventListener('click', startGame);

    // Add a global keydown event listener to handle keyboard input for game controls and starting the game.
    document.addEventListener('keydown', handleKeyDownSinglePlayer);

    // Handles keydown events specifically for single player mode controls (Arrow Keys / WASD) and starting the game with Spacebar.
    // e: The KeyboardEvent object containing information about the key press.
    function handleKeyDownSinglePlayer(e) {
        // Check if the game is not running and the pressed key is Spacebar.
        if (!isGameRunning && e.key === ' ') {
            e.preventDefault(); // Prevent default browser action for Spacebar (like scrolling down).
            startGame(); // Call the startGame function to start a new game.
            return; // Exit the function after handling the Spacebar press.
        }

        // Ignore key presses related to movement if the game is not running or the player is not alive.
        if (!isGameRunning || !player.alive) return;

        let requestedDirection = null; // Variable to store the intended new direction based on the key press.

        // Check for Arrow Key presses to determine the requested direction.
        switch (e.key) {
            case 'ArrowUp': requestedDirection = 'up'; break;
            case 'ArrowDown': requestedDirection = 'down'; break;
            case 'ArrowLeft': requestedDirection = 'left'; break;
            case 'ArrowRight': requestedDirection = 'right'; break;
        }

        // If no direction was determined by Arrow keys, check for WASD key presses.
        if (requestedDirection === null) {
            switch (e.key.toLowerCase()) { // Use toLowerCase() to handle both uppercase (W, A, S, D) and lowercase (w, a, s, d).
                case 'w': requestedDirection = 'up'; break;
                case 's': requestedDirection = 'down'; break;
                case 'a': requestedDirection = 'left'; break;
                case 'd': requestedDirection = 'right'; break;
            }
        }

        // If a valid movement key was pressed (either Arrow or WASD).
        if (requestedDirection !== null) {
            // Define an object mapping each direction to its opposite direction.
            const oppositeDirections = {
                'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'
            };
            // Check if the requested direction is NOT the opposite of the snake's current direction.
            // This prevents the snake from immediately reversing into its own body.
            if (player.direction !== oppositeDirections[requestedDirection]) {
                player.nextDirection = requestedDirection; // Set the next intended direction for the snake.
                e.preventDefault(); // Prevent default browser action for arrow keys or WASD (like scrolling).
            }
        }
    }

    // --- Initial Setup ---
    // This function is called only once when the DOM is fully loaded to perform the initial setup
    // of the single player game page and game state variables.
    initSinglePlayer();

});