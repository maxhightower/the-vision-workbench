import { api } from '../api.js';
import { toast } from '../app.js';

export function renderSeed(app) {
  app.innerHTML = `
    <div class="seed-screen">
      <h1>Plant a Seed</h1>
      <p class="subtitle">Write the idea exactly as it lives in your head — rough is fine.</p>
      <textarea id="seed-text" placeholder="What's growing in your mind?" autofocus></textarea>
      <input id="seed-title" type="text" placeholder="Optional name for this idea space"
             style="max-width:640px;margin-top:12px" />
      <button id="seed-plant" class="btn-primary">Plant 🌱</button>
    </div>`;

  const textEl = app.querySelector('#seed-text');
  const titleEl = app.querySelector('#seed-title');
  const button = app.querySelector('#seed-plant');
  textEl.focus();

  async function plant() {
    const seedText = textEl.value.trim();
    if (!seedText) {
      toast('Write a little something first — even one sentence.', true);
      return;
    }
    button.disabled = true;
    button.textContent = 'Planting…';
    try {
      const space = await api.plantSeed(seedText, titleEl.value);
      toast(`Planted "${space.title}"`);
      location.hash = `#/space/${space.id}`;
    } catch (err) {
      toast(err.message, true);
      button.disabled = false;
      button.textContent = 'Plant 🌱';
    }
  }

  button.addEventListener('click', plant);
  textEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') plant();
  });
}
