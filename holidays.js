// Calendar dates only; does not infer transferred business days.
// https://egov.kz/cms/ru/articles/holidays-calend
// Kurban Ait 2026: https://www.muftiyat.kz/ru/news/qmdb/2026-05-18/48344-27-maya---pervyij-den-prazdnika-kurban-ajt/
const FIXED = {
  '01-01': 'New Year', '01-02': 'New Year', '01-07': 'Orthodox Christmas',
  '03-08': 'March 8', '03-21': 'Nauryz', '03-22': 'Nauryz', '03-23': 'Nauryz',
  '05-01': 'Unity Day', '05-07': 'Defender of the Fatherland Day', '05-09': 'Victory Day',
  '07-06': 'Capital City Day', '08-30': 'Constitution Day', '10-25': 'Republic Day',
  '12-16': 'Independence Day'
};
const MOVABLE = { '2026-05-27': 'Kurban Ait' };
const BOOSTED = new Set(['New Year', 'Nauryz', 'Kurban Ait', 'March 8']);
export function holiday(date) {
  const name = MOVABLE[date] || FIXED[date.slice(5)] || null;
  return { name, boost: BOOSTED.has(name), lunarCalendarKnown: date.startsWith('2026-') };
}
export const isPayday = date => [5, 20].includes(Number(date.slice(8, 10)));
