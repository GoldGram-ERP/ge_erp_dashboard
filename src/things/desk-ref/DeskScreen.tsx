"use client";
import "./desk-ref.css";

/**
 * The sales desk screen, pixel-for-pixel the reference calculator (docs/specs/sales-desk-reference.md section 5).
 * Purely presentational: every value comes in as a prop and every change goes out through a callback; no data, no API.
 * The reference's markup and ids are kept on purpose (documented exception to the app's library-only rule, for this one screen),
 * so the page holds one desk at a time. Texts are the reference's Arabic. Workmanship and cashback are a read-only line (feesText), no editor panel.
 */
export type DeskOption = { value: string; label?: string; disabled?: boolean };
export type DeskLine = { product: number; qty: number; wrapping?: "wrapped" | "unwrapped" };
type Kind = "" | "ok" | "bad";
export type DeskField = "customer" | "nationalId" | "phone" | "splitAmount" | "manualSell" | "manualBuy";

export type DeskValues = {
  theme: "light" | "dark";
  operation: "sell" | "buy";
  metal: "gold" | "silver";
  wrapping: "wrapped" | "unwrapped" | "";
  branch: string; branches: string[];
  seller: string; sellers: string[]; sellerPlaceholder: string;
  customer: string; nationalId: string; phone: string;
  nationalHint: string; phoneHint: string; customerHint: string;
  payment: string; paymentOptions: DeskOption[];
  payment2: string; payment2Options: DeskOption[];
  splitAmount: string; splitHint: string; remainingMethod: string; remainingAmount: string;
  products: string[]; lines: DeskLine[]; draftState: string;
  feesLabel: string; feesText: string; feesWeights: string; feesAfterDiscount: string;
  weightTotal: string; unitsTotal: string;
  discountEnabled: boolean; discountPercent: string; discountOptions: string[];
  total: string; beforeDiscount: string; mobileTotal: string;
  pricesTitle: string; clock: string; priceStatus: string; priceStatusKind: Kind;
  sellLabel: string; buyLabel: string; sellPrice: string; buyPrice: string;
  manualSell: string; manualBuy: string;
  sellMode: string; buyMode: string; sellModeKind: "" | "manual-active" | "manual-error"; buyModeKind: "" | "manual-active" | "manual-error";
  lastUpdate: string;
  preview: string; copyState: string; retryVisible: boolean; copying: boolean; toast: string;
};

export type DeskActions = {
  onOperation: (v: "sell" | "buy") => void;
  onMetal: (v: "gold" | "silver") => void;
  onWrapping: (v: "wrapped" | "unwrapped") => void;
  onBranch: (v: string) => void;
  onSeller: (v: string) => void;
  onField: (field: DeskField, value: string) => void;
  onPayment: (v: string) => void;
  onPayment2: (v: string) => void;
  onLineProduct: (index: number, product: number) => void;
  onLineQty: (index: number, qty: number) => void;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
  onClear: () => void;
  onDiscountEnabled: (v: boolean) => void;
  onDiscountPercent: (v: string) => void;
  onRefresh: () => void;
  onCopy: () => void;
  onRetryCopy: () => void;
};

export const DEFAULT_DESK_VALUES: DeskValues = {
  theme: "light", operation: "sell", metal: "gold", wrapping: "wrapped",
  branch: "", branches: [], seller: "", sellers: [], sellerPlaceholder: "اختار الفرع أولًا",
  customer: "", nationalId: "", phone: "", nationalHint: "", phoneHint: "", customerHint: "",
  payment: "كاش", paymentOptions: [{ value: "كاش" }], payment2: "", payment2Options: [{ value: "", label: "بدون" }],
  splitAmount: "", splitHint: "", remainingMethod: "", remainingAmount: "—",
  products: [], lines: [{ product: 0, qty: 1 }], draftState: "",
  feesLabel: "المصنعية للجرام + الإجمالي — للحاسبة فقط", feesText: "—", feesWeights: "", feesAfterDiscount: "",
  weightTotal: "0", unitsTotal: "0",
  discountEnabled: false, discountPercent: "5", discountOptions: ["5", "10"],
  total: "—", beforeDiscount: "", mobileTotal: "—",
  pricesTitle: "أسعار الذهب اللحظية", clock: "كل 15 ثانية", priceStatus: "جاري قراءة السعر من الشيت...", priceStatusKind: "",
  sellLabel: "بيع · عيار 21", buyLabel: "شراء · عيار 21", sellPrice: "—", buyPrice: "—",
  manualSell: "", manualBuy: "", sellMode: "السعر اللحظي", buyMode: "السعر اللحظي", sellModeKind: "", buyModeKind: "",
  lastUpdate: "لا توجد قراءة مؤكدة",
  preview: "", copyState: "", retryVisible: false, copying: false, toast: "",
};

