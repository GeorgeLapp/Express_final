(function () {
  const link = document.getElementById('offer-download-link');
  if (!link) return;

  const fileName = 'oferta_665803826172.docx';
  const fallbackUrl = new URL(
    link.getAttribute('href') || './docs/oferta_665803826172.docx',
    window.location.href
  ).toString();

  async function downloadThroughBlob(url, name) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const mime =
      blob.type ||
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const file = new File([blob], name, { type: mime });

    if (
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: 'Оферта' });
      return true;
    }

    const objectUrl = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = objectUrl;
    tempLink.download = name;
    tempLink.rel = 'noopener';
    tempLink.style.display = 'none';
    document.body.appendChild(tempLink);
    tempLink.click();

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      tempLink.remove();
    }, 1000);

    return true;
  }

  link.addEventListener('click', async (event) => {
    event.preventDefault();

    const tgOpenLink = window.Telegram?.WebApp?.openLink;
    if (typeof tgOpenLink === 'function') {
      try {
        tgOpenLink(fallbackUrl, { try_instant_view: false });
        return;
      } catch (_) {
        // Continue to browser fallbacks.
      }
    }

    try {
      const ok = await downloadThroughBlob(fallbackUrl, fileName);
      if (ok) return;
    } catch (_) {
      // Continue to final fallback.
    }

    const opened = window.open(fallbackUrl, '_blank', 'noopener');
    if (!opened) {
      window.location.href = fallbackUrl;
    }
  });
})();
