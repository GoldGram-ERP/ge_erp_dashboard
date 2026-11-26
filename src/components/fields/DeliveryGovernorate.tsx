"use client";
// The governorate of a توصيل (shipping) sale (owner, 2026-11-26), on the new sales invoice and on the Sales desk: only the governorates priced on
// Delivery charges, each with its price. The price is the list's, never typed; the backend reads it again at the save.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Row } from "@/lib/engine-types";
import { piastresText } from "@/lib/format";
import { governorateName } from "@/lib/governorates";
import type { Tr } from "@/lib/t";
import { Choice, ErrBox } from "@/things/sales-form-parts";

export type DeliveryPrice = { governorate: string; pricePiastres: number };

/** The priced governorates, read while a shipping sale is on screen and refreshed so a changed price shows. `failed`: the read did not answer. */
export function useDeliveryPrices(wanted: boolean) {
  const answer = useQuery({ queryKey: ["delivery-prices"], enabled: wanted, staleTime: 15_000, refetchInterval: 30_000, queryFn: () => api<{ items: Row[] }>("/delivery-charges") });
  return { prices: (answer.data?.items ?? []) as unknown as DeliveryPrice[], loaded: Boolean(answer.data), failed: answer.isError, refresh: () => { void answer.refetch(); } };
}

type Props = {
  tr: Tr; value: string; onChange: (governorate: string) => void;
  read: ReturnType<typeof useDeliveryPrices>;
  /** A saved document's own governorate and price: offered even when the list no longer prices it, or prices it differently. */
  saved?: DeliveryPrice;
  error?: string; disabled?: boolean;
};

export function DeliveryGovernorateField({ tr, value, onChange, read, saved, error, disabled }: Props) {
  const { L, isAr } = tr;
  const rows = saved ? [saved, ...read.prices.filter((p) => p.governorate !== saved.governorate)] : read.prices;
  return (
    <div className="field" data-k="deliveryGovernorate" data-err={error ? "" : undefined}>
      <label htmlFor="deliveryGovernorate">{L("المحافظة", "Governorate")} *</label>
      <Choice tr={tr} id="deliveryGovernorate" value={value} onChange={onChange} disabled={disabled} invalid={Boolean(error)}
        options={rows.map((p) => [p.governorate, `${governorateName(p.governorate, isAr)} · ${piastresText(p.pricePiastres)}`])} />
      {read.failed ? <ErrBox>{L("تعذر قراءة أسعار التوصيل.", "Could not read the delivery prices.")}</ErrBox>
        : read.loaded && rows.length === 0 ? <ErrBox>{L("لا توجد محافظة لها سعر. أضفها من صفحة أسعار التوصيل.", "No governorate has a price yet. Add it on the Delivery charges page.")}</ErrBox>
        : <div className="help">{L("سعر التوصيل يُضاف إلى الإجمالي.", "The delivery price is added to the total.")}</div>}
      {error && <ErrBox>{error}</ErrBox>}
    </div>
  );
}
