## Greedy Snake Game: Detailed API and Frontend Logic (Including Samples and Code)

This verbose explanation covers the backend API implemented with ASP.NET Core and the frontend game logic built using HTML5 Canvas and JavaScript.

### Backend Web API: Detailed Explanation

The backend serves as a persistent storage and retrieval system for single-player high scores. It's built with a standard ASP.NET Core structure, separating concerns into Controllers, Services, and Models.

#### 1. Data Models (`Models` folder)

The data models define the shape of the information managed by the application.

* **`LeaderboardEntry.cs`**: Represents a single record in the leaderboard.

    ```csharp
    namespace GreedySnake.Models;

    public class LeaderboardEntry
    {
        public string Username { get; set; } // Player's name
        public int Score { get; set; } // Score achieved
        public int SurvivalTime { get; set; } // Survival time in seconds
        public DateTime Timestamp { get; set; } // When the score was achieved
        public string Difficulty { get; set; } // Difficulty level (e.g., "easy", "medium", "hard")

        public LeaderboardEntry() // Parameterless constructor for JSON deserialization
        {
            Username = string.Empty; // Initialize to avoid null reference
            Difficulty = string.Empty; // Initialize to avoid null reference
        }
    }
    ```

    * **Purpose:** This model is used throughout the backend service and controller to represent the data structure for individual scores. It's also the format expected by the frontend when submitting a score and received by the frontend when fetching the leaderboard.
    * The `Difficulty` property is crucial for the single-player leaderboard, allowing scores to be filtered and compared by the game difficulty.
    * The parameterless constructor is required by `System.Text.Json` (the default JSON serializer in ASP.NET Core) to be able to create an instance of the class when deserializing JSON from the request body or the storage file.

* **`Leaderboard.cs`**: Acts as a wrapper for the list of entries, which is convenient for serializing/deserializing the entire leaderboard structure to/from a file.

    ```csharp
    namespace GreedySnake.Models;

    public class Leaderboard
    {
        public List<LeaderboardEntry> Entries { get; set; } = new List<LeaderboardEntry>(); // The collection of all leaderboard entries
    }
    ```

    * **Purpose:** This model is primarily used internally by the `LeaderboardService` to represent the complete set of data read from or written to the `leaderboard.json` file.

* **`ScoreData.cs`**: (As noted before, this model is present but not actively used in the provided backend code.)

#### 2. Leaderboard Service (`Services/LeaderboardService.cs`)

This service class contains the core business logic for the leaderboard, including file-based persistence and score management rules.

* **File Persistence (`_filePath`, `_lock`):** The service maintains the leaderboard data in a `leaderboard.json` file. A `static readonly object _lock` is used to synchronize access to this file across different threads or requests, preventing race conditions and potential data corruption when multiple clients try to read or write simultaneously.

    ```csharp
        private readonly string _filePath;
        private static readonly object _lock = new object(); // For thread safety when accessing the file
        private readonly ILogger<LeaderboardService> _logger;
        // ... constructor and other members ...
    ```

* **Loading Data (`LoadLeaderboard`):** This method reads the JSON file and deserializes it into a `Leaderboard` object. It's designed to be robust against missing or corrupted files.

    ```csharp
    private Leaderboard LoadLeaderboard()
    {
        lock (_lock) // Acquire the lock before file access
        {
            try
            {
                // Check file existence and size, initialize if needed
                if (!File.Exists(_filePath) || new FileInfo(_filePath).Length == 0)
                {
                    _logger.LogWarning($"Leaderboard file not found or is empty at {_filePath}. Attempting initialization.");
                    InitializeLeaderboardFile();
                    // Re-read after initialization
                    string jsonAfterInit = File.ReadAllText(_filePath);
                    var dataAfterInit = JsonSerializer.Deserialize<Leaderboard>(jsonAfterInit);
                    return dataAfterInit ?? new Leaderboard { Entries = new List<LeaderboardEntry>() };
                }

                // File exists and is not empty, read and deserialize
                string json = File.ReadAllText(_filePath);
                var data = JsonSerializer.Deserialize<Leaderboard>(json);

                // Handle potential null data or entries list
                if (data == null || data.Entries == null)
                {
                    _logger.LogWarning($"Leaderboard file at {_filePath} deserialized to null or had null entries. Returning new empty leaderboard.");
                    // Optionally backup corrupted file here
                    return new Leaderboard { Entries = new List<LeaderboardEntry>() };
                }

                return data; // Successfully loaded
            }
            catch (JsonException jsonEx)
            {
                _logger.LogError(jsonEx, $"Error reading or parsing leaderboard JSON from {_filePath}. Returning empty leaderboard.");
                // Optionally backup corrupted file here and attempt re-initialization
                 InitializeLeaderboardFile();
                return new Leaderboard { Entries = new List<LeaderboardEntry>() };
            }
            // ... other catch blocks for IOException and Exception ...
        } // Release the lock
    }
    ```

    * **Explanation:** The `lock (_lock)` block is critical. It ensures that while one request is reading the file, no other request can write to it (or read it in a potentially inconsistent state), and vice versa. The method handles various failure scenarios during file reading and JSON parsing, returning a new empty leaderboard as a fallback to prevent application failure.

* **Saving Data (`SaveLeaderboard`):** This method serializes a `Leaderboard` object to JSON and writes it to the file.

    ```csharp
    private void SaveLeaderboard(Leaderboard leaderboard)
    {
        lock (_lock) // Acquire the lock before file access
        {
            try
            {
                // Optional: Can sort entries here before saving if needed, but it's done during Get
                string json = JsonSerializer.Serialize(leaderboard, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
                _logger.LogInformation($"Leaderboard saved. Total entries: {leaderboard.Entries.Count}");
            }
            catch (IOException ioEx)
            {
                _logger.LogError(ioEx, $"IO Error writing leaderboard file to {_filePath}.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error saving leaderboard to {_filePath}.");
            }
        } // Release the lock
    }
    ```

    * **Explanation:** Similar to `LoadLeaderboard`, the `lock (_lock)` ensures exclusive access during the write operation. The data is serialized with `WriteIndented = true` for human-readable JSON in the file.

