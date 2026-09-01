(() => {
  "use strict";

  const isInstalledApp =
    new URLSearchParams(location.search).get("bep_app") === "installed" ||
    Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches) ||
    window.navigator.standalone === true;

  let deferredInstallPrompt;

  function getInstallButton() {
    return document.querySelector("#installAppButton");
  }

  function hideInstallButton() {
    getInstallButton()?.classList.add("hidden");
  }

  function showInstallButton() {
    if (!isInstalledApp) getInstallButton()?.classList.remove("hidden");
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch (error) {
      console.error("Không đăng ký được ứng dụng Bếp.", error);
    }
  }

  function bindInstallButton() {
    const button = getInstallButton();
    if (!button || isInstalledApp) {
      hideInstallButton();
      return;
    }

    button.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      button.disabled = true;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = undefined;
      hideInstallButton();
      button.disabled = false;
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = undefined;
    hideInstallButton();
  });

  registerServiceWorker();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindInstallButton, { once: true });
  } else {
    bindInstallButton();
  }
})();
