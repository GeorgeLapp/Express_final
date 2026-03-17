# Nginx config for express1.ru (front on :3000, backend on :3001, billing on :3010)

Based on your current express1_ru.conf:
- /           -> http://localhost:3000 (front only)
- /backend/   -> http://localhost:3001/
- SSL paths and no-cache for /
- HTTP->HTTPS redirect

Added:
- billing upstream -> http://127.0.0.1:3010
- T-Bank callbacks/redirects routed to billing:
  /api/tbank/notification
  /api/tbank/success
  /api/tbank/fail
- Billing API under /api/billing/ routed to billing upstream
- Robokassa endpoints return 410 (disabled)
- Standalone static frontend:
  /trc_golden_frontend/ -> /var/www/trc_golden_frontend/

## Install
1) Copy snippets:
   sudo cp nginx/snippets/*.conf /etc/nginx/snippets/

2) Copy site:
   sudo cp nginx/sites-available/express1_ru.conf /etc/nginx/sites-available/express1_ru.conf

3) Enable:
   sudo ln -sf /etc/nginx/sites-available/express1_ru.conf /etc/nginx/sites-enabled/express1_ru.conf

4) Test and reload:
   sudo nginx -t
   sudo systemctl reload nginx

## Deploy trc_golden_frontend (isolated static frontend)
1) Copy frontend files to isolated directory:
   sudo mkdir -p /var/www/trc_golden_frontend
   sudo rsync -av --delete trc_golden_frontend/ /var/www/trc_golden_frontend/

2) Ensure nginx config is updated from this repo:
   sudo cp nginx/sites-available/express1_ru.conf /etc/nginx/sites-available/express1_ru.conf

3) Test and reload:
   sudo nginx -t
   sudo systemctl reload nginx

## T-Bank terminal URLs
Set in terminal settings:
- NotificationURL: https://express1.ru/api/tbank/notification
- SuccessURL:      https://express1.ru/api/tbank/success
- FailURL:         https://express1.ru/api/tbank/fail