* **Adding Score Entry (`AddScoreEntry`):** This is the core logic for processing a new score submission from a single-player game. It enforces the rule that only the highest score per user and difficulty is kept.

    ```csharp
    public void AddScoreEntry(LeaderboardEntry newEntry)
    {
        // Basic validation
        if (newEntry == null || string.IsNullOrWhiteSpace(newEntry.Username) || newEntry.Score < 0 || newEntry.SurvivalTime < 0 || string.IsNullOrWhiteSpace(newEntry.Difficulty))
        {
            _logger.LogWarning("Attempted to add invalid leaderboard entry (missing username, score, time, or difficulty).");
            return;
        }

        // Set timestamp if not provided (frontend provides it, which is fine)
        if (newEntry.Timestamp == default)
        {
            newEntry.Timestamp = DateTime.UtcNow; // Use server-side time as a fallback or primary if desired
        }

        lock (_lock) // Synchronize access to the leaderboard data
        {
            var leaderboard = LoadLeaderboard(); // Load current data

            // Find if an entry with the SAME USERNAME AND SAME DIFFICULTY already exists
            var existingEntry = leaderboard.Entries
                .FirstOrDefault(e =>
                    e != null &&
                    string.Equals(e.Username, newEntry.Username, StringComparison.OrdinalIgnoreCase) && // Case-insensitive username comparison
                    string.Equals(e.Difficulty, newEntry.Difficulty, StringComparison.OrdinalIgnoreCase)); // Case-insensitive difficulty comparison

            if (existingEntry != null)
            {
                // Existing entry found for this user and difficulty
                if (newEntry.Score > existingEntry.Score)
                {
                    // New score is higher - update the existing entry
                    existingEntry.Score = newEntry.Score;
                    existingEntry.SurvivalTime = newEntry.SurvivalTime;
                    existingEntry.Timestamp = newEntry.Timestamp; // Update timestamp to the latest submission
                    _logger.LogInformation($"Updated leaderboard entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}) with higher score: {newEntry.Score}.");
                    SaveLeaderboard(leaderboard); // Save the updated list
                }
                else if (newEntry.Score == existingEntry.Score && newEntry.SurvivalTime > existingEntry.SurvivalTime)
                {
                    // Scores are tied, but new survival time is longer - update the existing entry
                    existingEntry.SurvivalTime = newEntry.SurvivalTime;
                    existingEntry.Timestamp = newEntry.Timestamp; // Update timestamp
                    _logger.LogInformation($"Updated leaderboard entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}) with same score ({newEntry.Score}) but longer survival time: {newEntry.SurvivalTime}s.");
                    SaveLeaderboard(leaderboard); // Save the updated list
                }
                else
                {
                    // New score is not higher, and time is not longer - ignore the new entry
                    _logger.LogInformation($"Ignoring score entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}). Existing score {existingEntry.Score} is higher or equal, or survival time is not longer.");
                }
            }
            else
            {
                // No existing entry for this user and difficulty - add the new entry
                leaderboard.Entries.Add(newEntry);
                _logger.LogInformation($"Added new leaderboard entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}) score {newEntry.Score}.");
                SaveLeaderboard(leaderboard); // Save the list with the new entry
            }
        } // Release the lock
    }
    ```

    * **Explanation:** This method implements the core logic for maintaining the "highest score per user per difficulty" rule. The use of `lock (_lock)` is essential here because it's a read-modify-write operation on the shared `leaderboard.json` file. It first loads the data, then performs the comparison and potential update/add, and finally saves the modified data.

* **Getting Sorted Leaderboard (`GetSortedLeaderboard(int limit)`):** This method provides the data to the frontend for display.

    ```csharp
    public List<LeaderboardEntry> GetSortedLeaderboard(int limit = 100)
    {
        var leaderboard = LoadLeaderboard(); // Load current data
        // Sort by Score descending, then SurvivalTime descending
        var sortedEntries = leaderboard.Entries
            .OrderByDescending(e => e.Score)
            .ThenByDescending(e => e.SurvivalTime)
            .Take(limit) // Take the top N entries based on limit
            .ToList();
        return sortedEntries; // Return the sorted and limited list
    }
    ```

    * **Explanation:** This method loads the data and performs an initial sort by score and survival time. The `limit` parameter restricts the number of entries returned by the API. While the frontend will perform its own filtering and sorting (especially by difficulty), this backend sorting provides a reasonable default order and limits the amount of data transferred.

#### 3. Leaderboard Controller (`Controllers/LeaderboardController.cs`)

The controller acts as the interface between HTTP requests from the frontend and the `LeaderboardService`.

* **Dependency Injection:** The `LeaderboardService` is injected in the constructor, making it available for use in the action methods.

    ```csharp
    private readonly LeaderboardService _leaderboardService;

    public LeaderboardController(LeaderboardService leaderboardService)
    {
        _leaderboardService = leaderboardService;
    }
    ```

* **GET Endpoint (`GET /api/leaderboard`):** Handles requests to retrieve leaderboard data.

    ```csharp
    [HttpGet]
    public ActionResult<List<LeaderboardEntry>> Get([FromQuery] int limit = 50) // limit from query string, default 50
    {
        try
        {
            // Call the service to get sorted entries
            var leaderboard = _leaderboardService.GetSortedLeaderboard(limit);
            // Return 200 OK with the list of entries as JSON
            return Ok(leaderboard);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error in GET /api/leaderboard: {ex.Message}");
            // Return 500 Internal Server Error on exception
            return StatusCode(500, "Internal server error retrieving leaderboard");
        }
    }
    ```

    * **Sample Request:**
        ```http
        GET /api/leaderboard?limit=20 HTTP/1.1
        Host: localhost:5155 # Or your application's host/port
        ```
        or just
        ```http
        GET /api/leaderboard HTTP/1.1
        Host: localhost:5155 # Default limit (50) will be used
        ```
    * **Sample Response (200 OK):**
        ```json
        [
          {
            "username": "Alice",
            "score": 150,
            "survivalTime": 120,
            "timestamp": "2023-10-27T10:00:00Z",
            "difficulty": "hard"
          },
          {
            "username": "Bob",
            "score": 120,
            "survivalTime": 150,
            "timestamp": "2023-10-27T10:05:00Z",
            "difficulty": "medium"
          },
          {
            "username": "Alice",
            "score": 100,
            "survivalTime": 90,
            "timestamp": "2023-10-27T09:50:00Z",
            "difficulty": "medium"
          }
          // ... more entries up to the limit
        ]
        ```
    * **Sample Response (500 Internal Server Error):**
        ```http
        HTTP/1.1 500 Internal Server Error
        Content-Type: text/plain; charset=utf-8

        Internal server error retrieving leaderboard
        ```

