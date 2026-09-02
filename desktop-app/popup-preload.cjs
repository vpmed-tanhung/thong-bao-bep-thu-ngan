const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("trayApp", {
  onState(callback) {
    ipcRenderer.on("tray-state", (_event, state) => callback(state));
  },
  openCashier() {
    ipcRenderer.send("open-cashier");
  },
  markRead() {
    ipcRenderer.send("mark-read");
  }
});
