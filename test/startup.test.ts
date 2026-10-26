import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("should show the read next shortcut in the tools menu", function () {
    const doc = Zotero.getMainWindow().document;
    const key = doc.getElementById("increading-key-read-next");
    assert.equal(key?.getAttribute("modifiers"), "accel,alt");
    const popup = doc.getElementById("menu_ToolsPopup")!;
    popup.dispatchEvent(new Event("popupshowing"));
    const item = [...popup.querySelectorAll("menuitem")].find((m) =>
      m.getAttribute("data-l10n-id")?.endsWith("menu-read-next"),
    );
    assert.equal(item?.getAttribute("key"), "increading-key-read-next");
  });
});
