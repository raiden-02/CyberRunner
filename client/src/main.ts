import './style.css';
import { Game } from './core/Game.js';
import { MainMenu } from './ui/MainMenu.js';
import { initRapier } from './physics/PhysicsWorld.js';

import './debug/weapon-preview.js';

// RAPIER WASM must be initialized before any physics code runs
await initRapier();

const googleClientId =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()
  || document.querySelector<HTMLMetaElement>('meta[name="google-client-id"]')?.content
  || "";

let currentGame: Game | null = null;

const mainMenu = new MainMenu();
if (googleClientId) {
  mainMenu.setGoogleClientId(googleClientId);
}

mainMenu.setOnGameStart(async (options) => {
  mainMenu.hideAll();

  currentGame = new Game();
  currentGame.setUserProfile(options.user);
  currentGame.setOnReturnToMenu(() => {
    currentGame = null;
    mainMenu.showLobby();
  });

  try {
    await currentGame.start(options.action);
  } catch (err) {
    console.error("Failed to start game:", err);
    mainMenu.showLobby();
  }
});

mainMenu.start().catch(console.error);

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("skip_menu") === "1") {
  // MainMenu handles skip_menu internally
}
