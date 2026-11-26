// Egypt's 27 governorates: the backend's codes (gold-sales/delivery-charges/domain/delivery-charge.ts) with their names.
export const GOVERNORATES: readonly (readonly [code: string, ar: string, en: string])[] = [
  ["cairo", "القاهرة", "Cairo"],
  ["giza", "الجيزة", "Giza"],
  ["alexandria", "الإسكندرية", "Alexandria"],
  ["qalyubia", "القليوبية", "Qalyubia"],
  ["dakahlia", "الدقهلية", "Dakahlia"],
  ["sharqia", "الشرقية", "Sharqia"],
  ["gharbia", "الغربية", "Gharbia"],
  ["monufia", "المنوفية", "Monufia"],
  ["beheira", "البحيرة", "Beheira"],
  ["kafr_el_sheikh", "كفر الشيخ", "Kafr El Sheikh"],
  ["damietta", "دمياط", "Damietta"],
  ["port_said", "بورسعيد", "Port Said"],
  ["ismailia", "الإسماعيلية", "Ismailia"],
  ["suez", "السويس", "Suez"],
  ["faiyum", "الفيوم", "Faiyum"],
  ["beni_suef", "بني سويف", "Beni Suef"],
  ["minya", "المنيا", "Minya"],
  ["asyut", "أسيوط", "Asyut"],
  ["sohag", "سوهاج", "Sohag"],
  ["qena", "قنا", "Qena"],
  ["luxor", "الأقصر", "Luxor"],
  ["aswan", "أسوان", "Aswan"],
  ["red_sea", "البحر الأحمر", "Red Sea"],
  ["new_valley", "الوادي الجديد", "New Valley"],
  ["matrouh", "مطروح", "Matrouh"],
  ["north_sinai", "شمال سيناء", "North Sinai"],
  ["south_sinai", "جنوب سيناء", "South Sinai"],
];

/** The name in the page's language; an unknown code shows as it is. */
export const governorateName = (code: string, isAr: boolean): string => {
  const found = GOVERNORATES.find(([c]) => c === code);
  return found ? found[isAr ? 1 : 2] : code;
};
