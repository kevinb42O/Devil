/** Install before navigation so settings remains available even before memory attaches. */
export function installSettingsShortcut() {
  if (window.__abyssSettingsShortcutInstalled) return;
  window.__abyssSettingsShortcutInstalled = true;
  window.addEventListener('keydown', event => {
    if (event.key !== '=' || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) void window.__abyssOpenTrainerSettings();
  }, true);
}

export async function connectSettingsShortcut(context, onSettings) {
  await context.exposeBinding('__abyssOpenTrainerSettings', ({frame, page}) => {
    if (frame === page.mainFrame()) onSettings();
  });
  await context.addInitScript(installSettingsShortcut);
  for (const page of context.pages()) await page.evaluate(installSettingsShortcut);
}
