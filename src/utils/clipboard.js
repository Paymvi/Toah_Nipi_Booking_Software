// Copies trimmed text; throws when the browser refuses so callers can show a failure.
export async function copyTextToClipboard(text) {
  const textToCopy = String(text ?? "").trim();

  if (!textToCopy) {
    return;
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(textToCopy);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = textToCopy;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "-9999px";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  let copied;

  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }

  if (!copied) {
    throw new Error("Copy command was not allowed.");
  }
}
