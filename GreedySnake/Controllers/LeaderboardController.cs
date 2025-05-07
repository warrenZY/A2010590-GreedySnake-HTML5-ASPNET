using GreedySnake.Models;
using GreedySnake.Services;
using Microsoft.AspNetCore.Mvc;

namespace SnakeGame.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class LeaderboardController : ControllerBase
    {
        private readonly LeaderboardService _leaderboardService;

        public LeaderboardController(LeaderboardService leaderboardService)
        {
            _leaderboardService = leaderboardService;
        }

        // GET: api/leaderboard
        // Returns the sorted list of leaderboard entries
        [HttpGet]
        public ActionResult<List<LeaderboardEntry>> Get([FromQuery] int limit = 50) // Optional: allow limiting entries via query param
        {
            try
            {
                var leaderboard = _leaderboardService.GetSortedLeaderboard(limit);
                return Ok(leaderboard);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GET /api/leaderboard: {ex.Message}");
                return StatusCode(500, "Internal server error retrieving leaderboard");
            }
        }

        // POST: api/leaderboard
        // Adds a new score entry to the leaderboard (for single player games)
        [HttpPost]
        public IActionResult Post([FromBody] LeaderboardEntry entry)
        {
            // Basic validation
            if (entry == null || string.IsNullOrWhiteSpace(entry.Username) || entry.Score < 0 || entry.SurvivalTime < 0)
            {
                return BadRequest("Invalid leaderboard entry provided.");
            }
            // Assign server-side timestamp if needed, or trust client timestamp?
            // entry.Timestamp = DateTime.UtcNow; // Or DateTime.Now

            try
            {
                _leaderboardService.AddScoreEntry(entry);
                return Ok(new { message = "Score entry added to leaderboard." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in POST /api/leaderboard: {ex.Message}");
                return StatusCode(500, "Internal server error adding score entry");
            }
        }

        // Endpoint to clear the leaderboard(for testing/admin)
         [HttpDelete("clear")] // Example route
        public IActionResult Clear()
        {
            try
            {
                _leaderboardService.ClearLeaderboard();
                return Ok(new { message = "Leaderboard cleared." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in DELETE /api/leaderboard/clear: {ex.Message}");
                return StatusCode(500, "Internal server error clearing leaderboard");
            }
        }
    }
}