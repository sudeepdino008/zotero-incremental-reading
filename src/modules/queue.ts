import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import {
  QueueEntry,
  addDays,
  clampPriority,
  compareEntries,
  isDue,
  nextInterval,
  priorityMultiplier,
  postponeDays,
  today,
} from "./schedule";
import { allEntries, deleteEntry, getEntry, putEntry } from "./store";

const listeners = new Set<() => void>();

/** Called after any queue change so columns and item pane sections re-render. */
export function onQueueChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyChange() {
  Zotero.ItemTreeManager.refreshColumns();
  for (const listener of listeners) listener();
}

function prefNumber(
  key: "minMultiplier" | "maxMultiplier" | "defaultPriority" | "firstInterval",
  fallback: number,
) {
  const value = parseFloat(String(getPref(key)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function defaultPriority() {
  return clampPriority(prefNumber("defaultPriority", 50));
}

/**
 * The unit of the queue is the top-level item: a parent item stands in for
 * its attachments, and notes and annotations can't be queued.
 */
export function queueTarget(item: Zotero.Item | false | undefined) {
  if (!item) return undefined;
  if (item.isRegularItem()) return item;
  if (item.isAttachment()) return item.parentItem ?? item;
  return undefined;
}

export function entryFor(item: Zotero.Item | undefined) {
  const target = queueTarget(item);
  return target ? getEntry(target) : undefined;
}

function uniqueTargets(items: Zotero.Item[]) {
  const seen = new Map<number, Zotero.Item>();
  for (const item of items) {
    const target = queueTarget(item);
    if (target) seen.set(target.id, target);
  }
  return [...seen.values()];
}

export async function addItems(items: Zotero.Item[], priority: number) {
  const now = today();
  for (const item of uniqueTargets(items)) {
    const existing = getEntry(item);
    await putEntry(
      existing
        ? { ...existing, priority: clampPriority(priority) }
        : {
            libraryID: item.libraryID,
            itemKey: item.key,
            priority: clampPriority(priority),
            due: now,
            interval: prefNumber("firstInterval", 1),
            reviews: 0,
            addedAt: now,
            lastReadAt: null,
          },
    );
  }
  notifyChange();
}

export async function removeItems(items: Zotero.Item[]) {
  for (const item of uniqueTargets(items)) {
    await deleteEntry(item.libraryID, item.key);
  }
  notifyChange();
}

export async function setPriority(items: Zotero.Item[], priority: number) {
  for (const item of uniqueTargets(items)) {
    const entry = getEntry(item);
    if (entry) await putEntry({ ...entry, priority: clampPriority(priority) });
  }
  notifyChange();
}

/** Done reading for now: grow the interval and schedule the next reading. */
export async function markRead(items: Zotero.Item[]) {
  const now = today();
  const min = prefNumber("minMultiplier", 1.2);
  const max = prefNumber("maxMultiplier", 2);
  for (const item of uniqueTargets(items)) {
    const entry = getEntry(item);
    if (!entry) continue;
    const multiplier = priorityMultiplier(entry.priority, min, max);
    const interval = nextInterval(entry.interval, multiplier);
    await putEntry({
      ...entry,
      interval,
      due: addDays(now, interval),
      reviews: entry.reviews + 1,
      lastReadAt: now,
    });
  }
  notifyChange();
}

export async function postpone(items: Zotero.Item[]) {
  const now = today();
  for (const item of uniqueTargets(items)) {
    const entry = getEntry(item);
    if (!entry) continue;
    await putEntry({
      ...entry,
      due: addDays(now, postponeDays(entry.interval)),
    });
  }
  notifyChange();
}

/**
 * Resolve queue entries to live items, keeping their order and dropping entries whose
 * item was deleted and skipping items sitting in the trash.
 */
async function resolveQueue(entries: QueueEntry[]) {
  const resolved: { entry: QueueEntry; item: Zotero.Item }[] = [];
  for (const entry of entries) {
    const item = (await Zotero.Items.getByLibraryAndKeyAsync(
      entry.libraryID,
      entry.itemKey,
    )) as Zotero.Item | false;
    if (!item) {
      await deleteEntry(entry.libraryID, entry.itemKey);
      continue;
    }
    if (item.deleted) continue;
    resolved.push({ entry, item });
  }
  return resolved;
}

export async function dueQueue() {
  const now = today();
  return resolveQueue(
    allEntries()
      .filter((e) => isDue(e, now))
      .sort(compareEntries),
  );
}

/** Items not yet due, soonest first. */
export async function upcomingQueue(limit = Infinity) {
  const now = today();
  const upcoming = allEntries()
    .filter((e) => !isDue(e, now))
    .sort((a, b) => a.due.localeCompare(b.due) || compareEntries(a, b));
  return resolveQueue(upcoming.slice(0, limit));
}

function notify(
  text: string,
  type: "default" | "success" | "fail" = "default",
) {
  new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
  })
    .createLine({ text, type })
    .show();
}

export async function openItem(item: Zotero.Item) {
  const attachment = item.isAttachment()
    ? item
    : await item.getBestAttachment();
  const pane = ztoolkit.getGlobal("ZoteroPane");
  if (attachment) {
    await pane.viewAttachment(attachment.id);
    return;
  }
  const url = item.getField("url") as string;
  if (url) {
    Zotero.launchURL(url);
    return;
  }
  ztoolkit.getGlobal("Zotero_Tabs").select("zotero-pane");
  await pane.selectItem(item.id);
  notify(getString("notify-no-attachment"), "fail");
}

export async function readNext() {
  const [next] = await dueQueue();
  if (next) {
    await openItem(next.item);
    return;
  }
  const [upcoming] = await upcomingQueue(20);
  if (!upcoming) {
    notify(getString("notify-queue-empty"));
    return;
  }
  const readAhead = Services.prompt.confirm(
    Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
    addon.data.config.addonName,
    getString("prompt-read-ahead", {
      args: { title: upcoming.item.getDisplayTitle(), due: upcoming.entry.due },
    }),
  );
  if (readAhead) await openItem(upcoming.item);
}

/** Close the selected reader tab if it shows an attachment of `item`. */
function closeReaderTabFor(item: Zotero.Item) {
  const tabs = ztoolkit.getGlobal("Zotero_Tabs");
  const reader = Zotero.Reader.getByTabID(tabs.selectedID);
  if (!reader) return;
  const attachment = Zotero.Items.get(reader.itemID!);
  if (queueTarget(attachment)?.id === item.id) tabs.close(tabs.selectedID);
}

export async function doneAndNext(item: Zotero.Item) {
  const target = queueTarget(item);
  if (!target) return;
  await markRead([target]);
  closeReaderTabFor(target);
  await readNext();
}

/** Ask for a priority; returns undefined if cancelled or not a number. */
export function promptPriority(initial: number) {
  const value = { value: String(initial) };
  const ok = Services.prompt.prompt(
    Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
    addon.data.config.addonName,
    getString("prompt-priority"),
    value,
    "",
    { value: false },
  );
  if (!ok) return undefined;
  const priority = Number(value.value);
  return Number.isFinite(priority) ? clampPriority(priority) : undefined;
}
