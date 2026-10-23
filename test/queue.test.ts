import { assert } from "chai";
import { config } from "../package.json";
import { addDays, today } from "../src/modules/schedule";

describe("queue", function () {
  // @ts-expect-error - Plugin instance is not typed
  const api = () => Zotero[config.addonInstance].api;

  it("adds, reschedules, postpones and removes an item", async function () {
    const item = new Zotero.Item("book");
    item.setField("title", "Queue test");
    await item.saveTx();

    await api().addItems([item], 30);
    let entry = api().entryFor(item);
    assert.equal(entry.priority, 30);
    assert.equal(entry.due, today());
    assert.equal(entry.interval, 1);

    const due = await api().dueQueue();
    assert.include(
      due.map((d: { item: Zotero.Item }) => d.item.id),
      item.id,
    );

    await api().markRead([item]);
    entry = api().entryFor(item);
    assert.equal(entry.reviews, 1);
    assert.isAbove(entry.interval, 1);
    assert.equal(entry.due, addDays(today(), entry.interval));

    await api().postpone([item]);
    entry = api().entryFor(item);
    assert.equal(entry.due, addDays(today(), Math.ceil(entry.interval / 2)));

    await api().removeItems([item]);
    assert.isUndefined(api().entryFor(item));
    await item.eraseTx();
  });

  it("drops entries whose item was deleted", async function () {
    const item = new Zotero.Item("book");
    await item.saveTx();
    await api().addItems([item], 10);
    await item.eraseTx();
    const due = await api().dueQueue();
    assert.notInclude(
      due.map((d: { item: Zotero.Item }) => d.item.key),
      item.key,
    );
  });
});
