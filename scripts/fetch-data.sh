#!/usr/bin/env sh
# Tải các file JSON công khai (không cần key) từ backend về thư mục data/.
# Lý do: các đường dẫn /key/*.json và /api/pricing không bật CORS nên trình duyệt
# trên GitHub Pages không gọi thẳng được. GitHub Actions chạy script này theo lịch
# rồi đăng kèm trang. Chạy tay khi xem thử trên máy: sh scripts/fetch-data.sh
set -e
API_BASE="${API_BASE:-https://api.bddevlab.online}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
mkdir -p "$DIR"
for f in key/status.json key/feed.json key/promo-config.json api/pricing; do
  out="$DIR/$(basename "$f" .json).json"
  if curl -fsS --max-time 20 "$API_BASE/$f" -o "$out.tmp"; then
    mv "$out.tmp" "$out"; echo "ok   $f"
  else
    rm -f "$out.tmp"; echo "lỗi $f (giữ bản cũ nếu có)"
  fi
done
# Không có bản trạng thái model nào thì báo lỗi để thấy ngay trong tab Actions.
[ -s "$DIR/status.json" ] && [ -s "$DIR/pricing.json" ] || { echo "Không tải được dữ liệu công khai"; exit 1; }
