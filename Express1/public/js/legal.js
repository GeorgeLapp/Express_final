(function () {
  const link = document.getElementById('offer-download-link');
  const chromeLink = document.getElementById('offer-open-chrome-link');
  if (!link) return;

  const offerHref = link.getAttribute('href') || './docs/oferta_665803826172.pdf';
  const fallbackUrl = new URL(offerHref, window.location.href).toString();
  const tgOpenLink = window.Telegram?.WebApp?.openLink;

  const openThroughTelegram = (url, preferChrome) => {
    if (typeof tgOpenLink !== 'function') {
      return false;
    }

    if (preferChrome) {
      try {
        tgOpenLink(url, {
          try_instant_view: false,
          try_browser: 'google-chrome'
        });
        return true;
      } catch (_) {
        // Continue with default browser fallback.
      }
    }

    try {
      tgOpenLink(url, { try_instant_view: false });
      return true;
    } catch (_) {
      return false;
    }
  };

  link.addEventListener('click', (event) => {
    if (typeof tgOpenLink !== 'function') {
      return;
    }

    event.preventDefault();
    if (!openThroughTelegram(fallbackUrl, true)) {
      window.location.href = fallbackUrl;
    }
  });

  if (chromeLink) {
    chromeLink.addEventListener('click', (event) => {
      if (typeof tgOpenLink !== 'function') {
        return;
      }

      event.preventDefault();
      if (!openThroughTelegram(fallbackUrl, true)) {
        window.location.href = fallbackUrl;
      }
    });
  }
})();
