/*
 * File: singleplayer.js
 * Description: Contains the main game logic and UI interactions for the single player mode.
 * Handles snake movement, food generation, collision detection (wall, self), score,
 * game state (start/game over), time tracking, leaderboard fetching/submission,
 * and keyboard input specific to single player (WASD/Arrows).
 * Includes dynamic speed adjustment based on score using a common helper function
 * with difficulty-specific step rates. Fetches, filters, and displays difficulty-specific
 * high score and the full leaderboard with sorting/filtering controls.
 * Relies on common.js for common constants and helper functions.
 */

// Execute script after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- UI Element References ---
    const canvas = document.getElementById('game-canvas'); // The main game canvas element
    // Check if the canvas element exists before getting context
    const ctx = canvas ? canvas.getContext('2d') : null; // The 2D rendering context, null if canvas not found

    const usernameDisplaySpan = document.getElementById('current-username-display'); // Span displaying the current username
    const p1ScoreSpan = document.getElementById('p1-current-score'); // Span displaying the player's current score
    const highScoreElement = document.getElementById('high-score'); // Element displaying the historical high score for the current user
    const survivalTimeSpan = document.getElementById('current-survival-time'); // Span displaying the current game survival time
    const messageElement = document.getElementById('message-area'); // Element for displaying general game messages (e.g., "Game Over")
    const gameResultArea = document.getElementById('game-result-area'); // Element for displaying the final game result summary
    const startButton = document.getElementById('start-button'); // The game start/restart button
    const leaderboardList = document.getElementById('leaderboard-list'); // The ul element for the leaderboard list display
    const difficultyFilterSelect = document.getElementById('difficulty-filter'); // Leaderboard difficulty filter dropdown

    // --- Game State Variables ---
    let player; // Object representing the single snake player (position, score, direction, etc.)
    let food; // Object representing the food position ({x, y})
    let speed = 120; // Game speed in milliseconds (interval between game ticks, lower value means faster snake movement)
    let initialSinglePlayerSpeed = 120; // Stores the speed set by the initial difficulty, used as a baseline for dynamic speed adjustment
    let singlePlayerScoreStepReduction = 5; // Amount speed decreases per point for the current difficulty
    let gameLoopTimeout; // Stores the ID returned by setTimeout, used to cancel the game loop
    let isGameRunning = false; // Flag indicating if the game is currently running
    let gameStartTime = null; // Timestamp (milliseconds) when the current game started (for survival time calculation)
    let currentSurvivalTime = 0; // Current survival time in seconds
    let currentUsername = '玩家'; // Current user's name (read from URL and local storage)
    let gameDifficulty = 'medium'; // Difficulty level selected (read from URL)

    // --- Leaderboard Data ---
    let allLeaderboardEntries = []; // Store all fetched leaderboard entries for filtering/sorting

    // --- Constants for Leaderboard Sorting ---
    // Maps difficulty string values to a numerical order for sorting (higher number means higher difficulty priority in sort)
    // Only includes single-player difficulties as two-player scores are not saved.
    const difficultySortOrder = {
        'hard': 3,
        'medium': 2,
        'easy': 1,
        // 'super_easy': 0 // Super easy is for 2P and not saved
    };

    // --- Leaderboard Display Limit ---
    const LEADERBOARD_DISPLAY_LIMIT = 50; // How many entries to display in the list after filtering/sorting


    // --- Game Initialization ---
    // Sets up the initial game state when the page loads.
    // Reads URL parameters for username and difficulty, sets initial player state,
    // fetches and displays the leaderboard.
    function initSinglePlayer() {
        console.log("Single player game initializing...");

        // Read username and difficulty from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        // Use escapeHTML for username read from URL before displaying
        currentUsername = escapeHTML(urlParams.get('username') || '玩家'); // Get 'username' param or default to '玩家'
        gameDifficulty = urlParams.get('difficulty') || 'medium'; // Get 'difficulty' param or default to 'medium'

        // Set the initial game speed and score step reduction rate based on the selected difficulty level
        setGameSpeed(gameDifficulty);
        initialSinglePlayerSpeed = speed; // Store the speed set by the initial difficulty

        // Update the username display in the UI
        if (usernameDisplaySpan) usernameDisplaySpan.textContent = currentUsername; // Username is already escaped

        // Initialize the player object to its starting state
        player = {
            snake: [{ x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) }], // Initial snake position (center of grid)
            score: 0, // Initial score is zero
            direction: 'right', // Initial movement direction
            nextDirection: 'right', // Next intended direction (same as initial)
            alive: true, // Player starts alive
            color: '#008000', // Snake color (green)
            name: currentUsername, // Player name is the current username
            startTime: null, // Game start time for this player (not strictly necessary in single player but kept for structure)
            survivalTime: 0 // Initial survival time is zero
        };

        // Reset food and game state flags
        food = null; // No food initially
        isGameRunning = false; // Game is not running until Start is clicked
        gameStartTime = null; // Reset start time
        currentSurvivalTime = 0; // Reset survival time

        // Fetch all leaderboard data, store it, and display the list (filtered/sorted by default)
        fetchLeaderboard();

        // Update UI displays to reflect the initial game state
        updateScoreDisplays();
        updateSurvivalTimeDisplay();
        if (messageElement) messageElement.textContent = '按空格键开始游戏'; // Set the initial instruction message
        if (gameResultArea) gameResultArea.textContent = ''; // Clear any previous game results
        if (startButton) {
            startButton.textContent = '开始游戏'; // Set the start button text
            startButton.disabled = false; // Ensure the start button is enabled
        }

        // Clear any potentially existing game loop timeout from a previous session/page load
        if (gameLoopTimeout) {
            clearTimeout(gameLoopTimeout);
        }

        // Perform initial drawing of the game board (empty) and the snake
        draw();

        // Select the '相同难度' option in the filter dropdown by default
        if (difficultyFilterSelect) {
            difficultyFilterSelect.value = 'current'; // Set the value to 'current'
            // The initial call to displayLeaderboard(allLeaderboardEntries) in fetchLeaderboard
            // will handle filtering/sorting based on this default value.
        }

        console.log(`Single player game initialized for user: ${currentUsername}, Difficulty: ${gameDifficulty}, Initial Speed: ${initialSinglePlayerSpeed}ms, Speed Step: ${singlePlayerScoreStepReduction}ms/point`);
    }

    // --- Game Speed Configuration ---
    // Sets the initial global 'speed' variable and the score step reduction rate
    // based on the selected single player difficulty level.
    // This function is typically called only once during initialization and at the start of a new game.
    // Dynamic speed changes based on score happen in the update function using the determined step rate.
    // difficulty: string - The difficulty level ('easy', 'medium', 'hard').
    function setGameSpeed(difficulty) {
        switch (difficulty) {
            case 'easy':
                speed = 180; // Slower initial speed (longer interval)
                singlePlayerScoreStepReduction = 3; // Small speed increase per point
                break;
            case 'hard':
                speed = 80; // Faster initial speed (shorter interval)
                singlePlayerScoreStepReduction = 7; // Large speed increase per point
                break;
            case 'medium':
            default:
                speed = 120; // Default (medium) initial speed
                singlePlayerScoreStepReduction = 5; // Medium speed increase per point
                break;
        }
    }


    // --- Food Generation ---
    // Generates a new food position on the game grid.
    // Ensures the new food position does not overlap with the snake's current position.
    function generateFood() {
        let newFoodPosition;
        // Ensure player and snake exist before generating food
        if (!player || !Array.isArray(player.snake)) {
            console.error("Player or snake not initialized, cannot generate food.");
            food = null; // Ensure food is null if player isn't ready
            return;
        }
        do {
            // Generate random integer grid coordinates within bounds
            newFoodPosition = {
                x: Math.floor(Math.random() * GRID_WIDTH), // Random x-coordinate
                y: Math.floor(Math.random() * GRID_HEIGHT) // Random y-coordinate
            };
        } while (isPositionOnSnake(newFoodPosition, player.snake)); // Keep generating until the position is not occupied by the snake (using common helper)
        food = newFoodPosition; // Assign the valid, non-overlapping food position
        console.log("Food generated at:", food);
    }


    // --- API Interaction (Leaderboard) ---
    // Fetches the leaderboard data from the backend API.
    // Stores all fetched entries and updates the difficulty-specific high score.
    // Then calls displayLeaderboard to render the list based on the current filter.
    async function fetchLeaderboard() {
        // Exit the function if leaderboard elements are not found on the page
        if (!leaderboardList || !highScoreElement || !difficultyFilterSelect) return;

        console.log("Fetching leaderboard...");
        try {
            // Send a GET request to the defined leaderboard API endpoint URL
            // Note: Backend GetSortedLeaderboard limits results (default 100).
            // If you need *all* entries for filtering, backend limit should be larger or removed.
            const response = await fetch(LEADERBOARD_API_URL);
            // Check if the HTTP response status indicates success (status code 2xx)
            if (!response.ok) {
                console.error(`HTTP error! status: ${response.status}`); // Log the HTTP status error
                const errorText = await response.text(); // Read the error response body
                console.error("Error response body:", errorText); // Log the error body
                throw new Error(`HTTP error! status: ${response.status}`); // Throw an error
            }
            // Parse the JSON response body into an array of entries
            const fetchedEntries = await response.json();
            console.log("Received leaderboard data:", fetchedEntries); // Log the received data

            // Store the fetched entries globally for filtering
            allLeaderboardEntries = fetchedEntries;

            // --- Find and display the current user's highest score FOR THE CURRENT DIFFICULTY ---
            let maxScoreForCurrentUserDifficulty = 0; // Initialize max score for current user/difficulty to 0
            const currentUserLower = currentUsername.toLowerCase(); // Get lowercase username for case-insensitive comparison

            // Mapping difficulty value to Chinese name for display (consistent with displayLeaderboard)
            const difficultyNames = {
                'easy': '简单',
                'medium': '中等',
                'hard': '困难',
                // 'super_easy': '超简单' // Super easy is for 2P and not saved
            };
            const currentDifficultyName = difficultyNames[gameDifficulty] || gameDifficulty; // Get Chinese name or use value as fallback


            // Filter entries to find those belonging to the current user AND matching the current difficulty
            const userEntriesForCurrentDifficulty = allLeaderboardEntries.filter(entry =>
                entry.username && entry.username.toLowerCase() === currentUserLower &&
                entry.difficulty === gameDifficulty // Assuming backend stores 'difficulty' field matching the value
            );

            // Find the maximum score among these filtered entries
            if (userEntriesForCurrentDifficulty.length > 0) {
                maxScoreForCurrentUserDifficulty = Math.max(...userEntriesForCurrentDifficulty.map(entry => entry.score));
            } else {
                maxScoreForCurrentUserDifficulty = 0; // Set to 0 if no entries found for this user/difficulty
            }

            // Update the UI element that displays the high score for the current user/difficulty
            if (highScoreElement) highScoreElement.textContent = `${maxScoreForCurrentUserDifficulty}（${currentDifficultyName}）`;
            // --- End finding user high score for current difficulty ---


            // Display the leaderboard list based on the currently selected filter (default is 'current')
            displayLeaderboard(allLeaderboardEntries);

            console.log("Leaderboard loaded and displayed."); // Log success message
        } catch (error) {
            console.error("Error fetching leaderboard:", error); // Log any error that occurred during fetching
            // Display an error message to the user in the UI
            if (messageElement) messageElement.textContent = "无法加载排行榜";
            // Clear the leaderboard list and set high score display on error
            if (leaderboardList) leaderboardList.innerHTML = '<li>无法加载排行榜</li>';
            if (highScoreElement) {
                const difficultyNames = { 'easy': '简单', 'medium': '中等', 'hard': '困难', 'super_easy': '超简单' };
                const currentDifficultyName = difficultyNames[gameDifficulty] || gameDifficulty;
                highScoreElement.textContent = `0（${currentDifficultyName}）`; // Show 0 for current difficulty on error
            }
            allLeaderboardEntries = []; // Clear stored entries on error
        }
    }

    // Submits the current player's game score to the backend API via a POST request.
    // Includes game difficulty in the submitted data.
    // entry: Object containing the core score data ({ Username, Score, SurvivalTime, Timestamp }).
    async function submitScore(entry) {
        console.log("Submitting score...", entry); // Log the entry being submitted
        try {
            // Create the full submission entry object, including game difficulty
            const submissionEntry = {
                Username: entry.Username,
                Score: entry.Score,
                SurvivalTime: entry.SurvivalTime,
                Timestamp: entry.Timestamp,
                Difficulty: gameDifficulty // Add the current game difficulty to the submitted data
            };

            // Send a POST request to the defined leaderboard API endpoint URL
            const response = await fetch(LEADERBOARD_API_URL, {
                method: 'POST', // Specify the HTTP method as POST
                headers: {
                    'Content-Type': 'application/json', // Indicate that the request body is in JSON format
                },
                body: JSON.stringify(submissionEntry), // Convert the full submission entry object to a JSON string
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
            // This will refetch all data and trigger a redisplay with the current filter.
            fetchLeaderboard();

        } catch (error) {
            console.error("Error submitting score:", error); // Log any error that occurred during submission
            // Display an error message to the user in the UI
            if (messageElement) messageElement.textContent = "无法保存得分记录";
        }
    }

    // Displays the fetched leaderboard entries in the UI list (#leaderboard-list)
    // after applying the current filter and sorting.
    // allEntries: The full array of all fetched leaderboard entry objects.
    function displayLeaderboard(allEntries) {
        // Exit the function if leaderboard elements are not found
        if (!leaderboardList || !difficultyFilterSelect) return;

        // Clear the current content of the leaderboard list
        leaderboardList.innerHTML = '';

        // Ensure allEntries is a valid array
        if (!Array.isArray(allEntries)) {
            console.error("displayLeaderboard received invalid data:", allEntries);
            leaderboardList.innerHTML = '<li>排行榜数据格式错误</li>';
            return;
        }

        // Get the currently selected filter value from the dropdown
        const selectedFilterValue = difficultyFilterSelect.value;

        // Filter the entries based on the selected filter value
        let filteredEntries = [];
        switch (selectedFilterValue) {
            case 'all':
                filteredEntries = allEntries; // Show all entries
                break;
            case 'current':
                // Filter for entries matching the current game difficulty
                filteredEntries = allEntries.filter(entry => entry.difficulty === gameDifficulty);
                break;
            case 'easy':
                filteredEntries = allEntries.filter(entry => entry.difficulty === 'easy');
                break;
            case 'medium':
                filteredEntries = allEntries.filter(entry => entry.difficulty === 'medium');
                break;
            case 'hard':
                filteredEntries = allEntries.filter(entry => entry.difficulty === 'hard');
                break;
            default:
                filteredEntries = allEntries; // Default to showing all if filter value is unexpected
                console.warn(`Unexpected filter value: ${selectedFilterValue}. Showing all entries.`);
                break;
        }


        // --- Sort the filtered entries ---
        // Sort first by difficulty (hardest first), then by score (highest), then by survival time (longest)
        filteredEntries.sort((a, b) => {
            // Handle potential null entries or difficulty strings
            const aDifficulty = a?.difficulty ?? '';
            const bDifficulty = b?.difficulty ?? '';

            // Get numerical sort order for difficulties (higher is harder/higher priority)
            // Use -1 for unknown difficulty or difficulties not in the map (like super_easy if it somehow got in)
            // to put them at the end of the difficulty sorting.
            const orderA = difficultySortOrder[aDifficulty] ?? -1;
            const orderB = difficultySortOrder[bDifficulty] ?? -1;

            // 1. Primary sort: Difficulty (Descending)
            if (orderB !== orderA) {
                return orderB - orderA; // Sort by numerical order descending
            }

            // If difficulties are the same or not mapped, sort by score
            // Handle potential null scores
            const aScore = a?.score ?? 0;
            const bScore = b?.score ?? 0;
            // 2. Secondary sort: Score (Descending)
            if (bScore !== aScore) {
                return bScore - aScore; // Sort by score descending
            }

            // If scores are tied, sort by survival time
            // Handle potential null survival times
            const aSurvivalTime = a?.survivalTime ?? 0;
            const bSurvivalTime = b?.survivalTime ?? 0;
            // 3. Tertiary sort: Survival Time (Descending)
            if (bSurvivalTime !== aSurvivalTime) {
                return bSurvivalTime - aSurvivalTime; // Sort by survival time descending
            }

            // If score and time are tied, return 0 (maintain original relative order or arbitrary)
            return 0;
        });
        // --- End Sorting ---


        // Limit the number of entries displayed after filtering and sorting
        const entriesToDisplay = filteredEntries.slice(0, LEADERBOARD_DISPLAY_LIMIT);

        // Display a message if the filtered list of entries is empty
        if (entriesToDisplay.length === 0) {
            leaderboardList.innerHTML = '<li>当前筛选条件下暂无记录</li>';
            return;
        }

        // Mapping difficulty value to Chinese name for display in the list (consistent with fetchLeaderboard)
        const difficultyNames = {
            // 'super_easy': '超简单', // Removed as per requirement
            'easy': '简单',
            'medium': '中等',
            'hard': '困难'
        };

        // Iterate through the entries to display and add them to the list
        entriesToDisplay.forEach((entry) => { // Removed index as it's not used
            if (!entry) return; // Skip null or undefined entries

            const listItem = document.createElement('li'); // Create a new list item element for this entry
            // Escape HTML special characters for safety, handle potential nulls
            const safeUsername = escapeHTML(entry.username ?? '');
            const safeScore = escapeHTML(entry.score ?? 0);
            const safeTime = escapeHTML(entry.survivalTime ?? 0);
            // Get the display name for difficulty, fallback to value or '未知' if not in map, handle null
            const safeDifficultyName = escapeHTML(difficultyNames[entry.difficulty ?? ''] || entry.difficulty || '未知');


            // Create the HTML structure for a 2-line list item entry:
            // First line: Username (bold, left-aligned)
            // Second line: Score (left) and Time (right) and Difficulty annotation
            listItem.innerHTML = `
                 <div class="leaderboard-entry-username">${safeUsername}</div>
                 <div class="leaderboard-entry-score-time">
                     <span class="score">得分: ${safeScore}</span>
                     <span class="time">时长: ${safeTime}s</span>
                     <span class="difficulty-annotation">(${safeDifficultyName})</span> </div>
             `;

            leaderboardList.appendChild(listItem); // Add the list item to the UL
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
        // The 'speed' variable is dynamically updated in the 'update' function based on score.
        gameLoopTimeout = setTimeout(() => {
            update(); // Call the function to update the game state (move snake, check collisions, etc.)
            draw(); // Call the function to redraw the canvas with the updated state

            // Check game continuation conditions:
            // Continue the loop if the player is still alive AND the gameRunning flag is true.
            if (player && player.alive && isGameRunning) {
                gameLoop(); // Recursively call gameLoop for the next tick.
            } else if (isGameRunning) { // If the player is no longer alive, but the game is still marked as running (meaning game just ended).
                gameOver(); // End the game.
            }

        }, speed); // The delay for the setTimeout is set by the global 'speed' variable (controlled by difficulty and score).
    }

    // --- Game State Update ---
    // Updates the position of the snake, checks for collisions (wall, self), and food consumption.
    // Dynamically adjusts game speed based on the player's score using a common helper function
    // and the difficulty-specific step rate.
    function update() {
        // Exit the function early if player or snake are not valid or player is not alive.
        if (!player || !Array.isArray(player.snake) || player.snake.length === 0 || !player.alive) return;

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
            default: console.warn("Unknown direction:", player.direction); return; // Handle unknown direction
        }

        // Check for collisions with walls or the snake's own body using common helper functions.
        if (checkWallCollision(head) || checkSelfCollision(head, player.snake)) {
            console.log(`${player.name} collided with wall or self.`); // Log the collision
            player.alive = false; // Mark the player as not alive if a collision occurs.
            // No return here, allow drawing the dead snake state
        } else {
            // If no collision, proceed with food check and movement
            // Check if the snake's potential next head position overlaps with the food position.
            // --- Corrected food collision check ---
            if (food && head.x === food.x && head.y === food.y) {
                player.score++; // Increase the player's score.
                generateFood(); // Generate new food using the single-player specific function.

                // --- Adjust speed based on score using common helper function and difficulty-specific step ---
                // Calculate the new speed based on the initial speed, current score, and the mode's reduction rate per point.
                speed = calculateDynamicSpeed(initialSinglePlayerSpeed, player.score, singlePlayerScoreStepReduction);
                console.log(`Score increased to ${player.score}, new speed: ${speed}ms`); // Log the score and new speed
                // --- End speed adjustment ---

            } else {
                // If no food was eaten in this tick, remove the last segment of the snake's body.
                // This simulates the snake moving forward without growing.
                player.snake.pop();
            }

            // Add the new head segment to the beginning (front) of the snake's body array.
            player.snake.unshift(head);
        }


        // Update the score display in the UI to reflect any score change.
        updateScoreDisplays();

        // If the player just died in this update tick, call gameOver
        if (!player.alive && isGameRunning) {
            gameOver();
        }
    }

    // --- Drawing ---
    // Clears the canvas and redraws all game elements (background, food, snake) based on the current game state.
    function draw() {
        // Ensure canvas context is available
        if (!ctx) return;

        // Clear the entire canvas by filling it with the background color.
        ctx.fillStyle = '#e0e0e0'; // Set the fill color for the background.
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Fill the rectangle covering the entire canvas dimensions.

        // Draw the food on the canvas if the 'food' object is not null.
        if (food) {
            drawRect(ctx, food.x, food.y, 'red'); // Use the common helper function to draw a red rectangle at the food's grid coordinates.
        }

        // Draw the snake segments.
        if (player && Array.isArray(player.snake)) { // Ensure player and snake exist and snake is an array
            if (player.alive) {
                // If the player is alive, iterate through the snake's segments and draw them with the player's color.
                player.snake.forEach((segment, index) => {
                    if (segment) { // Ensure segment is not null/undefined
                        // Darken the color specifically for the head segment (index 0) for visual distinction.
                        const color = (index === 0) ? darkenColor(player.color, 20) : player.color; // Use the common helper function to darken the color.
                        drawRect(ctx, segment.x, segment.y, color); // Use the common helper function to draw the snake segment at its grid coordinates.
                    }
                });
            } else {
                // If the player is not alive (game over state), draw the snake in grey.
                player.snake.forEach(segment => {
                    if (segment) { // Ensure segment is not null/undefined
                        drawRect(ctx, segment.x, segment.y, '#888888'); // Use the common helper function to draw a grey rectangle for the segment.
                    }
                });
            }
        }
    }

    // Updates the player's current score display element in the UI.
    function updateScoreDisplays() {
        // Check if the score display element exists before updating its text content.
        if (p1ScoreSpan && player) p1ScoreSpan.textContent = player.score;
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
        currentSurvivalTime = 0; // Reset current survival time counter
        if (messageElement) messageElement.textContent = ''; // Clear previous messages in the UI
        if (gameResultArea) gameResultArea.textContent = ''; // Clear previous game results display
        if (startButton) {
            startButton.textContent = '进行中...'; // Update the start button text
            startButton.disabled = true; // Disable the start button while the game is in progress
        }

        generateFood(); // Generate the first food item for the new game

        // Reset speed to the initial difficulty speed and set the step rate at the start of a new game
        setGameSpeed(gameDifficulty);
        initialSinglePlayerSpeed = speed; // Ensure initial speed is correctly stored for the new game

        gameLoop(); // Start the main game loop execution
    }

    // Ends the current single player game. Handles score submission, results display, and UI reset.
    // Includes game difficulty in the submitted leaderboard data.
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
        if (gameStartTime && player) { // Ensure player exists
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000); // Calculate total time elapsed in seconds
            updateSurvivalTimeDisplay(); // Final update to display the total time in the UI
            player.survivalTime = currentSurvivalTime; // Store the final time in the player object
        }

        // Display game over messages and results in the UI.
        if (messageElement) messageElement.textContent = `游戏结束!`; // Set game over message
        if (startButton) {
            startButton.disabled = false; // Enable the start button for restart
            startButton.textContent = '重新开始'; // Update start button text for restarting
        }

        // Create the score entry object containing game results for submission.
        // Includes game difficulty.
        if (player) { // Only submit if player object is valid
            const singlePlayerEntry = {
                Username: player.name,
                Score: player.score,
                SurvivalTime: player.survivalTime,
                Timestamp: new Date().toISOString(), // Record current timestamp in ISO format
                Difficulty: gameDifficulty // Add the current game difficulty to the submitted data
            };

            // Submit the score entry to the backend leaderboard API.
            // This function also triggers a leaderboard refresh after successful submission,
            // which will update the difficulty-specific high score display and the list.
            submitScore(singlePlayerEntry);
        } else {
            console.error("Player object not valid, cannot submit score.");
        }


        // Display the final score and time in the results area of the UI.
        if (gameResultArea && player) { // Ensure gameResultArea and player exist
            gameResultArea.innerHTML = `<h3>最终得分</h3><p>${escapeHTML(player.name)}: 得分 ${escapeHTML(player.score)}, 游戏时长 ${escapeHTML(player.survivalTime)}s</p>`; // Escape HTML here too
        }


        // Perform a final draw to show the snake in a grey color, indicating game over state.
        draw();

        // Add a prompt message instructing the user how to start a new game.
        if (messageElement) messageElement.textContent += ' 按空格键开始新游戏';
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
        if (!isGameRunning || !player || !player.alive) return;

        let requestedDirection = null; // Variable to store the intended new direction based on the key press.

        // Check for Arrow Key presses to determine requested direction.
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

    // --- Add event listener for difficulty filter dropdown ---
    // When the filter selection changes, re-display the leaderboard using the stored data.
    if (difficultyFilterSelect) {
        difficultyFilterSelect.addEventListener('change', () => {
            // Pass the full set of fetched entries to the display function
            displayLeaderboard(allLeaderboardEntries);
        });
    }
    // --- End filter event listener ---

});