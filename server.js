const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// Return local network IP so presenter can generate QR code
app.get("/api/info", (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIP = "localhost";
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== "localhost") break;
  }
  const port = server.address().port;
  res.json({ ip: localIP, port, url: `http://${localIP}:${port}` });
});

app.get("/presenter", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "presenter.html"));
});

// State
let currentQuestion = null;
let votes = { red: 0, green: 0 };
let votingOpen = false;
let voters = new Set();

io.on("connection", (socket) => {
  // Broadcast connected count
  io.emit("connected-count", io.engine.clientsCount);

  // Send current state to newly connected clients
  if (currentQuestion && votingOpen) {
    socket.emit("new-question", currentQuestion);
  }

  socket.on("disconnect", () => {
    io.emit("connected-count", io.engine.clientsCount);
  });

  // Presenter asks a new question
  socket.on("ask-question", (question) => {
    currentQuestion = question;
    votes = { red: 0, green: 0 };
    voters = new Set();
    votingOpen = true;
    io.emit("new-question", question);
  });

  // Audience votes
  socket.on("vote", (color) => {
    if (!votingOpen) return;
    if (voters.has(socket.id)) return;
    voters.add(socket.id);
    votes[color]++;
    io.emit("vote-update", votes);
  });

  // Presenter closes voting and shows results
  socket.on("show-results", () => {
    votingOpen = false;
    io.emit("results", votes);
  });

  // Presenter resets for next question
  socket.on("reset", () => {
    currentQuestion = null;
    votes = { red: 0, green: 0 };
    voters = new Set();
    votingOpen = false;
    io.emit("reset");
  });

  // Session ended
  socket.on("end-session", () => {
    currentQuestion = null;
    votes = { red: 0, green: 0 };
    voters = new Set();
    votingOpen = false;
    io.emit("session-ended");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Presenter view: http://localhost:${PORT}/presenter`);
  console.log(`Audience view:  http://localhost:${PORT}`);
});
