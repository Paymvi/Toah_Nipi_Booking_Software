export function findTarget(id) {
  if (!id) return null;
  return [...document.querySelectorAll('[data-tutorial]')].find((element) => element.dataset.tutorial === id && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden') || null;
}

