/* Cấu hình trang LegitShop API. Sửa ở đây, không cần đụng app.js. */
window.LS_CONFIG = {
  // Backend API mà trang gọi tới (các đường dẫn /api/* và /v1/* có bật CORS).
  API_BASE: 'https://api.bddevlab.online',
  // Link API hiện trong tab "Cài đặt API Key" (Claude Code, Codex, curl). Để trống = dùng API_BASE.
  SETUP_BASE: 'https://api.bddevlab.buzz',
  // 1 Credit = bao nhiêu quota của backend New API.
  QUOTA_PER_CREDIT: 100000,
  // Tên provider trong config Codex và biến môi trường chứa key.
  CODEX_PROVIDER: 'legitshop',
  CODEX_ENV_KEY: 'LEGITSHOP_API_KEY',
  // Tự làm mới số liệu (giây). 0 = tắt.
  REFRESH_SEC: 30
};