* **POST Endpoint (`POST /api/leaderboard`):** Handles requests to submit a new score.

    ```csharp
    [HttpPost]
    public IActionResult Post([FromBody] LeaderboardEntry entry) // Expects LeaderboardEntry in the request body
    {
        // Basic validation of the incoming data
        if (entry == null || string.IsNullOrWhiteSpace(entry.Username) || entry.Score < 0 || entry.SurvivalTime < 0 || string.IsNullOrWhiteSpace(entry.Difficulty))
        {
            // Return 400 Bad Request if validation fails
            return BadRequest("Invalid leaderboard entry provided.");
        }

        try
        {
            // Call the service to add/update the score entry
            _leaderboardService.AddScoreEntry(entry);
            // Return 200 OK with a success message
            return Ok(new { message = "Score entry added to leaderboard." });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error in POST /api/leaderboard: {ex.Message}");
            // Return 500 Internal Server Error on exception
            return StatusCode(500, "Internal server error adding score entry");
        }
    }
    ```

    * **Sample Request:**
        ```http
        POST /api/leaderboard HTTP/1.1
        Host: localhost:5155 # Or your application's host/port
        Content-Type: application/json

        {
          "username": "Charlie",
          "score": 75,
          "survivalTime": 60,
          "timestamp": "2023-10-27T10:30:00Z",
          "difficulty": "easy"
        }
        ```
    * **Sample Response (200 OK):**
        ```json
        {
          "message": "Score entry added to leaderboard."
        }
        ```
    * **Sample Response (400 Bad Request):**
        ```http
        HTTP/1.1 400 Bad Request
        Content-Type: text/plain; charset=utf-8

        Invalid leaderboard entry provided.
        ```
    * **Sample Response (500 Internal Server Error):**
        ```http
        HTTP/1.1 500 Internal Server Error
        Content-Type: text/plain; charset=utf-8

        Internal server error adding score entry
        ```

* **DELETE Endpoint (`DELETE /api/leaderboard/clear`):** Handles requests to clear the leaderboard.

    ```csharp
    [HttpDelete("clear")] // Route includes "clear" segment
    public IActionResult Clear()
    {
        try
        {
            // Call the service to clear the leaderboard
            _leaderboardService.ClearLeaderboard();
            // Return 200 OK with a success message
            return Ok(new { message = "Leaderboard cleared." });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error in DELETE /api/leaderboard/clear: {ex.Message}");
            // Return 500 Internal Server Error on exception
            return StatusCode(500, "Internal server error clearing leaderboard");
        }
    }
    ```

    * **Sample Request:**
        ```http
        DELETE /api/leaderboard/clear HTTP/1.1
        Host: localhost:5155 # Or your application's host/port
        ```
    * **Sample Response (200 OK):**
        ```json
        {
          "message": "Leaderboard cleared."
        }
        ```
    * **Sample Response (500 Internal Server Error):**
        ```http
        HTTP/1.1 500 Internal Server Error
        Content-Type: text/plain; charset=utf-8

        Internal server error clearing leaderboard
        ```

#### 4. Program.cs (Detailed Role)

`Program.cs` is the application's bootstrapping file. It sets up the web server (Kestrel), configures essential services, and defines the middleware pipeline that processes incoming HTTP requests.

* **Host Configuration:** `WebApplication.CreateBuilder` sets up the basic host, including configuring it to serve static files from the `wwwroot` directory (`WebRootPath = "wwwroot"`).
* **Service Registration (Dependency Injection Container):** The code uses `builder.Services` to register components that the application needs.
    * `builder.Services.AddControllers();`: This line makes the application aware of and able to use controllers defined in the project (like `LeaderboardController`). It registers necessary services for routing, model binding, etc.
    * `builder.Services.AddCors(...)`: This is crucial for web applications where the frontend (served from `wwwroot`, potentially on a different port or even host during development) needs to make requests to the backend API. The "AllowAll" policy is very permissive and allows any origin to access the API, which is useful for local development but a security risk in production where specific origins should be listed.
    * `builder.Services.AddSingleton<LeaderboardService>();`: This registers the `LeaderboardService` in the dependency injection container. The `Singleton` lifetime means that only *one* instance of `LeaderboardService` will be created for the entire application lifetime and shared among all requests that require it. This is appropriate here because the service manages a shared resource (`leaderboard.json`) and uses internal synchronization (`_lock`).
    * `builder.Services.AddSwaggerGen()`: This sets up the services needed to generate OpenAPI documentation (Swagger).
* **Logging Configuration:** `builder.Logging` is configured to output logs to the console and debug window, which is helpful for monitoring application activity and diagnosing issues.
* **Middleware Pipeline:** `app.Use...` methods define the order in which request handlers (middleware) are executed for each incoming request.
    * `app.UseSwagger()` and `app.UseSwaggerUI()`: These middlewares enable the Swagger UI, typically accessible at `/swagger` and `/swagger-ui`, providing a web-based interface to view and test the API endpoints.
    * `app.UseDefaultFiles()`: If a request is made to a directory (e.g., `/` or `/singleplayer`), this middleware looks for default files like `index.html`, `default.html`, etc., in that directory and serves them.
    * `app.UseStaticFiles()`: This middleware serves static content (HTML, CSS, JavaScript, images, etc.) directly from the `wwwroot` folder. Requests matching files in `wwwroot` are handled here and don't proceed further down the pipeline to controllers.
    * `app.UseCors("AllowAll")`: Applies the configured CORS policy. This middleware checks the `Origin` header of incoming requests and adds appropriate `Access-Control-...` headers to the response if the request is allowed by the policy.
    * `app.UseAuthorization()`: This middleware checks if the user is authorized to access a resource. While present, no authorization logic is implemented in the provided code.
    * `app.MapControllers()`: This middleware is responsible for routing requests to the appropriate controller action method based on the request URL and HTTP method.
* **Server URL Logging (`LogServerAccessUrls`):** This custom function, triggered on application startup, introspects the application's listening addresses and logs them to the console. This is a helpful development feature to see which URLs (like `http://localhost:5155` or URLs based on your local IP address) you can use to access the running application.

