import http from "http";
import express from "express";
import { Server } from "colyseus";
import { GameRoom } from "./GameRoom.js";

const app = express();
app.use(express.static("../client/dist"));

const httpServer = http.createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define("game_room", GameRoom);

const PORT = Number(process.env.PORT || 2567);
const HOST = process.env.HOST || "0.0.0.0"; // Listen on all interfaces for LAN access

httpServer.listen(PORT, HOST, () => {
  console.log(`Server started on ws://${HOST}:${PORT}`);
});
