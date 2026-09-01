# Hệ thống thông báo realtime Bếp – Quầy thu ngân

Gói gồm:

- `index.html`: màn hình chọn khu vực Bếp hoặc Quầy thu ngân.
- `bep.html`: bếp cập nhật số lượng, báo hết/có lại và đóng khu vực.
- `quay.html`: thu ngân theo dõi tồn kho realtime và phát thông báo tiếng Việt.
- `database.rules.json`: Rules cho Firebase Realtime Database.
- `server.js`, `tts-providers.js`: API Node.js giữ kín khóa TTS trên Vercel.

Firebase đã được điền sẵn cho dự án `thong-bao-bep`; hai trang dùng chung `STORE_ID = "cua-hang-01"`.

## 1. Menu hiện tại

- Món có số lượng: bánh cuốn, bánh bao
- Sợi báo hết/có lại: bún, phở, bánh đa
- Topping báo hết/có lại: thịt lợn, thịt bò, thịt gà
- Cháo bò, cháo tim, cháo lợn

Bánh cuốn và bánh bao có số lượng. Khi còn từ 1 đến 4 suất, quầy nhận cảnh báo `Sắp hết ...`; khi về 0, quầy nhận cảnh báo `Hết ...`. Sợi, topping và cháo dùng nút báo hết/có lại.

## 2. Cấu hình Firebase

Nếu dùng Firebase hiện tại thì không cần thay cấu hình. Nếu chuyển sang dự án khác:

1. Tạo Firebase Web App và Realtime Database ở chế độ **Locked mode**.
2. Vào **Authentication → Sign-in method**, bật **Anonymous**.
3. Vào **Realtime Database → Rules**, dán `database.rules.json` rồi bấm **Publish**.
4. Dán cùng một `firebaseConfig` vào `bep.html` và `quay.html`.
5. Giữ cùng một `STORE_ID` trong hai file.

## 3. Cài TTS backend

Cần Node.js 20 trở lên. Mở Terminal/PowerShell tại thư mục `backend`, chạy:

```bash
npm install
```

Sao chép `.env.example` thành `.env`:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux**

```bash
cp .env.example .env
```

Mở `.env`, chọn đúng một nhà cung cấp bằng `TTS_PROVIDER` và điền khóa tương ứng.

### Cách dễ nhất: FPT.AI

```env
TTS_PROVIDER=fpt
FPT_AI_API_KEY=KHOA_FPT_CUA_BAN
FPT_AI_VOICE=banmai
FPT_AI_SPEED=0
```

Các giọng FPT.AI có thể thử: `banmai` (nữ Bắc), `leminh` (nam Bắc), `lannhi` (nữ Nam), `myan` (nữ Trung). Với câu ngắn tại quầy, nên bắt đầu bằng `banmai`, tốc độ `0`.

### Zalo AI

```env
TTS_PROVIDER=zalo
ZALO_AI_API_KEY=KHOA_ZALO_CUA_BAN
ZALO_AI_SPEAKER_ID=1
ZALO_AI_SPEED=1.0
```

### Google Cloud TTS

```env
TTS_PROVIDER=google
GOOGLE_TTS_API_KEY=KHOA_GOOGLE_CUA_BAN
GOOGLE_TTS_VOICE=vi-VN-Neural2-A
GOOGLE_TTS_SPEAKING_RATE=1.0
```

Không điền khóa vào `quay.html` hoặc `bep.html`. File `.gitignore` đã chặn `backend/.env` để tránh commit nhầm.

Khởi động backend:

```bash
npm start
```

Mở `http://localhost:3000/health`. Kết quả đúng có dạng:

```json
{"ok":true,"provider":"fpt"}
```

Thử tạo MP3:

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hết cháo tim"}' \
  --output test.mp3
```

FPT.AI và Zalo AI có thể trả link trước khi MP3 sẵn sàng. Backend đã tự chờ và tải file về rồi mới trả cho trình duyệt. Các câu trùng nhau được cache một giờ để giảm lượt gọi và chi phí.

## 4. Nối frontend với backend

Trong `quay.html`, địa chỉ đang dùng là:

```js
const TTS_API_URL = "https://thong-bao-bep-thu-ngan.vercel.app/api/tts";
```

- Nếu backend chạy trên chính máy thu ngân: giữ nguyên địa chỉ trên.
- Nếu deploy backend: thay bằng URL HTTPS, ví dụ `https://api-ten-cua-ban.example.com/api/tts`.
- Nếu mở `quay.html` trực tiếp bằng `file://`, giữ `ALLOW_FILE_ORIGIN=true` trong `.env`.
- Nếu chạy trang bằng Live Server, thêm đúng origin vào `ALLOWED_ORIGINS`, thường là `http://127.0.0.1:5500`.
- Khi đưa lên mạng thật, đặt `ALLOW_FILE_ORIGIN=false` và chỉ cho phép domain frontend thật trong `ALLOWED_ORIGINS`.

Frontend gửi `{ text }` lên backend, nhận Blob MP3, tạo Object URL, rồi phát bằng `new Audio()` dùng chung. Hàng đợi đảm bảo hai thông báo đến sát nhau không bị chồng tiếng.

## 5. Dùng trên hai máy

1. Trên máy thu ngân, chạy backend bằng `npm start`; cửa sổ Terminal phải được giữ mở.
2. Mở `quay.html`, nối loa và bấm **BẬT ÂM THANH** một lần.
3. Phải nghe câu thử “Đã bật âm thanh”.
4. Trên máy/điện thoại ở bếp, mở `bep.html` và bấm **BÁO HẾT**.
5. Quầy cập nhật màn hình và đọc đúng câu ngắn, ví dụ “Hết phở gà”.

Nếu nút âm thanh báo lỗi, kiểm tra theo thứ tự: cửa sổ backend còn chạy, trang `/health` mở được, API Key đúng, dịch vụ TTS đã được bật và tài khoản còn hạn mức.

## 6. Triển khai

Hai file HTML tĩnh có thể đưa lên GitHub Pages, Netlify hoặc Vercel. Backend Express phải chạy trên dịch vụ Node.js như Render, Railway, Fly.io, Cloud Run hoặc máy nội bộ luôn bật. Khi deploy backend:

1. Đặt các biến trong `.env` vào phần **Environment Variables** của dịch vụ; không upload file `.env` công khai.
2. Cập nhật `ALLOWED_ORIGINS` bằng domain của trang quầy.
3. Cập nhật `TTS_API_URL` trong `quay.html` bằng URL HTTPS của backend.
4. Deploy lại frontend.

## API contract

Yêu cầu:

```http
POST /api/tts
Content-Type: application/json

{"text":"Hết phở gà"}
```

Thành công: HTTP `200`, body là dữ liệu MP3 (`Content-Type: audio/mpeg`).

Lỗi nhập liệu hoặc nhà cung cấp:

```json
{"error":"Mô tả lỗi"}
```

Backend giới hạn độ dài, số lượt gọi, cache câu đã tạo và không trả API Key cho Client.