const noop = () => {};

export function DeskScreen({ values, actions }: { values?: Partial<DeskValues>; actions?: Partial<DeskActions> }) {
  const v = { ...DEFAULT_DESK_VALUES, ...values };
  const a = { onOperation: noop, onMetal: noop, onWrapping: noop, onBranch: noop, onSeller: noop, onField: noop, onPayment: noop, onPayment2: noop, onLineProduct: noop, onLineQty: noop, onAddLine: noop, onRemoveLine: noop, onClear: noop, onDiscountEnabled: noop, onDiscountPercent: noop, onRefresh: noop, onCopy: noop, onRetryCopy: noop, ...actions };
  const silver = v.metal === "silver";
  const text = (field: DeskField) => (e: { target: { value: string } }) => a.onField(field, e.target.value);
  const bad = (hint: string, value: string) => !!hint && !!value.trim();
  const field = (id: DeskField, label: string, placeholder: string, hint: string, extra?: { inputMode: "numeric" | "decimal" }) => (
    <div className="dr-field">
      <label>{label}</label>
      <input id={id} placeholder={placeholder} autoComplete="off" {...extra} value={v[id]} onChange={text(id)} className={bad(hint, v[id]) ? "field-invalid" : undefined} />
      <div className={"field-hint" + (bad(hint, v[id]) ? " is-error" : "")} id={id + "Hint"}>{hint}</div>
    </div>
  );
  return (
    <div className="desk-ref" dir="rtl" lang="ar" data-theme={v.theme}>
      <div className="layout" data-desk-layout>
        <section>
          <div className="panel">
            <h2>بيانات العملية والعميل</h2>
            <div className="operation-switches">
              <div className="dr-field">
                <label>نوع العملية</label>
                <div className="toggle" id="types">
                  <button type="button" className={v.operation === "sell" ? "dr-active" : undefined} aria-pressed={v.operation === "sell"} onClick={() => a.onOperation("sell")}>بيع</button>
                  <button type="button" className={v.operation === "buy" ? "dr-active" : undefined} aria-pressed={v.operation === "buy"} onClick={() => a.onOperation("buy")}>شراء</button>
                </div>
              </div>
              <div className="dr-field metal-field">
                <label>المعدن</label>
                <div className="toggle" id="metals">
                  <button type="button" className={v.metal === "gold" ? "dr-active" : undefined} aria-pressed={v.metal === "gold"} onClick={() => a.onMetal("gold")}>ذهب</button>
                  <button type="button" className={silver ? "dr-active" : undefined} aria-pressed={silver} onClick={() => a.onMetal("silver")}>فضة</button>
                </div>
              </div>
            </div>
            <div className="sales-identity">
              <div className="dr-field">
                <label htmlFor="branch">الفرع</label>
                <select id="branch" value={v.branch} onChange={(e) => a.onBranch(e.target.value)}>
                  <option value="">اختار الفرع</option>
                  {v.branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="dr-field">
                <label htmlFor="seller">اسم السيلز</label>
                <select id="seller" disabled={!v.branch} value={v.seller} onChange={(e) => a.onSeller(e.target.value)}>
                  <option value="">{v.branch ? "اختار اسم البائع" : v.sellerPlaceholder}</option>
                  {v.sellers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            {field("customer", "اسم العميل", "اسم العميل", v.customerHint)}
            {field("nationalId", "الرقم القومي", "14 رقم", v.nationalHint, { inputMode: "numeric" })}
            {field("phone", "رقم العميل / الموبايل", "01xxxxxxxxx", v.phoneHint, { inputMode: "numeric" })}
            <div className="dr-field">
              <label>طريقة الدفع</label>
              <select id="payment" value={v.payment} onChange={(e) => a.onPayment(e.target.value)}>
                {v.paymentOptions.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label ?? o.value}</option>)}
              </select>
            </div>
            <div className="dr-field">
              <label>طريقة دفع ثانية (اختياري، بدون فيزا)</label>
              <select id="payment2" value={v.payment2} disabled={v.payment === "فيزا"} onChange={(e) => a.onPayment2(e.target.value)}>
                {v.payment2Options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label ?? o.value}</option>)}
              </select>
            </div>
            <div className="dr-field" id="splitWrap" hidden={!v.payment2}>
              <label>مبلغ الدفع بالطريقة الأولى (جنيه)</label>
              <input id="splitAmount" inputMode="decimal" placeholder="0.00" value={v.splitAmount} onChange={text("splitAmount")} />
              <div className="field-hint" id="splitHint">{v.splitHint}</div>
              <div className="payment-remaining"><span id="remainingMethod">{v.remainingMethod}</span><strong id="remainingAmount">{v.remainingAmount}</strong></div>
            </div>
          </div>
        </section>
        <section>
          <div className="panel">
            <div className="topline"><h2>القطع والأوزان</h2><span className="dr-pill">المصنعية والكاش باك تلقائي</span></div>
            <div id="wrappingControls" className="wrapping-controls" hidden={!silver}>
              <span>غلاف الفضة</span>
              <div className="toggle compact">
                <button type="button" className={v.wrapping === "wrapped" ? "dr-active" : undefined} aria-pressed={v.wrapping === "wrapped"} onClick={() => a.onWrapping("wrapped")}>مغلف</button>
                <button type="button" className={v.wrapping === "unwrapped" ? "dr-active" : undefined} aria-pressed={v.wrapping === "unwrapped"} onClick={() => a.onWrapping("unwrapped")}>غير مغلف</button>
              </div>
            </div>
            <div id="items">
              {v.lines.map((l, i) => (
                <div className={"dr-row" + (silver ? " silver-row" : "")} key={i}>
                  <select aria-label={`القطعة ${i + 1}`} value={l.product} onChange={(e) => a.onLineProduct(i, Number(e.target.value))}>
                    {l.product < 0 && <option value="-1">اختر وزنًا متاحًا</option>}
                    {v.products.map((p, j) => <option key={j} value={j}>{p}</option>)}
                  </select>
                  <input type="number" min={1} max={999} aria-label="العدد" value={l.qty} onChange={(e) => a.onLineQty(i, Number(e.target.value))} />
                  {silver && <span className="line-wrap" aria-label={"الغلاف: " + (l.wrapping === "unwrapped" ? "غير مغلف" : "مغلف")} title="نوع الغلاف — يتغير من الاختيار أعلى الأوزان">{l.wrapping === "unwrapped" ? "بدون" : "مغلف"}</span>}
                  <button className="remove" type="button" aria-label="حذف القطعة" disabled={v.lines.length === 1} onClick={() => a.onRemoveLine(i)}>×</button>
                </div>
              ))}
            </div>
            <button className="button secondary" id="add" type="button" onClick={a.onAddLine}>+ إضافة قطعة</button>
            <button className="button clear-all" id="clearAll" type="button" onClick={a.onClear}>مسح العملية بالكامل</button>
            <p className="muted" id="draftState">{v.draftState}</p>
            <h3>تفاصيل الحساب</h3>
            <div className="dr-field">
              <label id="feesLabel">{v.feesLabel}</label>
              <input id="feesDisplay" readOnly dir="rtl" value={v.feesText} />
              <div className="fee-small">
                <span id="feesWeights" title={v.feesWeights}>{v.feesWeights}</span>
                <span id="feesAfterDiscount" hidden={!v.feesAfterDiscount}>{v.feesAfterDiscount}</span>
              </div>
            </div>
            <div className="two">
              <div className="dr-price"><small>إجمالي الوزن</small><b id="weightTotal">{v.weightTotal}</b><small>جرام</small></div>
              <div className="dr-price"><small>إجمالي القطع</small><b id="unitsTotal">{v.unitsTotal}</b><small>قطعة</small></div>
            </div>
            <div className="discount" hidden={v.operation === "buy"}>
              <label className="discount-toggle"><input type="checkbox" id="discountEnabled" checked={v.discountEnabled} onChange={(e) => a.onDiscountEnabled(e.target.checked)} /> تفعيل الخصم على إجمالي المصنعية فقط</label>
              <div id="discountOptions" hidden={!v.discountEnabled}>
                <select id="discountPercent" value={v.discountPercent} onChange={(e) => a.onDiscountPercent(e.target.value)}>
                  {v.discountOptions.map((n) => <option key={n} value={n}>{`خصم ${n}%`}</option>)}
                </select>
              </div>
            </div>
            <div className="summary">
              <span>إجمالي العملية</span>
              <div id="beforeDiscount" className="muted" hidden={!v.beforeDiscount}>{v.beforeDiscount}</div>
              <strong id="total">{v.total}</strong>
              <small>جنيه مصري • التقريب النهائي فقط</small>
            </div>
          </div>
        </section>
        <section className="preview-col">
          <div className="panel">
            <div className="topline"><h2 id="pricesTitle">{v.pricesTitle}</h2><span id="clock" className="dr-pill">{v.clock}</span></div>
            <div id="priceStatus" className={"dr-status" + (v.priceStatusKind ? " " + v.priceStatusKind : "")}>{v.priceStatus}</div>
            <div className="price-grid">
              <div className="dr-price">
                <small id="sellPriceLabel">{v.sellLabel}</small>
                <b id="sellPrice">{v.sellPrice}</b>
                <label className="override-label" htmlFor="manualSell">سعر بيع يدوي (اختياري)</label>
                <input id="manualSell" className="manual-price" type="text" inputMode="decimal" placeholder="اكتب السعر" autoComplete="off" value={v.manualSell} onChange={text("manualSell")} />
                <small id="sellMode" className={v.sellModeKind || undefined}>{v.sellMode}</small>
              </div>
              <div className="dr-price">
                <small id="buyPriceLabel">{v.buyLabel}</small>
                <b id="buyPrice">{v.buyPrice}</b>
                <label className="override-label" htmlFor="manualBuy">سعر شراء يدوي (اختياري)</label>
                <input id="manualBuy" className="manual-price" type="text" inputMode="decimal" placeholder="اكتب السعر" autoComplete="off" value={v.manualBuy} onChange={text("manualBuy")} />
                <small id="buyMode" className={v.buyModeKind || undefined}>{v.buyMode}</small>
              </div>
            </div>
            <p className="muted" id="lastUpdate">{v.lastUpdate}</p>
            <button id="refresh" className="button secondary" type="button" onClick={a.onRefresh}>↻ قراءة سعر جديد الآن</button>
          </div>
          <div className="panel">
            <div className="topline"><h2>رسالة الواتساب</h2><span className="dr-pill">معاينة مباشرة</span></div>
            <div className="preview" id="preview">{v.preview}</div>
            <p className="muted">النسخ متاح حتى لو بيانات العميل ناقصة. النسخ على جهازك فقط، بدون إرسال أو حفظ عمليات على الخادم.</p>
            <p className="notice copy-state" id="copyState" role="status" hidden={!v.copyState}>{v.copyState}</p>
            <button id="copy" className="button dark" type="button" disabled={v.copying} onClick={a.onCopy}>نسخ</button>
            <button id="retryClipboard" className="button secondary" type="button" hidden={!v.retryVisible} onClick={a.onRetryCopy}>إعادة نسخ الرسالة</button>
          </div>
        </section>
      </div>
      <div id="mobileBar" className="mobile-bar">
        <div className="mobile-total"><span>الإجمالي</span><strong id="mobileTotal">{v.mobileTotal}</strong></div>
        <button id="mobileCopy" className="mobile-copy" type="button" disabled={v.copying} onClick={a.onCopy}>نسخ</button>
      </div>
      <div id="toast" style={v.toast ? { display: "block" } : undefined}>{v.toast}</div>
    </div>
  );
}
