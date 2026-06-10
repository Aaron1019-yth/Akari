import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { initDatabase } from "./db.js";
import plannerRouter from "./api/planner.js";
import chatRouter, { setupWebSocket } from "./api/chat.js";
import practiceRouter from "./api/practice.js";
import profileRouter from "./api/profile.js";
import settingsRouter from "./api/settings.js";
import sessionsRouter from "./api/sessions.js";
import filesRouter from "./api/files.js";

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

// Routers
app.use("/api/planner", plannerRouter);
app.use("/api/chat", chatRouter);
app.use("/api", practiceRouter);
app.use("/api/profile", profileRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/files", filesRouter);

// HTTP server (shared by Express + WebSocket)
const server = createServer(app);

// WebSocket server at /api/chat/ws
const wss = new WebSocketServer({ server, path: "/api/chat/ws" });

setupWebSocket(wss);

// Initialize database on startup
initDatabase();

// Skip listening in test mode — supertest handles the app directly
if (!process.env.AKARI_TEST) {
  const PORT = parseInt(process.env.PORT || "8742", 10);
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Akari API running on http://127.0.0.1:${PORT}`);
  });
}

export { app, wss };
