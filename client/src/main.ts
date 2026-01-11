import './style.css';
import { Game } from './core/Game.js';

// Initialize and start the game
const game = new Game();
game.start().catch(console.error);
