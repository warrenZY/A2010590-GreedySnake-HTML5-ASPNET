/*
 * File: common.js
 * Description: Contains common constants and utility functions
 * used across different parts of the frontend application.
 * These functions and constants are independent of game mode specific logic.
 */

// --- Constants ---
// Canvas dimensions in pixels
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
// Grid size for the snake game board in pixels per cell
const GRID_SIZE = 20;
// Number of grid cells horizontally (Canvas Width / Grid Size)
const GRID_WIDTH = CANVAS_WIDTH / GRID_SIZE;
// Number of grid cells vertically (Canvas Height / Grid Size)
const GRID_HEIGHT = CANVAS_HEIGHT / GRID_SIZE;
// API endpoint URL for the leaderboard
const LEADERBOARD_API_URL = '/api/leaderboard';


// --- Helper Functions ---

// Checks if a given position ({x, y}) overlaps with any segment ({x, y}) in a snake array.
// Used for food collision with snake, or checking if a position is occupied by a snake.
// pos: { x: number, y: number } - The position to check.
// snake: Array<{ x: number, y: number }> - The array of snake segments.
// Returns: boolean - True if the position is on the snake, false otherwise.
function isPositionOnSnake(pos, snake) {
    // Use Array.prototype.some() to check if at least one segment matches the given position.
    return snake.some(segment => segment.x === pos.x && segment.y === pos.y);
}

// Checks if a given position ({x, y}) is outside the game grid boundaries.
// Used for wall collision detection.
// pos: { x: number, y: number } - The position to check.
// Returns: boolean - True if the position is outside the grid, false otherwise.
function checkWallCollision(pos) {
    // Check if x coordinate is less than 0 or greater than or equal to grid width.
    // Check if y coordinate is less than 0 or greater than or equal to grid height.
    return pos.x < 0 || pos.x >= GRID_WIDTH || pos.y < 0 || pos.y >= GRID_HEIGHT;
}

// Checks if a snake's head ({x, y}) collides with its own body (segments after the head).
// Used for self-collision detection.
// head: { x: number, y: number } - The snake's head position.
// snake: Array<{ x: number, y: number }> - The array of snake segments (head at index 0).
// Returns: boolean - True if the head position overlaps with any body segment (excluding the head itself), false otherwise.
function checkSelfCollision(head, snake) {
    // Use slice(1) to get all segments *after* the head (the body).
    // Then use isPositionOnSnake to check if the head position overlaps with any body segment.
    return isPositionOnSnake(head, snake.slice(1));
}

// Draws a rectangle representing a game element (like a snake segment or food) on the canvas.
// ctx: CanvasRenderingContext2D - The 2D rendering context of the canvas.
// x: number - The grid X-coordinate (column index).
// y: number - The grid Y-coordinate (row index).
// color: string - The color to fill the rectangle in hexadecimal format (e.g., 'red', '#008000').
function drawRect(ctx, x, y, color) {
    ctx.fillStyle = color; // Set the fill color for the rectangle.
    // Draw the filled rectangle at the correct canvas coordinates (grid position * grid size).
    ctx.fillRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
    // Optional: Draw a border around the rectangle for visual separation between cells.
    ctx.strokeStyle = '#a0a0a0'; // Set border color (grey).
    ctx.strokeRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE); // Draw the border rectangle.
}

// Darkens a given hexadecimal color by a specified percentage.
// Used to draw the snake's head slightly darker than its body.
// hexColor: string - The color in hexadecimal format (e.g., '#008000').
// percent: number - The percentage to darken (e.g., 20 for 20%).
// Returns: string - The darkened color in hexadecimal format.
function darkenColor(hexColor, percent) {
    let hex = hexColor.slice(1); // Remove the '#' prefix.
    // Convert 3-digit hex codes (e.g., '#08F') to 6-digit hex codes (e.g., '#0088FF').
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    // Parse the hexadecimal color into decimal R, G, and B components.
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Calculate the darkening factor based on the percentage.
    const factor = 1 - percent / 100;

    // Apply the darkening factor to each color component and ensure the result is within 0-255.
    r = Math.floor(Math.max(0, r * factor));
    g = Math.floor(Math.max(0, g * factor));
    b = Math.floor(Math.max(0, b * factor));

    // Helper function to convert a decimal color component back to a two-digit hexadecimal string.
    const toHex = (c) => c.toString(16).padStart(2, '0');

    // Return the new darkened color in hexadecimal format.
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Escapes HTML special characters in a string to prevent Cross-Site Scripting (XSS) vulnerabilities.
// This is used before displaying any user-provided text (like usernames) within HTML elements using .innerHTML.
// str: string - The input string to escape.
// Returns: string - The escaped string with HTML special characters converted to their entity equivalents.
function escapeHTML(str) {
    const div = document.createElement('div'); // Create a temporary, isolated div element.
    // Append the input string as a text node. The browser's text node handling automatically converts characters like '<', '>', '&', '"' to '&lt;', '&gt;', '&amp;', '&quot;'.
    div.appendChild(document.createTextNode(str));
    // Return the innerHTML of the temporary div, which now contains the escaped string.
    return div.innerHTML;
}