import { getString } from "../utils/locale";
import { isWindowAlive } from "../utils/window";
import {
  dueQueue,
  onQueueChange,
  openItem,
  removeItems,
  setPriority,
  upcomingQueue,
} from "./queue";
import { QueueEntry, describeDue, today } from "./schedule";

const HTML_NS = "http://www.w3.org/1999/xhtml";

const STYLE = `
  body { margin: 0; font: message-box; }
  #increading-queue { padding: 12px 16px; overflow: auto; height: 100vh; box-sizing: border-box; }
  h2 { font-size: 1.1em; margin: 12px 0 6px; }
  h2:first-child { margin-top: 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
  th { font-weight: 600; opacity: 0.7; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.entry:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  td.title { cursor: pointer; max-width: 32em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  input.priority { width: 3.5em; }
  .empty { opacity: 0.7; padding: 4px 0; }
`;

let dialog: InstanceType<typeof ztoolkit.Dialog> | undefined;

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

function itemSubtitle(item: Zotero.Item) {
  const year = (item.getField("date", true, true) as string).slice(0, 4);
  return [item.firstCreator, year !== "0000" ? year : ""]
    .filter(Boolean)
    .join(", ");
}

function renderTable(
  doc: Document,
  rows: { entry: QueueEntry; item: Zotero.Item }[],
  now: string,
) {
  if (!rows.length) {
    return el(doc, "div", {
      className: "empty",
      textContent: getString("queue-empty"),
    });
  }
  const head = el(doc, "tr", {}, [
    el(doc, "th", { className: "num", textContent: "#" }),
    el(doc, "th", { textContent: getString("queue-col-title") }),
    el(doc, "th", { textContent: getString("queue-col-priority") }),
    el(doc, "th", { textContent: getString("queue-col-due") }),
    el(doc, "th", {
      className: "num",
      textContent: getString("queue-col-interval"),
    }),
    el(doc, "th", {
      className: "num",
      textContent: getString("queue-col-reads"),
    }),
    el(doc, "th"),
  ]);
  const body = rows.map(({ entry, item }, i) => {
    const priority = el(doc, "input", {
      type: "number",
      min: "0",
      max: "100",
      value: String(entry.priority),
      className: "priority",
    });
    priority.addEventListener("change", () => {
      if (priority.value !== "")
        void setPriority([item], Number(priority.value));
    });
    const title = el(
      doc,
      "td",
      {
        className: "title",
        title: getString("queue-open-hint"),
      },
      [item.getDisplayTitle()],
    );
    const subtitle = itemSubtitle(item);
    if (subtitle) {
      title.append(" ", el(doc, "small", { textContent: `— ${subtitle}` }));
    }
    title.addEventListener("dblclick", () => void openItem(item));
    const remove = el(doc, "button", {
      textContent: "×",
      title: getString("queue-remove"),
    });
    remove.addEventListener("click", () => void removeItems([item]));
    return el(doc, "tr", { className: "entry" }, [
      el(doc, "td", { className: "num", textContent: String(i + 1) }),
      title,
      el(doc, "td", {}, [priority]),
      el(doc, "td", {
        textContent: `${entry.due} (${describeDue(entry.due, now)})`,
      }),
      el(doc, "td", { className: "num", textContent: `${entry.interval}d` }),
      el(doc, "td", { className: "num", textContent: String(entry.reviews) }),
      el(doc, "td", {}, [remove]),
    ]);
  });
  return el(doc, "table", {}, [
    el(doc, "thead", {}, [head]),
    el(doc, "tbody", {}, body),
  ]);
}

async function render(doc: Document) {
  const container = doc.getElementById("increading-queue");
  if (!container) return;
  const now = today();
  const [due, upcoming] = await Promise.all([dueQueue(), upcomingQueue()]);
  container.replaceChildren(
    el(doc, "h2", {
      textContent: getString("queue-due-heading", {
        args: { count: due.length },
      }),
    }),
    renderTable(doc, due, now),
    el(doc, "h2", {
      textContent: getString("queue-upcoming-heading", {
        args: { count: upcoming.length },
      }),
    }),
    renderTable(doc, upcoming, now),
  );
}

/** Open the queue window, or focus it if it is already open. */
export async function showQueue() {
  if (isWindowAlive(dialog?.window)) {
    dialog!.window.focus();
    return;
  }
  const dialogData: Record<string, any> = {};
  dialog = new ztoolkit.Dialog(1, 1)
    .addCell(0, 0, {
      tag: "div",
      namespace: "html",
      children: [
        { tag: "style", namespace: "html", properties: { textContent: STYLE } },
        { tag: "div", namespace: "html", id: "increading-queue" },
      ],
      styles: { width: "100%" },
    })
    .setDialogData(dialogData)
    .open(getString("queue-window-title"), {
      width: 820,
      height: 520,
      centerscreen: true,
      resizable: true,
      noDialogMode: true,
    });
  await dialogData.loadLock.promise;
  const doc = dialog.window.document;
  // Changes made from the window itself, the item pane or menus all re-render
  const unsubscribe = onQueueChange(() => void render(doc));
  dialog.window.addEventListener("unload", unsubscribe);
  await render(doc);
}

export function closeQueue() {
  if (isWindowAlive(dialog?.window)) dialog!.window.close();
  dialog = undefined;
}
