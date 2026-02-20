const express = require("express");
const http = require("http");
const path = require("path");
const os = require("os");

const app = express();
const server = http.createServer(app);

app.use(express.json());
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

// Session state
let sessionActive = true; // true until presenter calls 'end'
let currentQuestion = null;
let votes = { red: 0, green: 0 };
let votingOpen = false;
let voters = new Set();

app.all("/api/game", (req, res) => {
  const action = req.query.action;
  const body = req.body || {};

  if (action === "status") {
    return res.json({
      sessionActive,
      question: currentQuestion,
      votingOpen,
      votes: { red: votes.red, green: votes.green },
      total: votes.red + votes.green,
    });
  }

  if (action === "vote") {
    const { color, voterId } = body;
    if (votingOpen && color && voterId && !voters.has(voterId)) {
      voters.add(voterId);
      votes[color] = (votes[color] || 0) + 1;
    }
    return res.json({ ok: true });
  }

  if (action === "question") {
    const { question } = body;
    currentQuestion = question;
    votes = { red: 0, green: 0 };
    voters = new Set();
    votingOpen = true;
    sessionActive = true;
    return res.json({ ok: true });
  }

  if (action === "close") {
    votingOpen = false;
    return res.json({
      ok: true,
      votes: { red: votes.red, green: votes.green },
      total: votes.red + votes.green,
    });
  }

  if (action === "reset") {
    currentQuestion = null;
    votes = { red: 0, green: 0 };
    voters = new Set();
    votingOpen = false;
    return res.json({ ok: true });
  }

  if (action === "end") {
    currentQuestion = null;
    votes = { red: 0, green: 0 };
    voters = new Set();
    votingOpen = false;
    sessionActive = false;
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "Unknown action" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Presenter view: http://localhost:${PORT}/presenter`);
  console.log(`Audience view:  http://localhost:${PORT}`);
});
