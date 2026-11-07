// Значки й кольори категорій екіпірування. Свої значки — тут, решта — з Lucide (icons-lucide.js;
// після правки списку груп перезібрати: py dev/make_lucide.py <розпакований lucide-static>/package).
// Ключ значка зберігається в категорії — уже наявні ключі не перейменовувати.
import { LUCIDE } from './icons-lucide.js';

// Лінійні 24×24: колір і товщину задає CSS
const OWN = {
  armor: '<path d="M12 3l7 2.6V11c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V5.6z"/><path d="M8.5 9.5h7M8.5 13h7M10 16.5h4"/>',
  vest: '<path d="M8.5 3.5L5 5.5V20h14V5.5l-3.5-2L14 7h-4z"/><path d="M8.5 12h7M8.5 16h7"/>',
  earmuffs: '<path d="M4.5 14.5V12a7.5 7.5 0 0 1 15 0v2.5"/><rect x="3" y="13.5" width="4.5" height="7" rx="1.6"/><rect x="16.5" y="13.5" width="4.5" height="7" rx="1.6"/>',
  bottle: '<path d="M9.5 3h5M10.5 3v3.5h3V3"/><path d="M9 6.5h6l1 3.2V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9.7z"/><path d="M8 13h8"/>',
  'gun-case': '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4.5h6V7M3 12.5h18M10.8 11v3h2.4v-3"/>',
  flask: '<path d="M9 3h6M10 3v6L5 18.2A2 2 0 0 0 6.8 21h10.4a2 2 0 0 0 1.8-2.8L14 9V3"/><path d="M7.4 15h9.2"/>',
  crate: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  'price-tag': '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.6"/>',
};

/** SVG-вміст значка; невідомий ключ (новіша версія на іншому пристрої) — ящик. */
export const gearSvg = (key) => OWN[key] ?? LUCIDE[key] ?? OWN.crate;

// Групи значків для вибору: [ключ, назва]
export const GEAR_ICON_GROUPS = [
  { title: 'Захист і одяг', icons: [
    ['armor', 'Бронезахист'], ['vest', 'Плитоноска'], ['shield', 'Щит'],
    ['shield-half', 'Захист'], ['shield-plus', 'Посилений захист'], ['hard-hat', 'Шолом'],
    ['shirt', 'Одяг'], ['footprints', 'Взуття'], ['hand', 'Рукавиці'],
    ['glasses', 'Окуляри'], ['earmuffs', 'Навушники'], ['ear', 'Слух'],
    ['backpack', 'Рюкзак'], ['luggage', 'Сумка'],
  ] },
  { title: 'Оптика й прилади', icons: [
    ['crosshair', 'Приціл'], ['scan-eye', 'Тепловізор'], ['binoculars', 'Бінокль'],
    ['telescope', 'Зорова труба'], ['eye', 'Огляд'], ['moon', 'Нічне бачення'],
    ['ruler', 'Далекомір'], ['gauge', 'Хронограф'], ['thermometer', 'Метеостанція'],
    ['compass', 'Компас'], ['map', 'Карта'], ['map-pin', 'Точка'],
    ['watch', 'Годинник'], ['smartphone', 'Смартфон'], ['camera', 'Камера'],
    ['radio', 'Рація'], ['headphones', 'Гарнітура'], ['flashlight', 'Ліхтар'],
    ['lightbulb', 'Світло'], ['battery-full', 'Батарейки'], ['zap', 'Живлення'],
    ['cable', 'Кабель'], ['plug', 'Зарядка'],
  ] },
  { title: 'Похід і медицина', icons: [
    ['tent', 'Намет'], ['mountain', 'Гори'], ['trees', 'Ліс'],
    ['flame', 'Вогонь'], ['axe', 'Сокира'], ['pickaxe', 'Кайло'],
    ['shovel', 'Лопата'], ['utensils-crossed', 'Їжа'], ['sword', 'Ніж'],
    ['swords', 'Клинки'], ['briefcase-medical', 'Аптечка'], ['bandage', 'Бинт'],
    ['syringe', 'Шприц'], ['pill', 'Ліки'], ['cross', 'Хрест'],
    ['life-buoy', 'Рятування'], ['umbrella', 'Дощ'], ['snowflake', 'Зима'],
    ['sun', 'Літо'], ['dog', 'Собака'], ['paw-print', 'Сліди'], ['fish', 'Риболовля'],
  ] },
  { title: 'Чистка й майстерня', icons: [
    ['bottle', 'Мастило'], ['spray-can', 'Спрей'], ['droplet', 'Крапля'],
    ['droplets', 'Розчинник'], ['brush', 'Йорж'], ['paintbrush', 'Пензель'],
    ['wrench', 'Інструмент'], ['hammer', 'Молоток'], ['drill', 'Дриль'],
    ['cog', 'Механіка'], ['scissors', 'Ножиці'], ['magnet', 'Магніт'],
    ['flask', 'Релоад'], ['flask-conical', 'Хімія'], ['test-tube', 'Пробірка'],
    ['scale', 'Ваги'], ['layers', 'Набір'], ['hourglass', 'Пісочний годинник'],
    ['timer', 'Таймер'],
  ] },
  { title: 'Зберігання', icons: [
    ['gun-case', 'Кейс'], ['briefcase', 'Валіза'], ['crate', 'Ящик'],
    ['box', 'Коробка'], ['boxes', 'Коробки'], ['package', 'Посилка'],
    ['archive', 'Архів'], ['container', 'Контейнер'], ['lock', 'Замок'],
    ['key', 'Ключ'], ['vault', 'Сейф'],
  ] },
  { title: 'Інше', icons: [
    ['target', 'Мішень'], ['trophy', 'Кубок'], ['medal', 'Медаль'],
    ['star', 'Зірка'], ['heart', 'Улюблене'], ['gift', 'Подарунок'],
    ['tag', 'Ціна'], ['price-tag', 'Продаж'], ['shopping-cart', 'Покупки'],
    ['wallet', 'Гаманець'], ['gem', 'Цінне'], ['car', 'Авто'],
    ['truck', 'Вантажівка'], ['anchor', 'Якір'], ['rocket', 'Ракета'],
    ['bomb', 'Вибухівка'], ['siren', 'Сирена'], ['bell', 'Дзвінок'],
    ['fan', 'Вентилятор'], ['sticky-note', 'Нотатки'], ['notebook', 'Журнал'],
    ['book-open', 'Книга'], ['clock', 'Час'],
  ] },
];

// Готові кольори шапки — відтінки веселкою; свій — смугою відтінку
export const GEAR_HUES = [0, 15, 28, 40, 55, 75, 95, 120, 150, 175, 195, 210, 230, 260, 285, 320];
