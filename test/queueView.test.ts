import { assert } from "chai";
import { config } from "../package.json";

describe("queue window", function () {
  // @ts-expect-error - Plugin instance is not typed
  const api = () => Zotero[config.addonInstance].api;

  it("lists due and upcoming items and updates on change", async function () {
    const due = new Zotero.Item("book");
    due.setField("title", "Due book");
    const later = new Zotero.Item("book");
    later.setField("title", "Later book");
    await due.saveTx();
    await later.saveTx();
    await api().addItems([due, later], 20);
    await api().markRead([later]);

    await api().showQueue();
    const win = Zotero.getMainWindows()
      .concat(Array.from(Services.wm.getEnumerator(null)) as any[])
      .find((w: Window) => w.document?.getElementById("increading-queue"));
    assert.ok(win, "queue window is open");
    const tables = () =>
      Array.from(win.document.querySelectorAll("table")) as HTMLTableElement[];
    const titles = (t: HTMLTableElement) =>
      Array.from(t.querySelectorAll("td.title")).map(
        (td: any) => td.textContent,
      );

    assert.lengthOf(tables(), 2);
    assert.isTrue(titles(tables()[0]).some((t) => t.includes("Due book")));
    assert.isTrue(titles(tables()[1]).some((t) => t.includes("Later book")));

    await api().removeItems([due]);
    await Zotero.Promise.delay(200);
    assert.isFalse(
      Array.from(win.document.querySelectorAll("td.title")).some((td: any) =>
        td.textContent.includes("Due book"),
      ),
    );

    win.close();
    await api().removeItems([later]);
    await due.eraseTx();
    await later.eraseTx();
  });
});
