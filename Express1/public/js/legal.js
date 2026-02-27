(function () {
  const link = document.getElementById('offer-download-link');
  if (!link) return;

  const fallbackUrl = new URL(
    link.getAttribute('href') || './docs/oferta_665803826172.pdf',
    window.location.href
  ).toString();
  const tgOpenLink = window.Telegram?.WebApp?.openLink;

  link.addEventListener('click', (event) => {
    // In Telegram WebView, opening via SDK is more reliable than "download" attr.
    if (typeof tgOpenLink !== 'function') {
      return;
    }

    event.preventDefault();
    try {
      tgOpenLink(fallbackUrl, { try_instant_view: false });
    } catch (_) {
      window.location.href = fallbackUrl;
    }
  });
})();
