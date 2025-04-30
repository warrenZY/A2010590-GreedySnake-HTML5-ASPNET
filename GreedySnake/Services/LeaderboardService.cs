using System.Text.Json;
using GreedySnake.Models; // Assuming LeaderboardEntry and Leaderboard models are defined here
using Microsoft.AspNetCore.Hosting; // Required for IWebHostEnvironment
using Microsoft.Extensions.Logging; // Required for ILogger

// Note: Make sure LeaderboardEntry model has a 'Difficulty' property (e.g., public string Difficulty { get; set; }).
// And Leaderboard model has 'public List<LeaderboardEntry> Entries { get; set; }'

namespace GreedySnake.Services;

public class LeaderboardService : IDisposable // Implement IDisposable for the timer
{
    private readonly string _filePath;
    private static readonly object _lock = new object(); // For thread safety when accessing the file
    private readonly ILogger<LeaderboardService> _logger;

    // Optional: Timer for periodic cleanup if needed (e.g., trimming old entries)
    // private Timer _cleanupTimer;
    // private readonly int CleanupIntervalMinutes = 60; // Run cleanup every 60 minutes


    public LeaderboardService(IWebHostEnvironment env, ILogger<LeaderboardService> logger)
    {
        _logger = logger;

        // Attempt to find the project root to place the Data folder, fall back to ContentRootPath
        string baseDirectory = AppContext.BaseDirectory;
        string projectRootGuess = Path.GetFullPath(Path.Combine(baseDirectory, "..", "..", ".."));
        string dataFolderPath;

        // Check if the guessed path contains a .csproj file and a 'Data' directory
        if (!Directory.Exists(Path.Combine(projectRootGuess, "Data")) || !Directory.GetFiles(projectRootGuess, "*.csproj").Any())
        {
            dataFolderPath = Path.Combine(env.ContentRootPath, "Data");
            _logger.LogWarning($"Guessed project root path incorrect ({projectRootGuess}). Using ContentRootPath: {env.ContentRootPath} for Data folder.");
        }
        else
        {
            dataFolderPath = Path.Combine(projectRootGuess, "Data");
            _logger.LogInformation($"Using guessed project root path: {projectRootGuess} for Data folder.");
        }

        // Ensure the Data directory exists
        if (!Directory.Exists(dataFolderPath))
        {
            try
            {
                Directory.CreateDirectory(dataFolderPath);
                _logger.LogInformation($"Created Data directory: {dataFolderPath}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error creating Data directory: {dataFolderPath}. Ensure application has write permissions.");
            }
        }

        _filePath = Path.Combine(dataFolderPath, "leaderboard.json");
        _logger.LogInformation($"Leaderboard file path: {_filePath}");

        InitializeLeaderboardFile();

        // Optional: Initialize cleanup timer
        // _cleanupTimer = new Timer(DoPeriodicCleanup, null, TimeSpan.FromMinutes(CleanupIntervalMinutes), TimeSpan.FromMinutes(CleanupIntervalMinutes));
    }

    // Ensures the leaderboard JSON file exists and contains a valid initial structure
    private void InitializeLeaderboardFile()
    {
        lock (_lock) // Protect file access
        {
            if (!File.Exists(_filePath))
            {
                try
                {
                    var initialData = new Leaderboard { Entries = new List<LeaderboardEntry>() };
                    string json = JsonSerializer.Serialize(initialData, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_filePath, json);
                    _logger.LogInformation($"Initialized empty leaderboard file at: {_filePath}");
                }
                catch (Exception ex)
                {
                    _logger.LogCritical(ex, $"FATAL: Could not initialize leaderboard file at {_filePath}. Ensure file system permissions are correct.");
                }
            }
            // Optional: Add a check here to ensure the file is not empty if it exists but is zero length
            else if (new FileInfo(_filePath).Length == 0)
            {
                _logger.LogWarning($"Leaderboard file exists but is empty at {_filePath}. Re-initializing.");
                try
                {
                    var initialData = new Leaderboard { Entries = new List<LeaderboardEntry>() };
                    string json = JsonSerializer.Serialize(initialData, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_filePath, json);
                    _logger.LogInformation($"Re-initialized empty leaderboard file.");
                }
                catch (Exception ex)
                {
                    _logger.LogCritical(ex, $"FATAL: Could not re-initialize empty leaderboard file at {_filePath}.");
                }
            }
        }
    }

