# Ứng dụng Thu ngân chạy nền trên Windows

Ứng dụng chỉ dành cho máy Thu ngân. Trang Bếp và Firebase vẫn hoạt động như hiện tại.

## Chức năng

- Đóng cửa sổ nhưng ứng dụng vẫn chạy trong khay hệ thống Windows.
- Nhận cảnh báo từ Bếp, hiện thông báo Windows và đọc giọng nói.
- Icon có chấm đỏ khi có cảnh báo mới.
- Bấm icon mở bảng thông báo nhỏ; nhấp đúp mở đầy đủ trang Thu ngân.
- Chuột phải icon để chọn **Mở Thu ngân** hoặc **Thoát**.
- Tự khởi động cùng Windows ở chế độ ẩn dưới khay hệ thống.
- Chỉ hiện một thông báo của ứng dụng; không dùng thông báo Chrome có đường dẫn website.

## Lấy file cài đặt từ GitHub

1. Tải toàn bộ dự án lên GitHub.
2. Mở tab **Actions**.
3. Chọn quy trình **Tao ung dung Thu ngan Windows**.
4. Chờ dấu tích xanh, mở lần chạy mới nhất.
5. Trong mục **Artifacts**, tải `Thu-ngan-Windows`.
6. Giải nén rồi chạy file có chữ `Setup` để cài đặt. File `.exe` còn lại là bản chạy trực tiếp không cần cài.

Windows có thể cảnh báo vì ứng dụng chưa mua chứng thư ký số. Chọn **More info → Run anyway** nếu file được tải đúng từ Actions của kho mã này.

Sau khi cài đặt, chuột phải icon khay hệ thống để bật hoặc tắt mục **Tự khởi động cùng Windows**.
