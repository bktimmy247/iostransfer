# iPhone File Transfer

Phần mềm chuyển file từ iPhone/iPad sang PC trong cùng mạng Wi‑Fi.

## Cách hoạt động

1. PC chạy app/EXE local.
2. iPhone/iPad cùng Wi‑Fi mở link LAN hoặc scan QR.
3. Chọn nhiều file trong Photos/Files.
4. File upload thẳng vào thư mục trên PC.

Không dùng cloud, không cần cài app iOS.

## Hỗ trợ file

- Video: `.mov`, `.mp4`, `.m4v`, `.mkv`, ...
- Ảnh: `.jpg`, `.png`, `.heic`, ...
- Tài liệu: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt`, ...
- Âm thanh: `.mp3`, `.wav`, `.m4a`, ...
- File nén: `.zip`, `.rar`, `.7z`, ...

Có thể chọn nhiều file cùng lúc. iOS Safari thường không hỗ trợ chọn nguyên thư mục, nên nếu cần gửi thư mục hãy nén thành `.zip` rồi gửi.

## Chạy source trên PC

```powershell
npm install
npm start
```

Mở trên PC:

```text
http://127.0.0.1:8799
```

Mở trên iPhone/iPad:

- Dùng link LAN mà app/terminal in ra, ví dụ `http://192.168.1.10:8799`.
- Hoặc mở app trên PC rồi scan QR.

## Thư mục nhận file

Bản EXE lưu mặc định vào:

```text
C:\Users\<User>\Downloads\iPhone File Transfer
```

Khi chạy source, file nằm trong:

```text
projects/iphone-video-transfer/uploads/
```

## Nếu iPhone không vào được

- PC và iPhone/iPad phải cùng Wi‑Fi.
- Cho phép Windows Firewall/Node.js/Electron nhận kết nối private network.
- Thử mở `http://<IP-PC>:8799` trực tiếp trong Safari.

## Giới hạn MVP

- Chưa có mật khẩu bảo vệ; chỉ dùng trong mạng Wi‑Fi tin cậy.
- Chưa có resume upload nếu mất mạng.
- Chưa hỗ trợ chọn nguyên folder trên iOS; hãy zip folder trước khi gửi.