### Frontend Implementation Logic: Detailed Explanation

The frontend is a client-side application using HTML5 Canvas for rendering and JavaScript for game logic, UI updates, and interaction with the backend API (in the single-player mode).

#### 1. `index.html` and Embedded Script (Mode Selection)

This is the initial page the user sees. Its primary role is to get the username and select the game mode and difficulty before redirecting to the appropriate game page.

* **Username Persistence (using `localStorage`):**
    * The script uses `localStorage` to remember the user's preferred username across visits.
    * `localStorage.getItem(USERNAME_STORAGE_KEY)` attempts to retrieve the saved username.
    * `localStorage.setItem(USERNAME_STORAGE_KEY, currentUsername)` saves the username.

    ```html
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const usernameInput = document.getElementById('username-input');
            const saveUsernameButton = document.getElementById('save-username-button');
            const currentUsernameDisplay = document.getElementById('current-username-display');
            const USERNAME_STORAGE_KEY = 'snakeGameUsername';
            let currentUsername = '玩家' + Math.floor(Math.random() * 10000); // Default

            function loadUsername() {
                const savedUsername = localStorage.getItem(USERNAME_STORAGE_KEY);
                if (savedUsername) {
                    currentUsername = savedUsername;
                } else {
                    saveUsername(currentUsername); // Save default if none found
                }
                usernameInput.value = currentUsername;
                currentUsernameDisplay.textContent = currentUsername;
            }

            function saveUsername(usernameToSave = usernameInput.value.trim()) {
                 if (usernameToSave) {
                    currentUsername = usernameToSave;
                    localStorage.setItem(USERNAME_STORAGE_KEY, currentUsername);
                    currentUsernameDisplay.textContent = currentUsername;
                    // Display confirmation message
                    messageArea.textContent = '用户名已保存!';
                    setTimeout(() => messageArea.textContent = '', 3000);
                 } else {
                    alert("用户名不能为空！");
                    usernameInput.value = currentUsername; // Revert
                 }
            }
            // ... event listeners and other code ...
            loadUsername(); // Call on load
        });
    </script>
    ```

    * **Explanation:** This script runs once the `index.html` page is loaded. It immediately tries to load a saved username. If one exists, it populates the input field and display span. If not, it generates a random default and saves it. The "保存" button and pressing Enter in the input field trigger the `saveUsername` function, which updates `localStorage` and the display.

* **Mode and Difficulty Selection UI Logic:**
    * The `updateOptionsDisplay` function dynamically changes which difficulty options (`#single-player-options` or `#two-player-options`) are visible based on the selected game mode radio button. It ensures a default difficulty is selected within the visible section.

    ```javascript
    function updateOptionsDisplay() {
        let selectedMode = null;
        for (const option of modeOptions) {
            if (option.checked) {
                selectedMode = option.value;
                break;
            }
        }

        if (selectedMode === 'singleplayer') {
            singlePlayerOptionsDiv.style.display = 'block';
            twoPlayerOptionsDiv.style.display = 'none';
            // Ensure default single player difficulty is checked
            for (const option of singlePlayerDifficultyOptions) {
                if (option.value === 'medium') option.checked = true;
                else option.checked = false;
            }
        } else if (selectedMode === 'twoplayer') {
            singlePlayerOptionsDiv.style.display = 'none';
            twoPlayerOptionsDiv.style.display = 'block';
            // Ensure default two player difficulty is checked
            for (const option of twoPlayerDifficultyOptions) {
                if (option.value === 'easy') option.checked = true; // Note: Code uses 'easy', not 'super_easy' as default
                else option.checked = false;
            }
        }
    }
    // ... event listeners for mode radio buttons ...
    modeOptions.forEach(option => {
        option.addEventListener('change', updateOptionsDisplay);
    });
    updateOptionsDisplay(); // Call initially
    ```

    * **Explanation:** Event listeners are attached to the mode radio buttons. Whenever a selection changes, `updateOptionsDisplay` is called to toggle the visibility of the corresponding settings sections and set the default difficulty for that mode.

* **Redirecting to Game Page:**
    * The `enter-game-button` click listener gathers the selected mode, saves the username, and constructs the URL for the game page, including query parameters for difficulty and (for single-player) username.

    ```javascript
    enterButton.addEventListener('click', () => {
        let selectedMode = null;
        for (const option of modeOptions) {
            if (option.checked) {
                selectedMode = option.value;
                break;
            }
        }

        if (selectedMode) {
            saveUsername(); // Save username before navigating

            let targetUrl = '/' + selectedMode + '.html';
            let selectedDifficulty = 'medium'; // Default fallback

            // Determine selected difficulty based on mode
            if (selectedMode === 'singleplayer') {
                 for (const option of singlePlayerDifficultyOptions) {
                    if (option.checked) { selectedDifficulty = option.value; break; }
                 }
            } else if (selectedMode === 'twoplayer') {
                 for (const option of twoPlayerDifficultyOptions) {
                    if (option.checked) { selectedDifficulty = option.value; break; }
                 }
            }

            // Construct URL with parameters
            targetUrl += '?difficulty=' + encodeURIComponent(selectedDifficulty);
            if (selectedMode === 'singleplayer') {
                targetUrl += '&username=' + encodeURIComponent(currentUsername);
            }

            // Redirect to the game page
            window.location.href = targetUrl;
        } else {
            messageArea.textContent = '请选择一个游戏模式！';
        }
    });
    ```

    * **Explanation:** When the user clicks "进入游戏", the script first ensures a mode is selected. It then gets the chosen difficulty from the appropriate radio button set. It builds the target URL dynamically, adding the difficulty parameter. For single-player, it also adds the username parameter. `encodeURIComponent` is used to handle special characters in the username safely for inclusion in a URL. Finally, `window.location.href` changes the browser's location, loading the selected game page.

#### 2. `common.js`

This file acts as a shared library for common game functionalities, making the mode-specific scripts cleaner and preventing code duplication.

