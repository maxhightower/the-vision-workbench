import { api } from '../api.js';
import { toast } from '../app.js';
import { mountTagRow } from './tags.js';

export function renderSeed(app) {
  app.innerHTML = `
    <div class="seed-screen">
      <h1>Plant a Seed</h1>
      <p class="subtitle">Write the idea exactly as it lives in your head — rough is fine.</p>
      <textarea id="seed-text" placeholder="What's growing in your mind?" autofocus></textarea>
      <div id="seed-tags" class="seed-tags"></div>
      <p class="faint" style="margin:4px 0 0">Tags direct and guide the vision — pick any that fit, or add your own.</p>
      <input id="seed-title" type="text" placeholder="Optional name for this idea space"
             style="max-width:560px;margin-top:14px" />
      <button id="seed-plant" class="btn-primary">Plant 🌱</button>
    </div>`;

  const textEl = app.querySelector('#seed-text');
  const titleEl = app.querySelector('#seed-title');
  const button = app.querySelector('#seed-plant');
  const tagRow = mountTagRow(app.querySelector('#seed-tags'), { selected: [] });
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
      const space = await api.plantSeed(seedText, titleEl.value, tagRow.get());
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
