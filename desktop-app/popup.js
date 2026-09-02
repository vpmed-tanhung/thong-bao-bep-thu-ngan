const message = document.querySelector("#message");
const time = document.querySelector("#time");

window.trayApp.onState((state) => {
  message.textContent = state.message || "Chưa có thông báo mới.";
  time.textContent = state.time ? `Nhận lúc ${state.time}` : "Ứng dụng đang chạy nền";
});

document.querySelector("#open").addEventListener("click", () => window.trayApp.openCashier());
document.querySelector("#read").addEventListener("click", () => window.trayApp.markRead());