* **Constants:**
    * `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `GRID_SIZE`: Define the canvas and game grid dimensions.
    * `GRID_WIDTH`, `GRID_HEIGHT`: Calculated based on canvas size and grid size.
    * `LEADERBOARD_API_URL = '/api/leaderboard'`: Defines the base URL for backend API calls. Using a relative path (`/api/leaderboard`) means it will use the same host and port as the serving web page, simplifying deployment as you don't need to hardcode the backend server address if it's served from the same domain.
    * `MINIMUM_SPEED = 40`: Sets a lower bound for the game loop interval in milliseconds. This prevents the game from becoming excessively fast, regardless of how high the score gets.
* **Helper Functions:**
    * `isPositionOnSnake(pos, snake)`: Takes a position object `{x, y}` and a snake array `[{x, y}, ...]`. It uses the `some()` array method to efficiently check if any segment in the snake array has the same x and y coordinates as the given position.
    * `checkWallCollision(pos)`: Checks if a position's x or y coordinates are outside the valid grid range (0 to GRID\_WIDTH-1 and 0 to GRID\_HEIGHT-1).
    * `checkSelfCollision(head, snake)`: Checks if the snake's `head` position overlaps with any element in the `snake` array *starting from the second element (`snake.slice(1)`)*. This correctly checks for collision with the body but not the head itself.
    * `drawRect(ctx, x, y, color)`: Simplifies drawing a single grid cell (a rectangle) on the canvas. It scales the grid coordinates (`x`, `y`) by `GRID_SIZE` to get the actual pixel coordinates on the canvas and then uses `ctx.fillRect` and `ctx.strokeRect` to draw the cell and its border.
    * `darkenColor(hexColor, percent)`: A utility to make a hexadecimal color slightly darker. Used to distinguish the snake's head.
    * `escapeHTML(str)`: Prevents Cross-Site Scripting (XSS) vulnerabilities when displaying user-provided text (like usernames from the URL or leaderboard entries) by converting HTML special characters (`<`, `>`, `&`, `"`) into their HTML entities (`&lt;`, `&gt;`, `&amp;`, `&quot;`). This is essential before setting the `innerHTML` of any DOM element with potentially untrusted data.
    * `calculateDynamicSpeed(initialSpeed, totalScore, reductionRate)`: This function provides a standardized way to make the game speed up as the score increases. It calculates the speed reduction based on the `totalScore` and a `reductionRate` (which varies per difficulty). The resulting speed is subtracted from the `initialSpeed` (set by difficulty), and the result is capped at `MINIMUM_SPEED` using `Math.max`.

#### 3. `singleplayer.js` (Single Player Game and Leaderboard)

This script contains the detailed logic for the single-player mode, including game state management, drawing, input handling, collision detection, score/time tracking, and interaction with the backend leaderboard API.

