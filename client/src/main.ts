import './style.css';
import { Game } from './core/Game.js';
import { MainMenu } from './ui/MainMenu.js';
import { initRapier } from './physics/PhysicsWorld.js';

// RAPIER WASM must be initialized before any physics code runs
await initRapier();

if (import.meta.env.DEV) {
  await import('./debug/weapon-preview.js');
}

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
    if (options.action.returnTo === "forge") mainMenu.showForge();
    else mainMenu.showLobby();
  });

  try {
    await currentGame.start(options.action);
    mainMenu.hideAll();
  } catch (err) {
    console.error("Failed to start game:", err);
    currentGame.stop();
    currentGame = null;
    if (options.action.returnTo === "forge") mainMenu.showForge();
    else mainMenu.showLobby();
  }
});

mainMenu.start().catch(console.error);
