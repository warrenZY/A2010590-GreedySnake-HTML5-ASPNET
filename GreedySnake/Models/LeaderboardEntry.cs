namespace GreedySnake.Models;

public class LeaderboardEntry
{
    public string Username { get; set; }
    public int Score { get; set; }
    public int SurvivalTime { get; set; } // Survival time in seconds
    public DateTime Timestamp { get; set; } // To track when the score was achieved (optional but good)
    public string Difficulty { get; set; }

    public LeaderboardEntry() // Parameterless constructor needed for deserialization
    {
        Username = string.Empty; // Or some default
    }
}