    // Loads the leaderboard data from the JSON file. Handles file not found, empty file, and JSON parsing errors.
    private Leaderboard LoadLeaderboard()
    {
        lock (_lock) // Protect file access
        {
            try
            {
                // Check if file exists, re-initialize if not found or is empty
                if (!File.Exists(_filePath) || new FileInfo(_filePath).Length == 0)
                {
                    _logger.LogWarning($"Leaderboard file not found or is empty at {_filePath}. Attempting initialization.");
                    InitializeLeaderboardFile(); // Will create if not exists, or re-initialize if empty
                    // After initialization, the file should exist and not be empty
                    string jsonAfterInit = File.ReadAllText(_filePath);
                    if (string.IsNullOrWhiteSpace(jsonAfterInit)) return new Leaderboard(); // Should not happen after init
                    var dataAfterInit = JsonSerializer.Deserialize<Leaderboard>(jsonAfterInit);
                    return dataAfterInit ?? new Leaderboard { Entries = new List<LeaderboardEntry>() };
                }

                // File exists and is not empty, attempt to read and deserialize
                string json = File.ReadAllText(_filePath);
                var data = JsonSerializer.Deserialize<Leaderboard>(json);

                // If deserialization returns null or entries list is null, return a new valid object
                if (data == null || data.Entries == null)
                {
                    _logger.LogWarning($"Leaderboard file at {_filePath} deserialized to null or had null entries. Returning new empty leaderboard.");
                    // Consider backing up the potentially corrupted file before returning empty
                    // File.Copy(_filePath, $"{_filePath}.bak.{DateTime.UtcNow:yyyyMMddHHmmss}");
                    return new Leaderboard { Entries = new List<LeaderboardEntry>() };
                }

                return data; // Successfully loaded
            }
            catch (JsonException jsonEx)
            {
                _logger.LogError(jsonEx, $"Error reading or parsing leaderboard JSON from {_filePath}. Returning empty leaderboard.");
                // Consider backing up the corrupted file before re-initializing
                // File.Copy(_filePath, $"{_filePath}.corrupt.bak.{DateTime.UtcNow:yyyyMMddHHmmss}");
                InitializeLeaderboardFile(); // Attempt to reset the file
                return new Leaderboard { Entries = new List<LeaderboardEntry>() };
            }
            catch (IOException ioEx)
            {
                _logger.LogError(ioEx, $"IO Error reading leaderboard file from {_filePath}. Returning empty leaderboard.");
                // This might indicate a temporary file lock or permission issue
                return new Leaderboard { Entries = new List<LeaderboardEntry>() };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Unexpected error reading leaderboard file from {_filePath}. Returning empty leaderboard.");
                return new Leaderboard { Entries = new List<LeaderboardEntry>() };
            }
        }
    }

