import './style.css';
import { Game } from './core/Game.js';

// Debug tools (available in console)
import './debug/weapon-preview.js';

// Initialize and start the game
const game = new Game();
game.start().catch(console.error);
