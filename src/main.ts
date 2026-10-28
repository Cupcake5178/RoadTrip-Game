import './style.css';
import { Game } from './game';

async function start() {
  try {
    const game = new Game();
    await game.init();
  } catch (error) {
    console.error(error);
    const loading = document.getElementById('loading');
    if (loading)
      loading.innerHTML =
        '<div class="loading-mark">△</div><p>The wagon couldn’t start.</p><p>Road Trip needs a desktop browser with WebGL2 enabled.</p><button class="btn" onclick="location.reload()">Try again</button>';
  }
}
void start();