    // Saves the current leaderboard data to the JSON file.
    private void SaveLeaderboard(Leaderboard leaderboard)
    {
        lock (_lock) // Protect file access
        {
            try
            {
                // Optional: Sort before saving (keeps the file sorted for easier reading, but impacts performance)
                // If sorting here, ensure you sort by Difficulty as well if that's the primary display order
                // var sortedEntries = leaderboard.Entries
                //    .OrderByDescending(e => e.Score)
                //    .ThenByDescending(e => e.SurvivalTime)
                //    .ThenBy(e => e.Timestamp) // Optional: sort by timestamp for same score/time
                //    .ToList();
                // leaderboard.Entries = sortedEntries;

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
        }
    }

    // Gets the full leaderboard entries. Sorting and filtering is typically done on the client side
    // based on the fetched data. The limit parameter here limits the number of entries fetched from storage.
    public List<LeaderboardEntry> GetSortedLeaderboard(int limit = 100) // Increased default limit to fetch more data for client-side filtering
    {
        var leaderboard = LoadLeaderboard();
        // We still sort by score/time here as a basic retrieval order,
        // but client-side will re-sort by difficulty first.
        var sortedEntries = leaderboard.Entries
            .OrderByDescending(e => e.Score)
            .ThenByDescending(e => e.SurvivalTime)
            .Take(limit) // Take only the top N entries (adjust limit if needed to fetch more)
            .ToList();
        return sortedEntries;
    }

    // Adds a new score entry or updates an existing one if it represents a new high score
    // for the specific user AND difficulty combination.
    public void AddScoreEntry(LeaderboardEntry newEntry)
    {
        // Basic validation of the new entry
        // This checks if Username, Score, SurvivalTime, or Difficulty are null or whitespace/negative
        if (newEntry == null || string.IsNullOrWhiteSpace(newEntry.Username) || newEntry.Score < 0 || newEntry.SurvivalTime < 0 || string.IsNullOrWhiteSpace(newEntry.Difficulty))
        {
            _logger.LogWarning("Attempted to add invalid leaderboard entry (missing username, score, time, or difficulty).");
            return;
        }

        // Set timestamp if not provided (frontend is providing it, which is fine)
        if (newEntry.Timestamp == default)
        {
            newEntry.Timestamp = DateTime.UtcNow;
        }

        lock (_lock) // Ensure thread safety for load-modify-save operations
        {
            var leaderboard = LoadLeaderboard(); // Load current data

            // --- FIX: Find if an entry with the SAME USERNAME AND SAME DIFFICULTY already exists ---
            // Use string.Equals with StringComparison.OrdinalIgnoreCase which handles nulls safely.
            // Add a check that the entry 'e' itself is not null as a safeguard, though LoadLeaderboard should return valid entries.
            var existingEntry = leaderboard.Entries
                .FirstOrDefault(e =>
                    e != null && // Ensure the entry object from the list is not null
                    string.Equals(e.Username, newEntry.Username, StringComparison.OrdinalIgnoreCase) && // Safe comparison for Username
                    string.Equals(e.Difficulty, newEntry.Difficulty, StringComparison.OrdinalIgnoreCase)); // Safe comparison for Difficulty
            // --- End FIX ---


            if (existingEntry != null)
            {
                // If an existing entry for this username AND difficulty was found, check if the new score is higher
                if (newEntry.Score > existingEntry.Score)
                {
                    // Update the existing entry with the new high score
                    existingEntry.Score = newEntry.Score;
                    existingEntry.SurvivalTime = newEntry.SurvivalTime; // Update survival time for the new high score
                    existingEntry.Timestamp = newEntry.Timestamp; // Update timestamp to the latest submission time
                    // Difficulty remains the same as it was matched

                    _logger.LogInformation($"Updated leaderboard entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}) with higher score: {newEntry.Score}.");
                    SaveLeaderboard(leaderboard); // Save changes to the file
                }
                else if (newEntry.Score == existingEntry.Score && newEntry.SurvivalTime > existingEntry.SurvivalTime)
                {
                    // If scores are tied for this username and difficulty, update if survival time is longer
                    existingEntry.SurvivalTime = newEntry.SurvivalTime;
                    existingEntry.Timestamp = newEntry.Timestamp; // Update timestamp
                    // Difficulty remains the same

                    _logger.LogInformation($"Updated leaderboard entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}) with same score ({newEntry.Score}) but longer survival time: {newEntry.SurvivalTime}s.");
                    SaveLeaderboard(leaderboard); // Save changes
                }
                else
                {
                    // New score is not higher, and time is not longer (or score is lower), ignore the new entry
                    _logger.LogInformation($"Ignoring score entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}). Existing score {existingEntry.Score} is higher or equal, or survival time is not longer.");
                }
            }
            else
            {
                // No existing entry found for this specific username and difficulty, add the new one as a unique record
                leaderboard.Entries.Add(newEntry);
                _logger.LogInformation($"Added new leaderboard entry for user '{newEntry.Username}' (Difficulty: {newEntry.Difficulty}) score {newEntry.Score}.");
                SaveLeaderboard(leaderboard); // Save changes to the file
            }
        } // Release lock
    }

    // Optional: Periodic cleanup to remove old or lower scores if needed
    // This cleanup logic would need to be more sophisticated if keeping multiple entries per user/difficulty
    // The current AddScoreEntry ensures only the highest per user/difficulty is kept.
    // So cleanup might only be needed to trim the overall list size if it grows too large.
    // private void DoPeriodicCleanup(object state)
    // {
    //     _logger.LogInformation("Running periodic leaderboard cleanup...");
    //     lock (_lock)
    //     {
    //         var leaderboard = LoadLeaderboard();
    //
    //         // Example cleanup: Keep only the top N entries overall
    //         const int MaxTotalEntries = 500; // Example max total entries
    //         if (leaderboard.Entries.Count > MaxTotalEntries)
    //         {
    //              var trimmedEntries = leaderboard.Entries
    //                  .OrderByDescending(e => e.Score)
    //                  .ThenByDescending(e => e.SurvivalTime)
    //                  .ThenBy(e => e.Timestamp) // Keep latest in case of tie
    //                  .Take(MaxTotalEntries)
    //                  .ToList();
    //              leaderboard.Entries = trimmedEntries;
    //              _logger.LogInformation($"Trimmed total leaderboard entries to {MaxTotalEntries}.");
    //              SaveLeaderboard(leaderboard); // Save trimmed list
    //         }
    //     }
    //     _logger.LogInformation("Leaderboard cleanup finished.");
    // }

    // Implement IDisposable to clean up the timer if used
    public void Dispose()
    {
        // _cleanupTimer?.Dispose();
        // Note: File stream itself is managed by File.Read/WriteAllText which open and close the stream.
    }


    // Optional: Method to clear all leaderboard entries (useful for development/testing)
    public void ClearLeaderboard()
    {
        lock (_lock)
        {
            try
            {
                var emptyLeaderboard = new Leaderboard { Entries = new List<LeaderboardEntry>() };
                string json = JsonSerializer.Serialize(emptyLeaderboard, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
                _logger.LogInformation($"Leaderboard cleared at: {_filePath}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error clearing leaderboard: {ex.Message}");
            }
        }
    }
}