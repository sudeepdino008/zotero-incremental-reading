import { QueueEntry } from "./schedule";

/**
 * Queue state lives in its own SQLite file (<data dir>/incrementalreading.sqlite)
 * rather than in item fields, so it never touches the library or sync.
 * All rows are mirrored in memory because item tree columns read synchronously.
 */

const DB_NAME = "incrementalreading";

let db: _ZoteroTypes.DBConnection | undefined;
const cache = new Map<string, QueueEntry>();

const cacheKey = (libraryID: number, itemKey: string) =>
  `${libraryID}/${itemKey}`;

export async function openStore() {
  db = new Zotero.DBConnection(DB_NAME);
  await db.queryAsync(
    `CREATE TABLE IF NOT EXISTS queue (
      libraryID INT NOT NULL,
      itemKey TEXT NOT NULL,
      priority INT NOT NULL,
      due TEXT NOT NULL,
      interval INT NOT NULL,
      reviews INT NOT NULL DEFAULT 0,
      addedAt TEXT NOT NULL,
      lastReadAt TEXT,
      PRIMARY KEY (libraryID, itemKey)
    )`,
  );
  const rows = ((await db.queryAsync("SELECT * FROM queue")) || []) as any[];
  cache.clear();
  for (const row of rows) {
    const entry: QueueEntry = {
      libraryID: row.libraryID,
      itemKey: row.itemKey,
      priority: row.priority,
      due: row.due,
      interval: row.interval,
      reviews: row.reviews,
      addedAt: row.addedAt,
      lastReadAt: row.lastReadAt,
    };
    cache.set(cacheKey(entry.libraryID, entry.itemKey), entry);
  }
}

export async function closeStore() {
  await db?.closeDatabase(true);
  db = undefined;
  cache.clear();
}

export function getEntry(item: Zotero.Item): QueueEntry | undefined {
  return cache.get(cacheKey(item.libraryID, item.key));
}

export function allEntries(): QueueEntry[] {
  return [...cache.values()];
}

export async function putEntry(entry: QueueEntry) {
  await db!.queryAsync(
    `INSERT OR REPLACE INTO queue
      (libraryID, itemKey, priority, due, interval, reviews, addedAt, lastReadAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.libraryID,
      entry.itemKey,
      entry.priority,
      entry.due,
      entry.interval,
      entry.reviews,
      entry.addedAt,
      entry.lastReadAt,
    ],
  );
  cache.set(cacheKey(entry.libraryID, entry.itemKey), entry);
}

export async function deleteEntry(libraryID: number, itemKey: string) {
  await db!.queryAsync(
    "DELETE FROM queue WHERE libraryID = ? AND itemKey = ?",
    [libraryID, itemKey],
  );
  cache.delete(cacheKey(libraryID, itemKey));
}
