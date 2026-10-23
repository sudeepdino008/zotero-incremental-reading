import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { closeStore, openStore } from "./modules/store";
import { closeQueue } from "./modules/queueView";
import {
  registerColumns,
  registerItemPaneSection,
  registerMenus,
  registerPrefsPane,
  registerShortcut,
} from "./modules/ui";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await openStore();
  // bootstrap.js skips onShutdown on app quit, and an unclosed connection
  // makes Zotero segfault while exiting
  Zotero.addShutdownListener(() => closeStore());

  registerPrefsPane();

  await registerColumns();

  registerMenus();

  registerItemPaneSection();

  registerShortcut();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const styles = ztoolkit.UI.createElement(win.document, "link", {
    properties: {
      type: "text/css",
      rel: "stylesheet",
      href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
    },
  });
  win.document.documentElement?.appendChild(styles);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

async function onShutdown(): Promise<void> {
  ztoolkit.unregisterAll();
  closeQueue();
  await closeStore();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
