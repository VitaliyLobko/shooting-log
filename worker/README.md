# Студійне фото — Worker

`studio.js` вирізає зброю з фону для кнопки «✨ Студія» у перегляді фото. Вирізання робить
Cloudflare Images (`segment=foreground`, модель BiRefNet); тло, тінь і нахил малює вже застосунок
(`js/studio.js`).

## Ліміти

- Безкоштовний план Cloudflare Images — 5000 перетворень на місяць. Понад це Cloudflare **не бере
  грошей**, а відповідає помилкою 9422 → застосунок пише «Ліміт студійних фото на цей місяць вичерпано».
- Worker сам тримає денні ліміти: `PER_IP_DAY` (20 фото з однієї адреси) і `PER_DAY` (150 на всіх,
  ≈ 5000 / 31) — щоб один день не з'їв місяць.
- Фото не зберігається. У D1 — лише лічильники: дата, хеш IP з датою, кількість.

## Розгортання (дашборд Cloudflare)

1. **Storage & Databases → D1 → Create** — база `shooters-studio`.
2. **Workers & Pages → Create → Worker** — ім'я `shooters-studio`, вставити `studio.js`, Deploy.
   Адреса має бути `https://shooters-studio.hobbyplanner338.workers.dev` — вона вшита в
   `js/studio.js` і в CSP (`index.html`, `connect-src`).
3. Worker → **Settings → Bindings**: Images з іменем `IMAGES`; D1 Database з іменем `DB` → `shooters-studio`.
4. **Observability / Logs** не вмикати — у PRIVACY.md написано, що фото не потрапляє в журнали.
5. Перевірка одним фото:

   ```sh
   curl -s -X POST -H "Origin: https://vitaliylobko.github.io" -H "Content-Type: image/jpeg" \
     --data-binary @photo.jpg -o cut.webp -w "%{http_code} %{content_type}\n" \
     https://shooters-studio.hobbyplanner338.workers.dev/cutout
   ```

   Очікується `200 image/webp` і `cut.webp` з прозорим тлом. `502 {"reason":"images"}` з текстом —
   прив'язка Images не підтримує `segment`; тоді застосунок випускати не можна.

## Перевірки без Cloudflare

- `tools/pw/studio-worker.mjs` — логіка Worker (CORS, ліміти, 9422) на `node:sqlite` і заглушці Images.
- `tools/pw/studio-photo.mjs` — кнопка «✨ Студія» в застосунку з підміненим Worker: успіх, ліміт дня,
  ліміт місяця, немає мережі.
