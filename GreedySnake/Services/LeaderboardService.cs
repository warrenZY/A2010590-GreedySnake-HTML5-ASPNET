using System.Text.Json;
using GreedySnake.Models;

namespace GreedySnake.Services;

public class LeaderboardService : IDisposable // Implement IDisposable for the timer
{
    private readonly string _filePath;
    private static readonly object _lock = new object();
    private readonly ILogger<LeaderboardService> _logger;

    // Optional: Timer for periodic cleanup if needed (e.g., trimming old entries)
    // private Timer _cleanupTimer;
    // private readonly int CleanupIntervalMinutes = 60; // Run cleanup every 60 minutes


    public LeaderboardService(IWebHostEnvironment env, ILogger<LeaderboardService> logger)
    {
        _logger = logger;

        string baseDirectory = AppContext.BaseDirectory;
        string projectRootGuess = Path.GetFullPath(Path.Combine(baseDirectory, "..", "..", ".."));
        string dataFolderPath;

        if (!Directory.Exists(Path.Combine(projectRootGuess, "Data")) || !Directory.GetFiles(projectRootGuess, "*.csproj").Any())
        {
            dataFolderPath = Path.Combine(env.ContentRootPath, "Data");
            _logger.LogWarning($"Guessed project root path incorrect ({projectRootGuess}). Using ContentRootPath: {env.ContentRootPath}");
        }
        else
        {
            dataFolderPath = Path.Combine(projectRootGuess, "Data");
            _logger.LogInformation($"Using guessed project root path: {projectRootGuess}");
        }

        if (!Directory.Exists(dataFolderPath))
        {
            try
            {
                Directory.CreateDirectory(dataFolderPath);
                _logger.LogInformation($"Created Data directory: {dataFolderPath}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error creating Data directory: {dataFolderPath}");
            }
        }

        _filePath = Path.Combine(dataFolderPath, "leaderboard.json");
        _logger.LogInformation($"Leaderboard file path: {_filePath}");

        InitializeLeaderboardFile();

        // Optional: Initialize cleanup timer
        // _cleanupTimer = new Timer(DoPeriodicCleanup, null, TimeSpan.FromMinutes(CleanupIntervalMinutes), TimeSpan.FromMinutes(CleanupIntervalMinutes));
    }

