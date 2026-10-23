import { getLocaleID, getString } from "../utils/locale";
import {
  addItems,
  defaultPriority,
  doneAndNext,
  entryFor,
  markRead,
  onQueueChange,
  postpone,
  promptPriority,
  queueTarget,
  readNext,
  removeItems,
  setPriority,
} from "./queue";
import { describeDue, today } from "./schedule";
import { getEntry } from "./store";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function registerPrefsPane() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

export async function registerColumns() {
  // Only top-level rows get values; child attachments stay blank.
  const topLevelEntry = (item: Zotero.Item) =>
    item.isTopLevelItem() ? getEntry(item) : undefined;
  const priorityColumn = await Zotero.ItemTreeManager.registerColumns({
    pluginID: addon.data.config.addonID,
    dataKey: "irPriority",
    label: getString("column-priority"),
    dataProvider: (item) => {
      const entry = topLevelEntry(item);
      return entry ? String(entry.priority) : "";
    },
  });
  const dueColumn = await Zotero.ItemTreeManager.registerColumns({
    pluginID: addon.data.config.addonID,
    dataKey: "irDue",
    label: getString("column-due"),
    dataProvider: (item) => topLevelEntry(item)?.due ?? "",
  });
  if (!priorityColumn || !dueColumn) {
    throw new Error("Failed to register Incremental Reading columns");
  }
}

export function registerMenus() {
  const pluginID = addon.data.config.addonID;
  const selected = (items?: Zotero.Item[]) => items ?? [];
  const anyQueued = (items?: Zotero.Item[]) =>
    selected(items).some((item) => entryFor(item));
  const anyUnqueued = (items?: Zotero.Item[]) =>
    selected(items).some((item) => queueTarget(item) && !entryFor(item));

  // Zotero adds the separator before plugin item menus itself and rejects
  // menus that bring their own
  const itemMenu = Zotero.MenuManager.registerMenu({
    menuID: "increading-item-menu",
    pluginID,
    target: "main/library/item",
    menus: [
      {
        menuType: "submenu",
        l10nID: getLocaleID("menu-submenu"),
        onShowing: (_ev, ctx) =>
          ctx.setVisible(selected(ctx.items).some((i) => queueTarget(i))),
        menus: [
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menu-add"),
            onShowing: (_ev, ctx) => ctx.setVisible(anyUnqueued(ctx.items)),
            onCommand: (_ev, ctx) => {
              const priority = promptPriority(defaultPriority());
              if (priority !== undefined)
                void addItems(selected(ctx.items), priority);
            },
          },
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menu-set-priority"),
            onShowing: (_ev, ctx) => ctx.setVisible(anyQueued(ctx.items)),
            onCommand: (_ev, ctx) => {
              const items = selected(ctx.items);
              const current = entryFor(items[0])?.priority ?? defaultPriority();
              const priority = promptPriority(current);
              if (priority !== undefined) void setPriority(items, priority);
            },
          },
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menu-mark-read"),
            onShowing: (_ev, ctx) => ctx.setVisible(anyQueued(ctx.items)),
            onCommand: (_ev, ctx) => void markRead(selected(ctx.items)),
          },
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menu-postpone"),
            onShowing: (_ev, ctx) => ctx.setVisible(anyQueued(ctx.items)),
            onCommand: (_ev, ctx) => void postpone(selected(ctx.items)),
          },
          {
            menuType: "menuitem",
            l10nID: getLocaleID("menu-remove"),
            onShowing: (_ev, ctx) => ctx.setVisible(anyQueued(ctx.items)),
            onCommand: (_ev, ctx) => void removeItems(selected(ctx.items)),
          },
        ],
      },
    ],
  });

  const toolsMenu = Zotero.MenuManager.registerMenu({
    menuID: "increading-tools-menu",
    pluginID,
    target: "main/menubar/tools",
    menus: [
      { menuType: "separator" },
      {
        menuType: "menuitem",
        l10nID: getLocaleID("menu-read-next"),
        onCommand: () => void readNext(),
      },
    ],
  });

  // A rejected menu is only reported in the debug log, so fail startup instead
  if (!itemMenu || !toolsMenu) {
    throw new Error("Failed to register Incremental Reading menus");
  }
}

