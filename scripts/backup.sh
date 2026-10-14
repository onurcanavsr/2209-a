#!/usr/bin/env bash
# Haftalık Supabase yedeği. Sunucuda cron ile çalışır.
# ~/.backup.env içinde: DATABASE_URL="postgresql://postgres.xxxx:PAROLA@...supabase.com:5432/postgres"
# (Supabase > Connect > Session pooler bağlantı dizesi). Dosya chmod 600 olmalı.
set -euo pipefail
source ~/.backup.env
mkdir -p ~/backups
OUT=~/backups/db-$(date +%F).sql.gz
docker run --rm postgres:17 pg_dump "$DATABASE_URL" --no-owner --schema=public | gzip > "$OUT"
# Son 8 yedeği tut
ls -1t ~/backups/db-*.sql.gz | tail -n +9 | xargs -r rm --
echo "Yedek alındı: $OUT"
