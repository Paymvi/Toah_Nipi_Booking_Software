# Light and Night themes

Light is the default. Night is an optional preference saved in this browser under the `toahNipiTheme` key; it is never stored in the database. There is no automatic or system option.

## How it works

- `index.html` sets `data-theme` on `<html>` before first paint, so a saved Night choice never flashes Light. `src/utils/theme.js` holds the same rule, and `tests/theme.test.js` checks that they agree.
- `src/components/ThemeToggle.jsx` changes that attribute. It lives in the sidebar, which every staff screen has, including the booking form.
- `src/styles/theme.css` defines the `--n-*` tokens, only for `[data-theme="night"]` and only inside `@media screen`.

Stylesheets write colors with the Light value as the fallback:

```css
.example-card {
  background: var(--n-surface, #ffffff);
  border: 1px solid var(--n-line-2, #dfe4ec);
  color: var(--n-text, #252936);
}
```

In Light the tokens don't exist, so the color after the comma is used. Printing works the same way, so printed pages are always Light.

## Adding a color

Never write a bare color in a stylesheet. Choose the token for what the color does, not what it looks like:

| Purpose | Tokens |
| --- | --- |
| Page, inset wells | `--n-page` |
| Cards and panels | `--n-surface`, `--n-surface-2` for headers and stripes |
| Dialogs, menus, tooltips | `--n-raised` |
| Hover, tracks, neutral chips | `--n-surface-3`, `--n-surface-4` |
| Text | `--n-text`, `--n-text-2`, `--n-text-3` (muted) |
| Borders | `--n-line`, `--n-line-2`, `--n-line-3`, `--n-line-4`; `--n-field-line` for inputs |
| Shadows, modal backdrops | `--n-shadow-1` to `--n-shadow-3`, `--n-scrim` |
| Filled brand controls | `--n-accent-solid`, `--n-accent-solid-hover` |
| Status and categories | `--n-<hue>-bg`, `-bg-2`, `-line`, `-text`, `-ring` |

Hues are `violet`, `blue`, `teal`, `green`, `olive`, `amber`, `orange`, `red`, `plum` and `rose`.

- `--page-bg`, `--card-bg`, `--text-main`, `--text-muted`, `--border` and the other tokens at the top of `shared.css` follow the theme already, so use them as they are.
- A solid color with white text (a green button, say) can stay a plain color in both themes. Keep the fill and its text together.
- Pair a tinted background with text from the same hue: `--n-red-bg` with `--n-red-text`.
- Status must also show as text or an icon, never as color alone.
- Colors set from JavaScript use the same form: `"var(--n-green-text, #166534)"`.
- Don't use `filter: invert()`, and don't add `[data-theme="night"]` rules to a screen's stylesheet when a token can do the job. The rare exception, such as a color computed from a shared variable, goes in `theme.css`.

## What stays Light

Email previews (`.portal-email-preview-frame`) show what a guest receives, so they stay Light. Photos, logos and the gnome keep their own colors. Exports and spreadsheets are unaffected, because the theme only exists in CSS.
