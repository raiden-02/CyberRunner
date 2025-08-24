import colyseus from "colyseus";

export class GameRoom extends colyseus.Room {
  onCreate(options: any) {
    console.log("GameRoom created!", options);
    // No game state yet
  }

  onJoin(client: colyseus.Client) {
    console.log(`Client ${client.sessionId} joined.`);
    client.send("welcome", { message: "Welcome to CyberFPS!" });
  }

  onLeave(client: colyseus.Client) {
    console.log(`Client ${client.sessionId} left.`);
  }

  onDispose() {
    console.log("GameRoom disposed.");
  }
}
