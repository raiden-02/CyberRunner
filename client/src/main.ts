import './style.css';
import { Game } from './core/Game.js';
import { MainMenu } from './ui/MainMenu.js';

// Debug tools (available in console)
import './debug/weapon-preview.js';

// Get Google Client ID from meta tag or environment
const googleClientId = document.querySelector<HTMLMetaElement>('meta[name="google-client-id"]')?.content || "";

let currentGame: Game | null = null;

const mainMenu = new MainMenu();
if (googleClientId) {
  mainMenu.setGoogleClientId(googleClientId);
}

mainMenu.setOnGameStart(async (options) => {
  mainMenu.hideAll();
  
  // Create and start the game
  currentGame = new Game();
  currentGame.setUserProfile(options.user);
  
  try {
    await currentGame.start(options.action);
  } catch (err) {
    console.error("Failed to start game:", err);
    mainMenu.showLobby();
  }
});

// Start the main menu flow
mainMenu.start().catch(console.error);

// For development: allow quick game start via URL param
// Usage: http://localhost:5173?skip_menu=1
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("skip_menu") === "1") {
  // MainMenu handles this internally
}
