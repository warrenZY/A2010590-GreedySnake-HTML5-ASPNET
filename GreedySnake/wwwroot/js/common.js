// File: common.js

// Common Constants
const GRID_SIZE = 20;
const CANVAS_WIDTH = 600; // Match canvas width in HTML
const CANVAS_HEIGHT = 400; // Match canvas height in HTML
const GRID_WIDTH = CANVAS_WIDTH / GRID_SIZE;
const GRID_HEIGHT = CANVAS_HEIGHT / GRID_SIZE;

// API Endpoints (Leaderboard is common)
const LEADERBOARD_API_URL = '/api/leaderboard';


// Common Drawing Function
function drawRect(ctx, gridX, gridY, color) {
    ctx.fillStyle = color;
    ctx.fillRect(
        gridX * GRID_SIZE,
        gridY * GRID_SIZE,
        GRID_SIZE - 1,
        GRID_SIZE - 1
    );
    ctx.strokeStyle = '#d0d0d0';
    ctx.strokeRect(gridX * GRID_SIZE, gridY * GRID_SIZE, GRID_SIZE, GRID_SIZE);
}

// Helper to darken a color
function darkenColor(hex, percent) {
    if (!hex || hex.length !== 7 || hex[0] !== '#') return hex;

    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.max(0, parseInt(R * (100 - percent) / 100));
    G = Math.max(0, parseInt(G * (100 - percent) / 100));
    B = Math.max(0, parseInt(B * (100 - percent) / 100));


    const RR = ((R.toString(16).length == 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length == 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length == 1) ? "0" + B.toString(16) : B.toString(16));

    return "#" + RR + GG + BB;
}

// Helper to escape HTML for displaying text (prevents XSS in leaderboard display)
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// Common Collision Helpers (These can be common as they operate on a given head and body)
function isPositionOnSnake(position, snakeBody) {
    // Check if a position is anywhere on the snake's body segments
    return snakeBody.some(segment => segment.x === position.x && segment.y === position.y);
}

function checkWallCollision(head) {
    // Check if the head position is outside the canvas boundaries
    return head.x < 0 || head.x >= GRID_WIDTH || head.y < 0 || head.y >= GRID_HEIGHT;
}

function checkSelfCollision(head, snakeBody) {
    // Check if the head position collides with any segment of the *same* snake's body,
    // excluding the head itself (start check from index 1)
    for (let i = 1; i < snakeBody.length; i++) {
        if (head.x === snakeBody[i].x && head.y === snakeBody[i].y) {
            return true;
        }
    }
    return false;
}

// Note: generateFood is NOT in common.js
// Note: Player-to-player collision logic is NOT in common.js