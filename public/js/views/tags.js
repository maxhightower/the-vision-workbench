import { escapeHtml } from '../md.js';

/**
 * Intent tags: toggleable buttons that direct and guide the vision and
 * intent of an idea. Suggested tags plus any custom ones the user adds.
 *
 * mountTagRow(container, { selected, onChange }) — onChange(tags) fires on
 * every toggle/add with the new selection.
 */

export const SUGGESTED_TAGS = [
  'product', 'tool', 'service', 'business', 'hardware', 'software',
  'art', 'research', 'community', 'experiment',
];

export function mountTagRow(container, { selected = [], onChange }) {
  let tags = [...selected];

  function paint() {
    const all = [...SUGGESTED_TAGS, ...tags.filter((t) => !SUGGESTED_TAGS.includes(t))];
    container.innerHTML = `
      <div class="tag-row">
        ${all
          .map(
            (t) =>
              `<button class="tag-chip ${tags.includes(t) ? 'on' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
          )
          .join('')}
        <input class="tag-add" type="text" placeholder="+ tag" maxlength="24" />
      </div>`;

    container.querySelectorAll('[data-tag]').forEach((chip) =>
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
        paint();
        onChange?.(tags);
      })
    );

    const add = container.querySelector('.tag-add');
    add.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const tag = add.value.toLowerCase().trim().replace(/\s+/g, '-');
      if (/^[a-z0-9][a-z0-9-]{0,23}$/.test(tag) && !tags.includes(tag)) {
        tags = [...tags, tag];
        paint();
        onChange?.(tags);
        container.querySelector('.tag-add').focus();
      }
    });
  }

  paint();
  return { get: () => tags };
}