/** Cmd/Ctrl+Alt+N opens the next due item, from the library or a reader. */
export function registerShortcut() {
  ztoolkit.Keyboard.register((ev, { type }) => {
    if (type !== "keydown" || ev.code !== "KeyN") return;
    const accel = Zotero.isMac ? ev.metaKey : ev.ctrlKey;
    if (!accel || !ev.altKey || ev.shiftKey) return;
    ev.preventDefault();
    void readNext();
  });
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
) {
  const node = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function button(doc: Document, label: string, onClick: () => unknown) {
  const b = el(doc, "button", { textContent: label });
  b.addEventListener("click", () => void onClick());
  return b;
}

function renderSection(
  doc: Document,
  body: HTMLDivElement,
  item: Zotero.Item,
  setSummary: (summary: string) => void,
) {
  const target = queueTarget(item);
  body.replaceChildren();
  if (!target) {
    setSummary("");
    return;
  }
  const entry = getEntry(target);
  const row = (...children: (Node | string)[]) =>
    el(doc, "div", { className: "increading-row" }, children);

  const priorityInput = el(doc, "input", {
    type: "number",
    min: "0",
    max: "100",
    value: String(entry?.priority ?? defaultPriority()),
    className: "increading-priority",
  });
  const priorityValue = () => Number(priorityInput.value);

  if (!entry) {
    setSummary(getString("section-not-queued"));
    body.append(
      row(
        getString("section-priority"),
        priorityInput,
        button(doc, getString("section-add"), () =>
          addItems([target], priorityValue()),
        ),
      ),
    );
    return;
  }

  const due = describeDue(entry.due, today());
  setSummary(getString("section-summary", { args: { due } }));
  priorityInput.addEventListener("change", () => {
    if (priorityInput.value !== "") void setPriority([target], priorityValue());
  });
  body.append(
    row(getString("section-priority"), priorityInput),
    row(
      getString("section-status", {
        args: {
          due: entry.due,
          relative: due,
          interval: entry.interval,
          reviews: entry.reviews,
        },
      }),
    ),
    row(
      button(doc, getString("section-done-next"), () => doneAndNext(target)),
      button(doc, getString("section-done"), () => markRead([target])),
      button(doc, getString("section-postpone"), () => postpone([target])),
      button(doc, getString("section-remove"), () => removeItems([target])),
    ),
  );
}

export function registerItemPaneSection() {
  const unsubscribers = new WeakMap<HTMLDivElement, () => void>();
  const section = Zotero.ItemPaneManager.registerSection({
    paneID: "increading-queue",
    pluginID: addon.data.config.addonID,
    header: {
      l10nID: getLocaleID("section-head"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/section.svg`,
    },
    sidenav: {
      l10nID: getLocaleID("section-sidenav"),
      icon: `chrome://${addon.data.config.addonRef}/content/icons/sidenav.svg`,
    },
    sectionButtons: [
      {
        type: "readNext",
        icon: "chrome://zotero/skin/16/universal/book.svg",
        l10nID: getLocaleID("section-read-next"),
        onClick: () => void readNext(),
      },
    ],
    onInit: ({ body, refresh }) => {
      unsubscribers.set(
        body,
        onQueueChange(() => void refresh()),
      );
    },
    onDestroy: ({ body }) => {
      unsubscribers.get(body)?.();
      unsubscribers.delete(body);
    },
    onItemChange: ({ item, setEnabled }) => {
      setEnabled(!!queueTarget(item));
      return true;
    },
    onRender: ({ doc, body, item, setSectionSummary }) => {
      renderSection(doc, body, item, setSectionSummary);
    },
  });
  if (!section) {
    throw new Error("Failed to register Incremental Reading item pane section");
  }
}
