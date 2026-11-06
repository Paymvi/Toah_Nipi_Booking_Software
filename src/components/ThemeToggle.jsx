import { useState } from "react";
import { FaMoon, FaSun } from "react-icons/fa";
import { applyTheme, saveTheme } from "../utils/theme";

const THEMES = [
  { value: "light", label: "Light", Icon: FaSun },
  { value: "night", label: "Night", Icon: FaMoon },
];

export default function ThemeToggle() {
  // index.html has already applied the saved theme to the root element.
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);

  const chooseTheme = (nextTheme) => {
    applyTheme(nextTheme);
    saveTheme(window.localStorage, nextTheme);
    setTheme(nextTheme);
  };

  return (
    // data-tutorial-ui: the tutorial's click guard must let this through during a walkthrough.
    <fieldset className="theme-toggle" data-tutorial-ui aria-label="Color theme">
      {THEMES.map(({ value, label, Icon }) => (
        <label key={value} title={`${label} theme`}>
          <input
            type="radio"
            name="color-theme"
            value={value}
            checked={theme === value}
            onChange={() => chooseTheme(value)}
          />
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
