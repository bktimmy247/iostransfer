# iPhone File Transfer / iOS Transfer

Bộ công cụ chuyển file từ iPhone/iPad sang PC trong cùng mạng Wi‑Fi.

Có 2 cách dùng:

1. **Web/Safari sender** — mở link LAN trên iPhone, phù hợp file nhỏ/vừa.
2. **Expo native sender** — app iPhone dùng native file picker + native upload, phù hợp hơn cho video dài/file lớn vì không phụ thuộc bộ nhớ tạm của Safari.

## PC receiver

Chạy bản portable trên Windows:

```text
C:\Users\Admin\Desktop\iPhoneFileTransfer-Portable.exe
```

Hoặc chạy source:

```powershell
npm install
npm start
```

Mở trên PC:

```text
http://127.0.0.1:8799
```

PC sẽ hiện URL LAN, ví dụ:

```text
http://192.168.100.2:8799
```

File nhận được lưu mặc định khi chạy EXE ở:

```text
C:\Users\<User>\Downloads\iPhone File Transfer
```

Khi chạy source, file nằm trong:

```text
projects/iphone-video-transfer/uploads/
```

## Web/Safari sender

Trên iPhone/iPad cùng Wi‑Fi, mở URL LAN của PC receiver trong Safari.

Hỗ trợ:

- nhiều file cùng lúc
- ảnh, video, PDF, DOCX, ZIP, audio...
- file lớn sẽ được chia chunk 6MB rồi PC ghép lại

Lưu ý: Safari/iOS có thể vẫn kém ổn định với video rất dài vì quản lý bộ nhớ tab web. Nếu video dài không gửi được, dùng Expo sender bên dưới.

## Expo native sender

Thư mục app:

```text
mobile-sender/
```

Chạy thử bằng Expo Go:

```powershell
cd mobile-sender
npm install
npm start
```

Trên iPhone:

1. Mở Expo Go.
2. Scan QR từ terminal Expo.
3. Dán URL LAN của PC receiver, ví dụ `http://192.168.100.2:8799`.
4. Bấm **Kiểm tra kết nối**.
5. Bấm **Chọn file/video**.
6. Bấm **Upload về PC**.

Expo sender dùng `expo-file-system.createUploadTask()` để iOS upload trực tiếp từ file URI native. Mục tiêu là tránh Safari phải giữ video lớn trong bộ nhớ tạm của tab web.

## Hỗ trợ file

- Video: `.mov`, `.mp4`, `.m4v`, `.mkv`, ...
- Ảnh: `.jpg`, `.png`, `.heic`, ...
- Tài liệu: `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt`, ...
- Âm thanh: `.mp3`, `.wav`, `.m4a`, ...
- File nén: `.zip`, `.rar`, `.7z`, ...

Có thể chọn nhiều file cùng lúc. iOS thường không hỗ trợ chọn nguyên thư mục; nếu cần gửi thư mục hãy nén thành `.zip` rồi gửi.

## Nếu iPhone không vào được PC

- PC và iPhone/iPad phải cùng Wi‑Fi.
- Cho phép Windows Firewall/Node.js/Electron nhận kết nối private network.
- Thử mở `http://<IP-PC>:8799` trực tiếp trong Safari.
- Nếu dùng Expo sender, URL phải là URL LAN của PC, không phải `127.0.0.1`.

## Giới hạn hiện tại

- Chưa có mật khẩu bảo vệ; chỉ dùng trong mạng Wi‑Fi tin cậy.
- Web sender đã có chunk upload, nhưng Safari vẫn có thể fail với video rất dài.
- Expo sender hiện là MVP chạy bằng Expo Go; nếu vẫn fail với video cực lớn, bước tiếp theo là build custom native app/dev build để upload stream/chunk sâu hơn ở native layer.
- Chưa có GitHub Release asset tự động vì máy hiện thiếu `gh`/token tạo release.
