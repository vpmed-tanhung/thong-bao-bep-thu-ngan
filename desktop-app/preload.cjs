const { ipcRenderer } = require("electron");

function observeKitchenNotices() {
  const historyList = document.querySelector("#historyList");
  if (!historyList) {
    window.setTimeout(observeKitchenNotices, 500);
    return;
  }

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const message = node.dataset.kitchenMessage?.trim();
        if (message) ipcRenderer.send("cashier-event", { message });
      });
    });
  });
  observer.observe(historyList, { childList: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeKitchenNotices, { once: true });
} else {
  observeKitchenNotices();
}