    private void InitializeLeaderboardFile()
    {
        lock (_lock)
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
                    _logger.LogCritical(ex, $"FATAL: Could not initialize leaderboard file at {_filePath}. Ensure permissions are correct.");
                }
            }
        }
    }

    private Leaderboard LoadLeaderboard()
    {
        lock (_lock)
        {
            try
            {
                if (!File.Exists(_filePath))
                {
                    _logger.LogWarning($"Leaderboard file not found at {_filePath}. Attempting initialization.");
                    InitializeLeaderboardFile();
                    string jsonAfterInit = File.ReadAllText(_filePath);
                    if (string.IsNullOrWhiteSpace(jsonAfterInit)) return new Leaderboard();

                    var dataAfterInit = JsonSerializer.Deserialize<Leaderboard>(jsonAfterInit);
                    return dataAfterInit ?? new Leaderboard();
                }

                string json = File.ReadAllText(_filePath);
                if (string.IsNullOrWhiteSpace(json))
                {
                    _logger.LogWarning($"Leaderboard file at {_filePath} is empty or corrupt. Attempting initialization.");
                    InitializeLeaderboardFile();
                    string jsonAfterFix = File.ReadAllText(_filePath);
                    var dataAfterFix = JsonSerializer.Deserialize<Leaderboard>(jsonAfterFix);
                    return dataAfterFix ?? new Leaderboard();
                }

                var data = JsonSerializer.Deserialize<Leaderboard>(json);
                if (data != null && data.Entries == null)
                {
                    data.Entries = new List<LeaderboardEntry>();
                }
                return data ?? new Leaderboard();
            }
            catch (JsonException jsonEx)
            {
                _logger.LogError(jsonEx, $"Error reading or parsing leaderboard JSON from {_filePath}. Returning empty leaderboard.");
                // Consider backing up the corrupted file before re-initializing
                InitializeLeaderboardFile();
                return new Leaderboard();
            }
            catch (IOException ioEx)
            {
                _logger.LogError(ioEx, $"IO Error reading leaderboard file from {_filePath}. Returning empty leaderboard.");
                return new Leaderboard();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Unexpected error reading leaderboard file from {_filePath}. Returning empty leaderboard.");
                return new Leaderboard();
            }
        }
    }

    private void SaveLeaderboard(Leaderboard leaderboard)
    {
        lock (_lock)
        {
            try
            {
                // Optional: Sort before saving (keeps the file sorted)
                // var sortedEntries = leaderboard.Entries
                //    .OrderByDescending(e => e.Score)
                //    .ThenByDescending(e => e.SurvivalTime)
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

    public List<LeaderboardEntry> GetSortedLeaderboard(int limit = 10)
    {
        var leaderboard = LoadLeaderboard();
        var sortedEntries = leaderboard.Entries
            .OrderByDescending(e => e.Score)
            .ThenByDescending(e => e.SurvivalTime)
            .Take(limit)
            .ToList();
        return sortedEntries;
    }

    public void AddScoreEntry(LeaderboardEntry newEntry)
    {
        if (newEntry == null || string.IsNullOrWhiteSpace(newEntry.Username) || newEntry.Score < 0 || newEntry.SurvivalTime < 0)
        {
            _logger.LogWarning("Attempted to add invalid leaderboard entry.");
            return;
        }
        if (newEntry.Timestamp == default)
        {
            newEntry.Timestamp = DateTime.UtcNow;
        }

        lock (_lock) // Ensure thread safety for load-modify-save
        {
            var leaderboard = LoadLeaderboard();

            // Find if an entry with the same username already exists (case-insensitive)
            var existingEntry = leaderboard.Entries
                .FirstOrDefault(e => e.Username.Equals(newEntry.Username, StringComparison.OrdinalIgnoreCase));

            if (existingEntry != null)
            {
                // If existing entry found, check if the new score is higher
                if (newEntry.Score > existingEntry.Score)
                {
                    // Update the existing entry
                    existingEntry.Score = newEntry.Score;
                    existingEntry.SurvivalTime = newEntry.SurvivalTime;
                    existingEntry.Timestamp = newEntry.Timestamp; // Update timestamp as well
                    _logger.LogInformation($"Updated leaderboard entry for user '{newEntry.Username}' with higher score: {newEntry.Score}");
                    SaveLeaderboard(leaderboard); // Save changes
                }
                else if (newEntry.Score == existingEntry.Score && newEntry.SurvivalTime > existingEntry.SurvivalTime)
                {
                    // If scores are tied, update if survival time is longer
                    existingEntry.SurvivalTime = newEntry.SurvivalTime;
                    existingEntry.Timestamp = newEntry.Timestamp; // Update timestamp
                    _logger.LogInformation($"Updated leaderboard entry for user '{newEntry.Username}' with same score but longer survival time: {newEntry.SurvivalTime}s");
                    SaveLeaderboard(leaderboard); // Save changes
                }
                else
                {
                    // New score is not higher, ignore the new entry
                    _logger.LogInformation($"Ignoring score entry for user '{newEntry.Username}'. Existing score {existingEntry.Score} is higher or equal.");
                }
            }
            else
            {
                // No existing entry found, add the new one
                leaderboard.Entries.Add(newEntry);
                _logger.LogInformation($"Added new leaderboard entry for user '{newEntry.Username}' score {newEntry.Score}.");
                SaveLeaderboard(leaderboard); // Save changes
            }
        } // Release lock
    }

    // Optional: Periodic cleanup to remove old or lower scores if needed
    // private void DoPeriodicCleanup(object state)
    // {
    //     _logger.LogInformation("Running periodic leaderboard cleanup...");
    //     lock (_lock)
    //     {
    //         var leaderboard = LoadLeaderboard();
    //
    //         // Example cleanup: Keep only the top N scores per user? Or just trim the list?
    //         // Current AddScoreEntry already ensures only the highest score per user is kept.
    //         // So cleanup might only be needed to trim the overall list size if it grows too large.
    //
    //         const int MaxTotalEntries = 500; // Example max total entries
    //         if (leaderboard.Entries.Count > MaxTotalEntries)
    //         {
    //              var trimmedEntries = leaderboard.Entries
    //                  .OrderByDescending(e => e.Score)
    //                  .ThenByDescending(e => e.SurvivalTime)
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
    }
    

    public void ClearLeaderboard()
    {
        lock (_lock)
        {
            try
            {
                var emptyLeaderboard = new Leaderboard { Entries = new List<LeaderboardEntry>() };
                string json = JsonSerializer.Serialize(emptyLeaderboard, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
                Console.WriteLine($"Leaderboard cleared at: {_filePath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error clearing leaderboard: {ex.Message}");
            }
        }
    }
}
