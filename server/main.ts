import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { initDatabase } from "./db.js";

const app = express();

// JSON body parser
app.use(express.json());

// CORS — must match Python backend exactly
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    credentials: true,
  })
);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", name: "Akari" });
});

// HTTP server (shared by Express + WebSocket)
const server = createServer(app);

// WebSocket server at /api/chat/ws
const wss = new WebSocketServer({ server, path: "/api/chat/ws" });

wss.on("connection", (_ws) => {
  // WebSocket handling will be implemented in Task 8 (API routes)
});

// Initialize database on startup
initDatabase();

const PORT = parseInt(process.env.PORT || "8742", 10);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Akari API running on http://127.0.0.1:${PORT}`);
});

export { app, wss };
