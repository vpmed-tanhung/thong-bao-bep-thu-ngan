const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const CASHIER_URL = "https://vpmed-tanhung.github.io/thong-bao-bep-thu-ngan/quay.html?desktop_app=1";
const CASHIER_ORIGIN = "https://vpmed-tanhung.github.io";
const normalIconPath = path.join(__dirname, "assets", "tray-normal.png");
const alertIconPath = path.join(__dirname, "assets", "tray-alert.png");
const notificationIconPath = path.join(__dirname, "assets", "notification-icon.png");
const startHidden = process.argv.includes("--hidden");

let mainWindow;
let popupWindow;
let tray;
let isQuitting = false;
let unread = false;
let latestNotice = {
  message: "Chưa có thông báo mới.",
  time: ""
};

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function isAllowedCashierUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.origin === CASHIER_ORIGIN && url.pathname.endsWith("/thong-bao-bep-thu-ngan/quay.html");
  } catch (_error) {
    return false;
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    show: false,
    icon: notificationIconPath,
    title: "Thu ngân - Thông báo bếp",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  mainWindow.loadURL(CASHIER_URL);
  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode) => {
    if (errorCode === -3 || isQuitting) return;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(CASHIER_URL);
    }, 5_000);
  });
  mainWindow.webContents.on("render-process-gone", () => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedCashierUrl(url)) event.preventDefault();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    width: 390,
    height: 230,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "popup-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  popupWindow.loadFile(path.join(__dirname, "popup.html"));
  popupWindow.webContents.on("did-finish-load", updateTrayState);
  popupWindow.on("blur", () => popupWindow.hide());
}

function updateTrayState() {
  if (!tray) return;
  tray.setImage(unread ? alertIconPath : normalIconPath);
  tray.setToolTip(unread
    ? `Thu ngân - Có thông báo mới: ${latestNotice.message}`
    : "Thu ngân - Đang chạy nền");
  popupWindow?.webContents.send("tray-state", { unread, ...latestNotice });
}

function markAsRead() {
  unread = false;
  updateTrayState();
}

function positionPopup() {
  const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const [width, height] = popupWindow.getSize();
  popupWindow.setPosition(
    Math.round(workArea.x + workArea.width - width - 12),
    Math.round(workArea.y + workArea.height - height - 12),
    false
  );
}

function showPopup() {
  positionPopup();
  popupWindow.webContents.send("tray-state", { unread, ...latestNotice });
  popupWindow.show();
  popupWindow.focus();
  markAsRead();
}

function togglePopup() {
  if (popupWindow.isVisible()) popupWindow.hide();
  else showPopup();
}

function showMainWindow() {
  markAsRead();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function setAutoStart(enabled) {
  if (process.platform !== "win32") return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: ["--hidden"]
  });
}

function isAutoStartEnabled() {
  if (process.platform !== "win32") return false;
  return app.getLoginItemSettings({
    path: process.execPath,
    args: ["--hidden"]
  }).openAtLogin;
}

function configureAutoStartOnce() {
  if (process.platform !== "win32") return;
  const markerPath = path.join(app.getPath("userData"), "auto-start-configured");
  if (fs.existsSync(markerPath)) return;
  setAutoStart(true);
  fs.writeFileSync(markerPath, "enabled", "utf8");
}

function rebuildTrayMenu() {
  const shortenedMessage = latestNotice.message.length > 48
    ? `${latestNotice.message.slice(0, 45)}…`
    : latestNotice.message;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Mở Thu ngân", click: showMainWindow },
    { label: `Gần nhất: ${shortenedMessage}`, enabled: false },
    {
      label: "Tự khởi động cùng Windows",
      type: "checkbox",
      checked: isAutoStartEnabled(),
      click(item) {
        setAutoStart(item.checked);
        rebuildTrayMenu();
      }
    },
    { type: "separator" },
    {
      label: "Thoát",
      click() {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(normalIconPath));
  tray.on("click", togglePopup);
  tray.on("double-click", showMainWindow);
  rebuildTrayMenu();
  updateTrayState();
}

function showNativeNotice(message) {
  const notice = new Notification({
    title: "Thông báo từ bếp",
    body: message,
    icon: notificationIconPath,
    silent: false,
    timeoutType: "never"
  });
  notice.on("click", showMainWindow);
  notice.show();
}

ipcMain.on("cashier-event", (_event, payload) => {
  const message = typeof payload?.message === "string"
    ? payload.message.trim().slice(0, 200)
    : "";
  if (!message) return;

  latestNotice = {
    message,
    time: new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date())
  };
  unread = true;
  updateTrayState();
  rebuildTrayMenu();
  showNativeNotice(message);
});

ipcMain.on("open-cashier", showMainWindow);
ipcMain.on("mark-read", () => {
  markAsRead();
  popupWindow?.hide();
});

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId("vn.vpmed.thungan");
    configureAutoStartOnce();
    createMainWindow();
    createPopupWindow();
    createTray();
  });
}

app.on("window-all-closed", () => {
  // Ứng dụng tiếp tục chạy trong khay hệ thống cho đến khi chọn Thoát.
});

app.on("before-quit", () => {
  isQuitting = true;
});
