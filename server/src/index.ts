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
httpServer.listen(PORT, () => {
  console.log(`Server started on ws://localhost:${PORT}`);
});