* **Initialization (`initSinglePlayer`)**:
    * Reads `username` and `difficulty` from the URL query parameters using `URLSearchParams`. It uses `escapeHTML` on the username immediately after reading it for safety before using it or displaying it.
    * Calls `setGameSpeed` with the retrieved `gameDifficulty`.
    * Initializes the `player` object (snake's starting state).
    * Resets game state flags and timers.
    * Calls `WorkspaceLeaderboard()` to load existing scores.
    * Sets up initial UI displays and button state.
    * Draws the initial game state.
    * Sets the default value for the difficulty filter dropdown.
* **Game Speed (`setGameSpeed`):** Sets `speed` and `singlePlayerScoreStepReduction` based on single-player difficulties ('easy', 'medium', 'hard'). For example, 'hard' sets a lower initial speed and a higher reduction rate, meaning the game starts faster and speeds up more significantly per point.
* **Food Generation (`generateFood`):** Generates a random position for food on the grid, ensuring it doesn't overlap with the *single* player's snake using the `isPositionOnSnake` helper from `common.js`.
* **API Interaction: Fetching Leaderboard (`WorkspaceLeaderboard`)**: This function handles retrieving leaderboard data from the backend.

    ```javascript
    async function fetchLeaderboard() {
        if (!leaderboardList || !highScoreElement || !difficultyFilterSelect) return; // Check if UI elements exist

        console.log("Fetching leaderboard...");
        try {
            // Make the GET request to the leaderboard API endpoint
            const response = await fetch(LEADERBOARD_API_URL); // LEADERBOARD_API_URL is from common.js

            // Check if the HTTP status is OK (2xx)
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Parse the JSON response body
            const fetchedEntries = await response.json();
            console.log("Received leaderboard data:", fetchedEntries);

            // Store the full list of entries
            allLeaderboardEntries = fetchedEntries;

            // Find and display the current user's high score for the CURRENT difficulty
            let maxScoreForCurrentUserDifficulty = 0;
            const currentUserLower = currentUsername.toLowerCase();

            // Filter entries for the current user and difficulty
            const userEntriesForCurrentDifficulty = allLeaderboardEntries.filter(entry =>
                entry.username && entry.username.toLowerCase() === currentUserLower &&
                entry.difficulty === gameDifficulty // gameDifficulty is read from URL on init
            );

            // Find the max score among those entries
            if (userEntriesForCurrentDifficulty.length > 0) {
                maxScoreForCurrentUserDifficulty = Math.max(...userEntriesForCurrentDifficulty.map(entry => entry.score));
            }

            // Get the Chinese name for the current difficulty
            const difficultyNames = { 'easy': '简单', 'medium': '中等', 'hard': '困难' };
            const currentDifficultyName = difficultyNames[gameDifficulty] || gameDifficulty;

            // Update the high score display element, escaping values
            if (highScoreElement) highScoreElement.textContent = `${escapeHTML(maxScoreForCurrentUserDifficulty)}（${escapeHTML(currentDifficultyName)}）`;

            // Display the filtered and sorted leaderboard list
            displayLeaderboard(allLeaderboardEntries);

        } catch (error) {
            console.error("Error fetching leaderboard:", error);
            // Update UI to show error and empty leaderboard/high score
            if (messageElement) messageElement.textContent = "无法加载排行榜";
            if (leaderboardList) leaderboardList.innerHTML = '<li>无法加载排行榜</li>';
            if (highScoreElement) {
                 const difficultyNames = { 'easy': '简单', 'medium': '中等', 'hard': '困难' };
                 const currentDifficultyName = difficultyNames[gameDifficulty] || gameDifficulty;
                 highScoreElement.textContent = `0（${escapeHTML(currentDifficultyName)}）`;
            }
            allLeaderboardEntries = []; // Clear stored data on error
        }
    }
    ```

    * **Explanation:** This asynchronous function uses the `Workspace` API to make a GET request to the backend. It awaits the response, checks if it's successful, and then awaits the JSON body parsing. It stores the full list of entries in `allLeaderboardEntries`. It then filters this list to find entries matching the current user and game difficulty to display the user's high score for *that specific difficulty*. Finally, it calls `displayLeaderboard` with the *entire* fetched list, allowing `displayLeaderboard` to handle filtering and sorting based on the dropdown selection. Error handling updates the UI if the fetch fails.

* **API Interaction: Submitting Score (`submitScore`)**: This function sends the game results to the backend after a game over in single-player mode.

    ```javascript
    async function submitScore(entry) {
        console.log("Submitting score...", entry);
        try {
            // Prepare the data to be sent, including difficulty
            const submissionEntry = {
                Username: entry.Username,
                Score: entry.Score,
                SurvivalTime: entry.SurvivalTime,
                Timestamp: entry.Timestamp,
                Difficulty: gameDifficulty // Include the difficulty
            };

            // Make the POST request to the leaderboard API
            const response = await fetch(LEADERBOARD_API_URL, {
                method: 'POST', // HTTP method
                headers: {
                    'Content-Type': 'application/json', // Inform the server the body is JSON
                },
                body: JSON.stringify(submissionEntry), // Convert the JS object to a JSON string
            });

            // Check if the HTTP status is OK (2xx)
            if (!response.ok) {
                 const errorText = await response.text();
                 console.error(`HTTP error! status: ${response.status}. Body: ${errorText}`);
                 throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Log success (backend might return a message)
            const responseBody = await response.text();
            console.log("Score submitted successfully. Response:", responseBody);

            // Refresh the leaderboard display after successful submission
            fetchLeaderboard(); // Refetch all data and redisplay

        } catch (error) {
            console.error("Error submitting score:", error);
            if (messageElement) messageElement.textContent = "无法保存得分记录";
        }
    }
    ```

    * **Explanation:** This asynchronous function also uses the `Workspace` API, but with the `POST` method. It sets the `Content-Type` header to `application/json` and sends the `submissionEntry` object (converted to a JSON string using `JSON.stringify`) in the request body. After successfully receiving a response (status 2xx), it logs success and crucially calls `WorkspaceLeaderboard()` to update the displayed leaderboard, including the user's high score, reflecting the newly submitted score if it was a record for that user and difficulty.

* **Leaderboard Display (`displayLeaderboard`)**: Handles filtering, sorting, and rendering the leaderboard list in the UI.

    ```javascript
    function displayLeaderboard(allEntries) {
        if (!leaderboardList || !difficultyFilterSelect) return;
        leaderboardList.innerHTML = ''; // Clear current list

        if (!Array.isArray(allEntries)) { /* ... handle invalid data ... */ return; }

        const selectedFilterValue = difficultyFilterSelect.value;
        let filteredEntries = [];

        // Filter based on the selected dropdown value
        switch (selectedFilterValue) {
            case 'all': filteredEntries = allEntries; break;
            case 'current': filteredEntries = allEntries.filter(entry => entry.difficulty === gameDifficulty); break;
            case 'easy': filteredEntries = allEntries.filter(entry => entry.difficulty === 'easy'); break;
            case 'medium': filteredEntries = allEntries.filter(entry => entry.difficulty === 'medium'); break;
            case 'hard': filteredEntries = allEntries.filter(entry => entry.difficulty === 'hard'); break;
            default: filteredEntries = allEntries; console.warn(`Unexpected filter value: ${selectedFilterValue}`); break;
        }

        // Sort the filtered entries
        filteredEntries.sort((a, b) => {
            // Sort logic: Difficulty (hardest first), then Score (desc), then Survival Time (desc)
            const orderA = difficultySortOrder[a?.difficulty ?? ''] ?? -1;
            const orderB = difficultySortOrder[b?.difficulty ?? ''] ?? -1;

            if (orderB !== orderA) return orderB - orderA; // Sort by difficulty order

            const aScore = a?.score ?? 0;
            const bScore = b?.score ?? 0;
            if (bScore !== aScore) return bScore - aScore; // Sort by score

            const aSurvivalTime = a?.survivalTime ?? 0;
            const bSurvivalTime = b?.survivalTime ?? 0;
            if (bSurvivalTime !== aSurvivalTime) return bSurvivalTime - aSurvivalTime; // Sort by time

            return 0; // Maintain order for ties
        });

        // Limit the number of entries to display
        const entriesToDisplay = filteredEntries.slice(0, LEADERBOARD_DISPLAY_LIMIT);

        // Display "No records" message if empty
        if (entriesToDisplay.length === 0) { /* ... display message ... */ return; }

        // Mapping difficulty values to Chinese names for display
        const difficultyNames = { 'easy': '简单', 'medium': '中等', 'hard': '困难' };

        // Create and append list items to the UL
        entriesToDisplay.forEach((entry) => {
            if (!entry) return;
            const listItem = document.createElement('li');
            // Use escapeHTML for all potentially user-provided or variable text
            const safeUsername = escapeHTML(entry.username ?? '');
            const safeScore = escapeHTML(entry.score ?? 0);
            const safeTime = escapeHTML(entry.survivalTime ?? 0);
            const safeDifficultyName = escapeHTML(difficultyNames[entry.difficulty ?? ''] || entry.difficulty || '未知');

            listItem.innerHTML = `
                 <div class="leaderboard-entry-username">${safeUsername}</div>
                 <div class="leaderboard-entry-score-time">
                     <span class="score">得分: ${safeScore}</span>
                     <span class="time">时长: ${safeTime}s</span>
                     <span class="difficulty-annotation">(${safeDifficultyName})</span> </div>
             `;
            leaderboardList.appendChild(listItem);
        });
    }
    ```

    * **Explanation:** This function is called with the full set of leaderboard entries fetched from the backend. It first filters this list based on the value selected in the `#difficulty-filter` dropdown. It then applies a multi-level sort: first by the defined `difficultySortOrder` (Hardest > Easiest), then by score descending, and finally by survival time descending. The sorted list is then sliced to the `LEADERBOARD_DISPLAY_LIMIT`, and HTML list items are generated for these entries, with all variable content being escaped using `escapeHTML` before being added to the DOM to prevent XSS.

* **Game Loop (`gameLoop`):** The heart of the game animation and state updates. It uses `setTimeout` to schedule the next frame.

    ```javascript
    function gameLoop() {
        if (!isGameRunning) return; // Stop if game is over

        // Update survival time display
        if (gameStartTime) {
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
            updateSurvivalTimeDisplay();
        }

        // Schedule the next frame
        gameLoopTimeout = setTimeout(() => {
            update(); // Update game state
            draw();   // Redraw canvas

            // Continue loop if player is alive and game is running
            if (player && player.alive && isGameRunning) {
                gameLoop(); // Recursive call
            } else if (isGameRunning) { // Player died this tick
                gameOver();
            }
        }, speed); // 'speed' is dynamically adjusted
    }
    ```

    * **Explanation:** `setTimeout` creates a delay equal to the current `speed` (in milliseconds) before executing the provided function (the lambda). This lambda function calls `update` and `draw` and then checks if the game should continue or end, scheduling the *next* `gameLoop` call if needed. This creates the animation loop.

* **Update (`update`):** Handles game logic for a single tick.

    ```javascript
    function update() {
        if (!player?.alive) return; // Only update if player is alive

        player.direction = player.nextDirection; // Apply buffered direction change
        const head = { ...player.snake[0] }; // Copy current head

        // Calculate next head position
        switch (player.direction) {
            case 'up': head.y -= 1; break;
            case 'down': head.y += 1; break;
            case 'left': head.x -= 1; break;
            case 'right': head.x += 1; break;
        }

        // Check collisions (Wall or Self) using common helpers
        if (checkWallCollision(head) || checkSelfCollision(head, player.snake)) {
            player.alive = false; // Mark as dead
            // gameOver() will be called by gameLoop after draw
        } else {
            // Check food collision using common helper
            if (food && head.x === food.x && head.y === food.y) {
                player.score++;
                generateFood(); // Generate new food
                // Adjust speed based on score and difficulty rate
                speed = calculateDynamicSpeed(initialSinglePlayerSpeed, player.score, singlePlayerScoreStepReduction);
                console.log(`Score increased to ${player.score}, new speed: ${speed}ms`);
            } else {
                player.snake.pop(); // Remove tail if no food eaten
            }
            player.snake.unshift(head); // Add new head
        }

        updateScoreDisplays(); // Update UI score
        // gameOver is handled by gameLoop after update and draw for the death tick
    }
    ```

    * **Explanation:** This function is called by `gameLoop` on every tick. It updates the snake's position, checks for collisions, handles food consumption (increasing score, generating new food, and calculating the *new* `speed`), and updates the UI score display. If a collision occurs, it sets `player.alive` to false; the `gameLoop` will detect this after the `draw` call for the current tick and trigger `gameOver`. The dynamic speed calculation is performed here whenever food is eaten.

* **Drawing (`draw`):** Renders the current game state to the canvas.

    ```javascript
    function draw() {
        if (!ctx) return; // Ensure context is available

        // Clear canvas
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Draw food (if it exists) using common helper
        if (food) {
            drawRect(ctx, food.x, food.y, 'red');
        }

        // Draw snake segments
        if (player?.snake) { // Ensure player and snake exist
            if (player.alive) {
                // Draw alive snake in its color, darker head
                player.snake.forEach((segment, index) => {
                     if (segment) {
                        const color = (index === 0) ? darkenColor(player.color, 20) : player.color;
                        drawRect(ctx, segment.x, segment.y, color);
                     }
                });
            } else {
                // Draw dead snake in grey
                player.snake.forEach(segment => {
                     if (segment) {
                        drawRect(ctx, segment.x, segment.y, '#888888');
                     }
                });
            }
        }
    }
    ```

    * **Explanation:** Called by `gameLoop` after `update`. It clears the canvas, draws the food (if present), and then iterates through the `player.snake` array, drawing each segment as a rectangle using the `drawRect` helper. The head segment (index 0) is drawn slightly darker using the `darkenColor` helper. If the player is not alive, the entire snake is drawn in grey to visually indicate the game over state.

* **Game State Control (`startGame`, `gameOver`):** Manage the overall flow of a game session.

    ```javascript
    function startGame() {
        if (isGameRunning) return; // Prevent starting if already running

        console.log("Starting single player game...");
        // Reset player state, game variables, UI messages, etc.
        player = { /* ... initial state ... */ };
        food = null;
        isGameRunning = true;
        gameStartTime = Date.now(); // Record start time
        currentSurvivalTime = 0;
        messageElement.textContent = '';
        gameResultArea.textContent = '';
        startButton.textContent = '进行中...';
        startButton.disabled = true;

        generateFood(); // First food
        setGameSpeed(gameDifficulty); // Reset speed based on difficulty
        initialSinglePlayerSpeed = speed; // Store initial speed

        gameLoop(); // Start the loop
    }

    function gameOver() {
        if (!isGameRunning) return; // Prevent calling multiple times

        console.log("Single player Game Over!");
        isGameRunning = false;
        clearTimeout(gameLoopTimeout); // Stop the loop

        // Calculate final survival time
        if (gameStartTime && player) {
            currentSurvivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
            updateSurvivalTimeDisplay();
            player.survivalTime = currentSurvivalTime;
        }

        // Display game over messages and results
        if (messageElement) messageElement.textContent = `游戏结束!`;
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = '重新开始';
        }

        // Prepare and submit score (only for single player)
        if (player) {
            const singlePlayerEntry = {
                Username: player.name,
                Score: player.score,
                SurvivalTime: player.survivalTime,
                Timestamp: new Date().toISOString(),
                Difficulty: gameDifficulty // Include difficulty
            };
            submitScore(singlePlayerEntry); // Submit the score to the backend
        } else {
             console.error("Player object not valid, cannot submit score.");
        }


        // Display final score in results area, escaping values
        if (gameResultArea && player) {
             gameResultArea.innerHTML = `<h3>最终得分</h3><p>${escapeHTML(player.name)}: 得分 ${escapeHTML(player.score)}, 游戏时长 ${escapeHTML(player.survivalTime)}s</p>`;
        }


        draw(); // Final draw to show grey snake

        if (messageElement) messageElement.textContent += ' 按空格键开始新游戏'; // Add restart prompt
    }
    ```

    * **Explanation:** `startGame` resets all relevant state variables and UI elements to begin a new game round. It records the start time and initiates the `gameLoop`. `gameOver` is called when the player dies. It stops the game loop, calculates the final survival time, updates UI messages, and *most importantly*, it creates a `LeaderboardEntry` object from the final game state (including score, time, username, and difficulty) and calls `submitScore` to send it to the backend API for processing and persistence. It then displays the final score and time in the UI and draws the snake in its grey "dead" state.

* **Event Listeners:**
    * A click listener on the `#start-button` calls `startGame`.
    * A global `keydown` listener calls `handleKeyDownSinglePlayer`.
    * A `change` listener on the `#difficulty-filter` dropdown calls `displayLeaderboard(allLeaderboardEntries)` to re-render the list using the currently stored data but applying the new filter.

* **`handleKeyDownSinglePlayer(e)`:** Handles user input from the keyboard (Arrow keys and WASD) for controlling the snake's direction.

    ```javascript
    function handleKeyDownSinglePlayer(e) {
        // Start game with Spacebar if not running
        if (!isGameRunning && e.key === ' ') {
            e.preventDefault();
            startGame();
            return;
        }

        // Ignore movement input if game is not running or player is dead
        if (!isGameRunning || !player?.alive) return;

        let requestedDirection = null;
        // Check Arrow keys
        switch (e.key) { /* ... determine direction ... */ }
        // Check WASD keys (case-insensitive)
        if (requestedDirection === null) { /* ... determine direction ... */ }

        // If a valid direction key was pressed
        if (requestedDirection !== null) {
            const oppositeDirections = { /* ... map opposites ... */ };
            // Prevent immediate 180-degree turns
            if (player.direction !== oppositeDirections[requestedDirection]) {
                player.nextDirection = requestedDirection; // Buffer the direction change
                e.preventDefault(); // Prevent default browser action
            }
        }
    }
    ```

    * **Explanation:** This function captures keypress events. If the game is not running and Spacebar is pressed, it starts the game. Otherwise, if the game is running and the player is alive, it checks if an Arrow key or WASD key was pressed. It determines the intended direction and updates the `player.nextDirection`. It includes a check to ensure the player cannot instantly reverse direction, which would cause immediate self-collision. `e.preventDefault()` is used to stop the browser from performing its default action for keys like Space (scrolling) or Arrows (scrolling).

#### 4. `twoplayer.js` (Two Player Game)

This script contains the logic for the two-player mode. It manages two snakes, handles their input and collisions, and tracks scores and time for both, but it *does not* interact with the backend leaderboard API.

* **UI Elements:** References canvas, separate score spans for P1 and P2, match time, messages, results area, and the start button.
* **Game State Variables:** Manages the `players` array (containing two distinct player objects, each with their own snake, score, direction, alive status, color, name, etc.), `food` position, `speed` and `twoPlayerScoreStepReduction` (specific to 2P difficulties), game loop ID, running flag, start time, and match time.
* **Initialization (`initTwoPlayer`):** Reads only `difficulty` from the URL, sets initial speed using `setGameSpeed`, initializes the `players` array with default states for P1 and P2 (initial positions, directions, colors, names), resets other game state, updates UI, draws, and prepares the start button.
* **Game Speed (`setGameSpeed`):** Configures `speed` and `twoPlayerScoreStepReduction` based on two-player difficulties ('super\_easy', 'easy', 'medium', 'hard').
* **Food Generation (`generateFood`):** Generates food, ensuring it doesn't collide with *any* segment of *any* *alive* snake in the `players` array using the `isPositionOnSnake` helper.
* **Game Loop (`gameLoop`):** Manages the game tick, updates match time, calls `update` and `draw`, and checks if *at least one player* is still alive to continue or if *all* players are dead to call `gameOver`.
* **Update (`update`):** This is where the most complex logic in `twoplayer.js` resides, specifically the collision detection.
    * It first calculates the `nextPositions` for *all* currently alive players.
    * It then has a distinct **Collision Detection Phase** where it iterates through players and checks for all collision types (wall, self, head-to-head, head-to-body against *other* players). It uses a `playersDyingThisFrame` array to mark players who collide *in this tick* before any positions are updated. Head-to-head collisions correctly mark *both* involved players for death.
    * In the **State Update Phase**, it iterates through players again. If a player was marked as dying, their `alive` status is set to `false` and `timeOfDeath` is recorded. Their snake positions are *not* updated. If a player *was not* marked as dying, their position is updated, food consumption is checked (if any player eats food, new food is generated and `speed` is calculated based on the *combined total score* of *all* players), and their snake array is updated.
    * Updates the score displays for both players.
* **Drawing (`draw`):** Clears and redraws the canvas, including food and both snakes. Each snake is drawn in its specific color if alive, or grey if dead.
* **UI Updates:** Functions to update the score spans for P1 and P2 and the match survival time span.
* **Game State Control (`startGame`, `gameOver`):**
    * `startGame`: Resets game state (re-initializes the `players` array with starting configurations for two snakes, resets timers, flags, UI), generates the first food, resets speed, and starts the game loop.
    * `gameOver`: Stops the game loop, calculates final individual survival times, displays game over messages and results (including who won based on survival then score). **Crucially, it does NOT call any backend API function to submit scores**, as two-player scores are not intended for the persistent leaderboard in this implementation. It performs a final draw.
* **Event Listeners:** Listens for clicks on the start button and global keydown events for `handleKeyDownTwoPlayer`.
* **`handleKeyDownTwoPlayer(e)`:** Processes keyboard input for two players. It checks for WASD keys (for P1) and Arrow keys (for P2). If a valid movement key is pressed for an *alive* player, it updates that player's `nextDirection`, preventing immediate reversals, and prevents default browser actions. It also allows starting the game with the Spacebar if the game is not running.

In summary, this detailed breakdown, including code snippets and API examples, illustrates how the backend provides a basic leaderboard service with file-based persistence and how the frontend utilizes HTML5 Canvas and JavaScript to implement the game logic for both single-player (with leaderboard interaction) and two-player modes, sharing some common helper functions and constants. The single-player mode's `submitScore` function is the key link between the frontend game results and the backend leaderboard persistence, and the `WorkspaceLeaderboard` function retrieves this data for display, including filtering and sorting on the client side.