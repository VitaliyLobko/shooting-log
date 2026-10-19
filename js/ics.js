// Календар .ics (RFC 5545): строки, які застосунок знає наперед, — подіями на цілий день у календарі телефону.

/** Текст поля .ics: екрануємо \ ; , і переноси рядків. */
const escape = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

/** Рядок довший за 75 байтів переноситься з пробілом на початку наступного, не розрізаючи символ UTF-8. */
function fold(line) {
  const enc = new TextEncoder();
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // Продовження починається з пробілу — йому лишається 74 байти
    if (bytes + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compact = (iso) => iso.replaceAll('-', '');
const nextDay = (iso) => new Date(Date.parse(iso) + 864e5).toISOString().slice(0, 10);

/**
 * Календар із подій { uid, date: 'YYYY-MM-DD', title, note? }: кожна — на цілий день із нагадуванням о 9:00.
 * uid сталий — повторне завантаження оновлює ті самі події, а не плодить нові (де календар це вміє).
 */
export function icsCalendar(events, { name = null, now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shooters Log//UA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(name ? [`X-WR-CALNAME:${escape(name)}`] : []),
    ...events.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
      `SUMMARY:${escape(e.title)}`, ...(e.note ? [`DESCRIPTION:${escape(e.note)}`] : []), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(e.title)}`, 'TRIGGER;RELATED=START:PT9H', 'END:VALARM',
      'END:VEVENT']),
    'END:VCALENDAR'];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Одна подія в Google Календарі: відкриває готову подію в застосунку чи на сайті — лишається зберегти. */
export function googleCalendarLink(e) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${compact(e.date)}/${compact(nextDay(e.date))}` });
  if (e.note) q.set('details', e.note);
  return `https://calendar.google.com/calendar/render?${q}`;
}
