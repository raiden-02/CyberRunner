import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { PlayerState } from "./PlayerState.js";
import RAPIER from "@dimforge/rapier3d-compat";

const TICK_RATE = 60; // Hz
const MOVE_SPEED = 5; // units/sec
const CAPSULE_HALF = 0.9;
const CAPSULE_RADIUS = 0.4;
const JUMP_IMPULSE = 5.0;

export class GameRoom extends Room<GameState> {
  private running = false;
  private world!: RAPIER.World;
  private colliders: Map<string, RAPIER.Collider> = new Map();
  private controllers: Map<string, RAPIER.KinematicCharacterController> = new Map();
  private playerMovement: Map<string, {
    verticalVelocity: number,
    canJump: boolean,
    inputX: number,
    inputZ: number
  }> = new Map();

  async onCreate(options: any) {
    this.setState(new GameState());
    console.log("GameRoom created!", options);

    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Ground
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(50, 0.1, 50).setTranslation(0, -0.1, 0).setFriction(1.0)
    );

    // Boundary walls
    const wallHalfThickness = 0.5;
    const wallHalfHeight = 3;
    const halfSize = 25;
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallHalfThickness, wallHalfHeight, halfSize)
        .setTranslation(halfSize + wallHalfThickness, wallHalfHeight, 0)
        .setFriction(0.8)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wallHalfThickness, wallHalfHeight, halfSize)
        .setTranslation(-halfSize - wallHalfThickness, wallHalfHeight, 0)
        .setFriction(0.8)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfSize, wallHalfHeight, wallHalfThickness)
        .setTranslation(0, wallHalfHeight, halfSize + wallHalfThickness)
        .setFriction(0.8)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfSize, wallHalfHeight, wallHalfThickness)
        .setTranslation(0, wallHalfHeight, -halfSize - wallHalfThickness)
        .setFriction(0.8)
    );

    // Interior obstacles
    for (const [x, y, z] of [
      [0, 1, -10],
      [10, 1, 10],
      [-12, 1, 6],
    ] as Array<[number, number, number]>) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(2, 1, 2).setTranslation(x, y, z).setFriction(0.9)
      );
    }

    this.running = true;
    this.setSimulationInterval((deltaTime) => {
      if (!this.running) return;
      const dt = Math.min(100, Math.max(0, deltaTime)) / 1000;
      this.updateGame(dt);
    }, 1000 / TICK_RATE);

    this.onMessage(
      "move",
      (
        client,
        data: { x: number; z: number; rotate?: number; jump?: boolean }
      ) => {
        const collider = this.colliders.get(client.sessionId);
        const player = this.state.players.get(client.sessionId);
        const movement = this.playerMovement.get(client.sessionId);
        if (!collider || !player || !movement) return;
        
        if (typeof data.rotate === "number") player.rotationY = data.rotate;
        
        // Store movement input for processing in updateGame
        movement.inputX = data.x;
        movement.inputZ = data.z;

        // Handle jumping
        if (data.jump && movement.canJump) {
          const controller = this.controllers.get(client.sessionId);
          if (controller && controller.computedGrounded()) {
            movement.verticalVelocity = JUMP_IMPULSE;
            movement.canJump = false;
          }
        } else if (!data.jump) {
          movement.canJump = true;
        }
      }
    );
  }

  onJoin(client: Client) {
    const p = new PlayerState();
    p.x = (Math.random() - 0.5) * 4;
    p.y = 2.0; // Spawn above ground 
    p.z = (Math.random() - 0.5) * 4;
    this.state.players.set(client.sessionId, p);

    // Create kinematic character controller
    const controller = this.world.createCharacterController(0.1);
    controller.enableSnapToGround(0.1); // Keep player on ground
    
    // Create capsule collider (like reference Player.ts)
    const colliderDesc = RAPIER.ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_RADIUS)
      .setTranslation(p.x, p.y, p.z)
      .setFriction(0.7);
    const collider = this.world.createCollider(colliderDesc);
    
    this.colliders.set(client.sessionId, collider);
    this.controllers.set(client.sessionId, controller);
    this.playerMovement.set(client.sessionId, {
      verticalVelocity: 0,
      canJump: true,
      inputX: 0,
      inputZ: 0
    });

    console.log(
      `Player ${client.sessionId} joined at (${p.x.toFixed(1)}, ${p.y.toFixed(
        2
      )}, ${p.z.toFixed(1)}) - Using KinematicCharacterController`
    );
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    const collider = this.colliders.get(client.sessionId);
    if (collider) this.world.removeCollider(collider, false);
    this.colliders.delete(client.sessionId);
    this.controllers.delete(client.sessionId);
    this.playerMovement.delete(client.sessionId);
    console.log(`Player ${client.sessionId} left.`);
  }

  onDispose() {
    this.running = false;
    console.log("GameRoom disposed.");
  }

  private updateGame(dt: number) {
    // Update players
    this.state.players.forEach((player, sessionId) => {
      const collider = this.colliders.get(sessionId);
      const controller = this.controllers.get(sessionId);
      const movement = this.playerMovement.get(sessionId);
      if (!collider || !controller || !movement) return;

      // Apply gravity to vertical velocity 
      movement.verticalVelocity -= 9.81 * dt;

      // Horizontal movement from input
      const speed = MOVE_SPEED;
      const moveX = movement.inputX * speed * dt;
      const moveZ = movement.inputZ * speed * dt;

      // Desired movement delta 
      const desiredDelta = {
        x: moveX,
        y: movement.verticalVelocity * dt,
        z: moveZ,
      };

      // Use character controller to handle collision
      const prevPos = collider.translation();
      controller.computeColliderMovement(collider, desiredDelta);
      const computedMovement = controller.computedMovement();
      
      // Apply the computed movement
      const newPos = {
        x: prevPos.x + computedMovement.x,
        y: prevPos.y + computedMovement.y,
        z: prevPos.z + computedMovement.z,
      };
      collider.setTranslation(newPos);

      // Update player state
      player.x = newPos.x;
      player.y = newPos.y;
      player.z = newPos.z;
      player.canJump = controller.computedGrounded();

      // Reset vertical velocity if grounded
      if (controller.computedGrounded()) {
        movement.verticalVelocity = Math.max(0, movement.verticalVelocity);
      }
    });

    // Step physics world
    this.world.step();
  }
}
