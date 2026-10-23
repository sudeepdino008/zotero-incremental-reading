# Zotero Incremental Reading

A SuperMemo-style reading queue for Zotero 8–10. It only decides **what to read
next**; making flashcards is left to you.

## How it works

- Queue items with a **priority** (0 = most important, 100 = least).
- **Read Next** (Tools menu, the section's header button, or <kbd>Cmd/Ctrl+Alt+N</kbd>)
  opens the highest-priority due item in the reader, which resumes where you
  left off. If nothing is due, it offers to read ahead.
- When you stop reading, use the **Incremental Reading** item-pane section:
  - **Done → Next**: reschedule, close the tab, open the next due item
  - **Done**: reschedule (interval × 1.5 with ±10% jitter, at least +1 day)
  - **Postpone**: push back by half the interval without growing it
  - **Remove**: take it out of the queue
- **IR Priority** and **IR Due** columns can be enabled in the item list
  (right-click the column header).

The queue is the parent item; it opens the item's best attachment, or its URL.
State lives in `<Zotero data dir>/incrementalreading.sqlite` and isn't synced.
Interval multiplier, default priority and first interval are in Settings →
Incremental Reading.

## Development

```sh
npm install
npm run build        # .scaffold/build/incremental-reading.xpi
npm test             # runs tests inside a throwaway Zotero instance
npm start            # hot-reload dev Zotero (needs .env, see .env.example)
```
