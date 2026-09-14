import './style.css'
import { Game } from './game/game'

const app = document.querySelector('#app')
if (!app) throw new Error('Missing #app')
new Game(app)
