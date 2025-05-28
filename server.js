const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

let leaderboardData = [];
let allData = {}; // for index page data

// Serve static files (your HTML, JS, CSS)
app.use(express.static(path.join(__dirname, ".")));

io.on("connection", (socket) => {
  // Send initial data
  socket.emit("leaderboard-update", leaderboardData);
  socket.emit("alldata-update", allData);

  // Listen for updates from any client (admin)
  socket.on("leaderboard-update", (data) => {
    leaderboardData = data;
    io.emit("leaderboard-update", leaderboardData); // broadcast to all
  });
  socket.on("alldata-update", (data) => {
    allData = data;
    io.emit("alldata-update", allData); // broadcast to all
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WebSocket server running on port ${PORT}`));