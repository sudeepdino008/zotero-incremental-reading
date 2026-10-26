import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("should have plugin instance defined", function () {
    assert.isNotEmpty(Zotero[config.addonInstance]);
  });

  it("should show shortcuts in the tools menu", function () {
    const doc = Zotero.getMainWindow().document;
    const popup = doc.getElementById("menu_ToolsPopup")!;
    popup.dispatchEvent(new Event("popupshowing"));
    const menuKey = (l10n: string) =>
      [...popup.querySelectorAll("menuitem")]
        .find((m) => m.getAttribute("data-l10n-id")?.endsWith(l10n))
        ?.getAttribute("key");
    const modifiers = (id?: string | null) =>
      doc.getElementById(id!)?.getAttribute("modifiers");
    assert.equal(modifiers(menuKey("menu-read-next")), "accel,alt");
    assert.equal(modifiers(menuKey("menu-done-next")), "accel,alt,shift");
  });
});
