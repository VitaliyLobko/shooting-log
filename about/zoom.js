// Скрин чи відео по тапу — крупно поверх сторінки; ще тап або Esc — закрити
const dlg = document.createElement('dialog');
dlg.className = 'zoom';
document.body.append(dlg);

function open(phone) {
  const media = phone.querySelector('img, video');
  if (!media) return;
  let big;
  if (media.tagName === 'VIDEO') {
    big = Object.assign(document.createElement('video'), { src: media.currentSrc || media.src, poster: media.poster, muted: true, loop: true, playsInline: true });
    big.setAttribute('aria-label', media.getAttribute('aria-label') ?? '');
  } else {
    big = Object.assign(document.createElement('img'), { src: media.currentSrc || media.src, alt: media.alt });
  }
  dlg.replaceChildren(big);
  dlg.showModal();
  if (big.tagName === 'VIDEO') big.play().catch(() => {});
}

for (const phone of document.querySelectorAll('.phone')) {
  phone.tabIndex = 0;
  phone.setAttribute('role', 'button');
  phone.setAttribute('aria-label', 'Збільшити');
  phone.addEventListener('click', () => open(phone));
  phone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(phone); }
  });
}
dlg.addEventListener('click', () => dlg.close());
dlg.addEventListener('close', () => dlg.replaceChildren());
