import type { DeskValues } from "./DeskScreen";

/** The sample the reference shows: one 10 g bar, manual sell price 6255, workmanship 75, total 72,236. Fixed on purpose, for the pixel proof only. */
export const DESK_SAMPLE: Partial<DeskValues> = {
  branches: ["الأسكندرية", "مصر الجديده", "الفيوم", "الشيخ زايد", "طنطا", "المنصورة", "التجمع الخامس"],
  paymentOptions: ["كاش", "انستا باي", "تحويل بنكي", "فيزا"].map((value) => ({ value })),
  payment2Options: [{ value: "", label: "بدون" }, { value: "كاش", disabled: true }, { value: "انستا باي" }, { value: "تحويل بنكي" }],
  products: ["سبيكة ربع جرام", "سبيكة نص جرام", "سبيكة جرام", "سبيكة 2.5 جرام", "سبيكة 5 جرام", "سبيكة 10 جرام", "سبيكة 15.55 جرام", "سبيكة 20 جرام", "سبيكة 25 جرام", "سبيكة 31.10 جرام", "سبيكة 50 جرام", "سبيكة 100 جرام", "سبيكة ربع كيلو", "سبيكة نص كيلو", "سبيكة كيلو", "ربع جنيه دهب", "نص جنيه دهب", "جنيه دهب"],
  lines: [{ product: 5, qty: 1 }],
  draftState: "المسودة مؤقتة على علامة التبويب الحالية حتى نهاية اليوم أو مسحها.",
  feesText: "75 = 750 ج", feesWeights: "10 جرام × 1", weightTotal: "10", unitsTotal: "1",
  total: "72,236", mobileTotal: "72,236 ج",
  priceStatus: "تم تحديث سعر ذهب من الشيت", priceStatusKind: "ok",
  sellPrice: "6,255", buyPrice: "6,100", manualSell: "6255",
  sellMode: "السعر اليدوي معتمد في الحساب", sellModeKind: "manual-active", buyMode: "السعر من الشيت",
  lastUpdate: "آخر قراءة: ١٢:٠٠:٠٠ م",
  preview: "اختار الفرع وراجع السعر والقطع لعرض الرسالة.",
};
