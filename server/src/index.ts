import "dotenv/config";
import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { Server } from "colyseus";
import { GameRoom } from "./GameRoom.js";
import path from "path";
import fs from "fs";
import { PROJECT_ROOT } from "./project-paths.js";
import apiRoutes from "./api/routes.js";
import { attachUser } from "./api/middleware.js";
import { isDatabaseEnabled } from "./db/pool.js";

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Attach user to all requests (non-blocking)
app.use(attachUser);

// API routes
app.use("/api", apiRoutes);

const clientDistPath = path.join(PROJECT_ROOT, "client", "dist");

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, { index: false }));
  // SPA fallback (skip API routes)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
} else {
  console.warn(`[Server] client/dist not found at: ${clientDistPath}. Run client build for production.`);
}

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define("game_room", GameRoom);

const PORT = Number(process.env.PORT || 2567);
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

httpServer.listen(PORT, HOST, () => {
  console.log(`[Server] HTTP/WebSocket listening on ${HOST}:${PORT}`);
  console.log(`[Server] Database: ${isDatabaseEnabled() ? "enabled" : "disabled"}`);
});
