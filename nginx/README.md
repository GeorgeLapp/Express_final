# Nginx config for express1.ru (front on :3000, backend on :3001, billing on :3010)

Based on your current express1_ru.conf:
- /           -> http://localhost:3000 (front only)
- /backend/   -> http://localhost:3001/
- SSL paths and no-cache for /
- HTTP->HTTPS redirect

Added:
- billing upstream -> http://127.0.0.1:3010
- Robokassa callbacks/redirects routed to billing:
  /api/robokassa/result
  /api/robokassa/success
  /api/robokassa/fail
- (Optional) Billing API under /api/billing/ routed to billing upstream

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

## Robokassa cabinet URLs
Set exactly:
- ResultURL:  https://express1.ru/api/robokassa/result
- SuccessURL: https://express1.ru/api/robokassa/success
- FailURL:    https://express1.ru/api/robokassa/fail
