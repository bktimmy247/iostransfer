# iOS Transfer Sender

Expo companion app để chọn file/video bằng native picker trên iPhone rồi gửi về PC receiver.

## Chạy thử bằng Expo Go

```powershell
cd mobile-sender
npm install
npm start
```

Mở Expo Go trên iPhone và scan QR.

## Cách dùng

1. Trên PC chạy `iPhoneFileTransfer-Portable.exe`.
2. Copy địa chỉ LAN, ví dụ `http://192.168.100.2:8799`.
3. Dán vào app Expo.
4. Chọn file/video.
5. Bấm upload.

MVP này dùng `expo-file-system.uploadAsync()` để iOS upload từ file URI native, tránh Safari giữ file lớn trong bộ nhớ tab web.
