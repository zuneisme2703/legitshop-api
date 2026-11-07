# LegitShop API Console

Trang tĩnh để khách nhập API key và xem số dư, lịch sử request, phân bổ model, trạng thái model và cấu hình Claude Code / Codex. Chạy trên GitHub Pages, không cần máy chủ riêng.

## Cách hoạt động
- Trình duyệt của khách gọi thẳng backend (đặt trong `assets/config.js`, mặc định `https://api.bddevlab.online`) bằng key của họ: `/api/usage/token/`, `/api/log/token`, `/v1/models`, `/v1/chat/completions`. Các đường dẫn này có bật CORS.
- Trạng thái model, bảng giá, khuyến mãi và số liệu toàn cầu (`/key/status.json`, `/api/pricing`, `/key/promo-config.json`, `/key/feed.json`) KHÔNG bật CORS, nên GitHub Actions tải chúng mỗi 15 phút vào `data/` rồi đăng lại trang (`.github/workflows/pages.yml`).
- Key không đi qua GitHub. Nếu khách bật "Nhớ key", key chỉ nằm trong localStorage trên máy họ.

## Đăng lên GitHub Pages
1. Tạo repo mới trên GitHub (ví dụ `legitshop-api`), đẩy thư mục này lên nhánh `main`.
2. Vào **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow tự chạy khi push; xem ở tab **Actions**. Địa chỉ: `https://<tên-github>.github.io/legitshop-api/`.
4. (Tùy chọn) Tên miền riêng: thêm ở Settings → Pages → Custom domain, rồi trỏ CNAME về `<tên-github>.github.io`.

Repo free phải để **public** mới dùng được Pages.

## Xem thử trên máy
```bash
sh scripts/fetch-data.sh
python -m http.server 5510
```
Mở http://localhost:5510 , bấm "Xem dữ liệu mẫu" để xem giao diện khi chưa có key.

## Sửa nhanh
- Đổi backend, tỉ lệ Credit, tên provider Codex, chu kỳ làm mới: `assets/config.js`.
- Màu và font: biến ở đầu `assets/style.css` (theo bộ nhận diện LegitShop).
- Nội dung "Lỗi thường gặp": mảng `FAQ` trong `assets/app.js`.
