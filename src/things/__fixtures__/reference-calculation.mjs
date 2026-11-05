import {branchByName} from './branches.js';
import {goldSpecs} from './catalog.js';
export const specs=goldSpecs;

export const methods=['كاش','انستا باي','تحويل بنكي','فيزا'];
export function allowedPayments(type,config){return config?(type==='buy'?config.purchasePayments:config.payments):(type==='buy'?['كاش','تحويل بنكي']:methods);}
export const fields={branch:'الفرع',seller:'اسم السيلز',customer:'اسم العميل',nationalId:'الرقم القومي',phone:'رقم العميل',type:'نوع العملية',basePrice21:'السعر الأساسي عيار 21',finalPrice21:'السعر النهائي المعتمد عيار 21',finalPrice24:'السعر النهائي المعتمد عيار 24',manualPayment:'طريقة الدفع عند اعتماد السعر الخاص',discount:'خصم المصنعية %',payment:'طريقة الدفع',payment2:'طريقة الدفع الثانية',splitAmount:'المبلغ الأول',lines:'القطع والأوزان والمصنعيات'};
export function cents(s){const str=String(s??'').replace(/,/g,'').trim();if(!/^\d{1,10}(\.\d{1,2})?$/.test(str))return null;const [i,f='']=str.split('.');return BigInt(i)*100n+BigInt((f+'00').slice(0,2));}
// Retain the original calculator's pound rounding, including its exact-half-pound exception.
export function round(n,d){const pound=d*100n,whole=n/pound,rest=n%pound;return rest===d*50n?whole*100n+50n:(rest>d*50n?whole+1n:whole)*100n;}
function roundVisaTotal(n,d){const pound=d*100n,whole=n/pound,rest=n%pound;return (rest*2n>=pound?whole+1n:whole)*100n;}
export function money(v){return new Intl.NumberFormat('en-EG',{maximumFractionDigits:2}).format(Number(v));}
export function formatCents(c){return money(Number(c)/100);}
export function workday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function validatePayment(d){if(!(d.paymentRules?.payments||methods).includes(d.payment)||d.payment2&&!(d.paymentRules?.payments||methods).includes(d.payment2))throw new Error('طريقة الدفع غير صالحة');if(d.type==='buy'&&(!allowedPayments(d.type).includes(d.payment)||d.payment2&&!allowedPayments(d.type).includes(d.payment2)))throw new Error('في عمليات الشراء، طرق الدفع المتاحة هي الكاش والتحويل البنكي فقط');if(d.payment2&&(d.payment==='فيزا'||d.payment2==='فيزا'))throw new Error('الفيزا يجب أن تكون طريقة الدفع الوحيدة');if(d.payment2===d.payment)throw new Error('اختر طريقتين مختلفتين للدفع');}
// Legacy final overrides retain their original payment basis when payment changes.
export function changePayment(d,payment){
 if((d.finalPrice21!=null||d.finalPrice24!=null)&&!d.manualPayment)d.manualPayment=d.payment==='فيزا'?'visa':'cash';
 d.payment=payment;
}
export function calculate(d){
 if(d.metal==='silver')return calculateSilver(d);const catalog=d.catalog||specs;const visaFactor=100n+BigInt(d.visaPercent??2);
 validatePayment(d);const base=cents(d.basePrice21);if(base===null||base<=0n)throw new Error('اكتب سعر الذهب الأساسي الصحيح');
 const manual21=d.finalPrice21!==null&&d.finalPrice21!==undefined&&d.finalPrice21!==''?cents(d.finalPrice21):null;
 const manual24=d.finalPrice24!==null&&d.finalPrice24!==undefined&&d.finalPrice24!==''?cents(d.finalPrice24):null;
 for(const key of ['finalPrice21','finalPrice24'])if(d[key]!==null&&d[key]!==undefined&&d[key]!==''&&(cents(d[key])===null||cents(d[key])<=0n))throw new Error('السعر النهائي غير صالح');
 const factor=d.payment==='فيزا'?visaFactor:100n;
 const scale=d.manualPayment?visaFactor:1n, origin=d.manualPayment==='visa'?visaFactor:100n;
 const manualFactor=d.manualPayment?factor:100n;
 const price21Numerator=manual21!==null?manual21*100n*manualFactor*scale/origin:base*factor*scale;
 let total=0n,feeTotal=0n,weight100=0,units=0;
 if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>60)throw new Error('أضف قطعة واحدة على الأقل (بحد أقصى 60)');
 for(const l of d.lines){const s=catalog[l.product];if(!s||!Number.isInteger(l.qty)||l.qty<1||l.qty>999)throw new Error('راجع القطع والكميات');const fee=cents(l.fee??s[d.type==='buy'?5:4]);if(fee===null)throw new Error('المصنعية غير صالحة');
 const w=l.weight100??s[1],karat=l.karat??s[3];if(!Number.isInteger(w)||w<=0||w>10000000||![21,24].includes(karat))throw new Error('راجع الوزن والعيار');
 const rate=karat===24&&manual24!==null?manual24*2100n*manualFactor*scale/origin:price21Numerator*BigInt(karat);
 const weight=BigInt(w),qty=BigInt(l.qty);
 const feeN=fee*2100n*scale*(weight<=50n?100n:weight)*qty;
 total+=rate*weight*qty+feeN;feeTotal+=feeN;weight100+=w*l.qty;units+=l.qty;
 }
 const discount=d.type==='buy'?0:Number(d.discount||0);if(!Number.isFinite(discount)||discount<0||discount>100||Math.abs(discount*100-Math.round(discount*100))>0.000001)throw new Error('الخصم يجب أن يكون من 0 إلى 100');
 const discountBasisPoints=BigInt(Math.round(discount*100));
 let beforeCents,totalCents;
 if(d.payment==='فيزا'){
  // Gold already uses the Visa-adjusted gram price above. Apply the remaining
  // Visa uplift to the manufacturing portion too, preserving the discount order.
  const goldNumerator=(total-feeTotal)*10000n;
  const visaDenominator=210000000000n*scale;
  beforeCents=roundVisaTotal(goldNumerator*100n+feeTotal*10000n*visaFactor,visaDenominator);
  totalCents=roundVisaTotal(goldNumerator*100n+feeTotal*(10000n-discountBasisPoints)*visaFactor,visaDenominator);
 }else{
  beforeCents=round(total,210000n*scale);
  totalCents=round(total*10000n-feeTotal*discountBasisPoints,2100000000n*scale);
 }

 return {totalCents,beforeCents,discount,units,weight100,feeTotalCents:(feeTotal+105000n*scale)/(210000n*scale),basePrice21:String(d.basePrice21),visaPrice21:Number(base*factor)/10000,finalPrice21:Number(price21Numerator)/10000/Number(scale),finalPrice24:manual24!==null?Number(manual24)*Number(manualFactor)/Number(origin)/100:Number(price21Numerator)*24/21/10000/Number(scale)};
}
export function cleanTransaction(d){
 if(!d||typeof d!=='object')throw new Error('بيانات القطعة غير صالحة');const out={};
 for(const k of ['seller','customer','nationalId','phone'])out[k]=String(d[k]??'').trim().slice(0,k==='customer'?120:80);
 if(!out.seller)throw new Error('اختار اسم السيلز قبل الإرسال');
 if(d.branch!==undefined){if(!branchByName(d.branch))throw new Error('اختار الفرع الصحيح');out.branch=d.branch;}
 out.type=d.type==='buy'?'buy':'sell';out.basePrice21=String(d.basePrice21??'');out.finalPrice21=d.finalPrice21===''?null:d.finalPrice21??null;out.finalPrice24=d.finalPrice24===''?null:d.finalPrice24??null;
 if(d.manualPayment==='visa'||d.manualPayment==='cash')out.manualPayment=d.manualPayment;
 out.payment=String(d.payment??'كاش');out.payment2=String(d.payment2??'');out.splitAmount=String(d.splitAmount??'');out.discount=Number(d.discount||0);
 out.lines=Array.isArray(d.lines)?d.lines.slice(0,61).map(l=>({product:Number(l.product),qty:Number(l.qty),fee:String(l.fee??specs[l.product]?.[out.type==='buy'?5:4]),...(l.weight100!=null?{weight100:Number(l.weight100)}:{}),...(l.karat!=null?{karat:Number(l.karat)}:{})})):[];
 const result=calculate(out);const split=cents(out.splitAmount||'0');if(out.payment2&&(split===null||split>result.totalCents))throw new Error('راجع مبلغ طريقة الدفع الأولى');return out;
}
export function message(d,day=workday()){
 if(d.branch!==undefined&&!(d.branchNames||[]).includes(d.branch)&&!branchByName(d.branch))throw new Error('اختار الفرع قبل النسخ');
 const c=calculate(d),catalog=d.catalog||specs,visaPercent=d.visaPercent??2;const group=new Map();for(const l of d.lines){const key=l.product+':'+l.fee+':'+l.weight100+':'+l.karat+':'+l.wrapping;const old=group.get(key);if(old)old.qty+=l.qty;else group.set(key,{...l});}const combined=[...group.values()];
 let visaOriginal=null;
 if(d.type==='sell'&&d.payment==='فيزا'){
  const original={...d,payment2:''};
  changePayment(original,'كاش');
  visaOriginal=calculate(original);
 }
 let payment=d.payment;if(d.payment2){const sc=cents(d.splitAmount||0);payment=d.payment+': '+formatCents(sc)+' جنيه\n'+d.payment2+': '+formatCents(c.totalCents-sc)+' جنيه';}
 const manual=d.finalPrice21!==null&&d.finalPrice21!==undefined||d.finalPrice24!==null&&d.finalPrice24!==undefined;
 const totals=visaOriginal
  ?`إجمالي السعر قبل ${visaPercent}%: ${formatCents(visaOriginal.totalCents)}\nإجمالي السعر بعد ${visaPercent}%: ${formatCents(c.totalCents)}${c.discount?'\nإجمالى سعر قبل خصم (بعد '+visaPercent+'%): '+formatCents(c.beforeCents):''}`
  :c.discount?'إجمالى سعر قبل خصم: '+formatCents(c.beforeCents)+'\nإجمالى سعر بعد خصم: '+formatCents(c.totalCents):'إجمالي السعر: '+formatCents(c.totalCents);
 return `التاريخ: ${day}\nالفرع: ${d.branch||'جليم'}\nقناة البيع: ${d.channel||'قطاعي'}${d.metal==='silver'?' قطعة فضه':''}\nاسم البائع: ${d.seller}\nاسم العميل: ${d.customer}\nرقم البطاقة: ${d.nationalId}\nرقم العميل: ${d.phone}\nتفاصيل القطع: ${d.type==='sell'?'بيع':'شراء'}\n${d.payment==='فيزا'?(d.metal==='silver'?'سعر الجرام: ':'سعر جرام 21: ')+money(d.basePrice21)+'\nسعر الجرام بعد '+visaPercent+'%: '+money(c.visaPrice21):'سعر الجرام: '+money(c.finalPrice21)}${manual?'\nسعر جرام 21 المعتمد: '+money(c.finalPrice21):''}\n${d.finalPrice24!=null?'سعر عيار 24 المعتمد: '+money(c.finalPrice24)+'\n':''}${d.type==='sell'?'مصنعية':'كاش باك'}: ${combined.map(l=>l.fee).join(' + ')}\n${c.discount?'خصم '+c.discount+'% على المصنعية\n':''}الأوزان:\n${combined.map(l=>`${l.qty} ${catalog[l.product][0]}${d.metal==='silver'?' '+(l.wrapping==='unwrapped'?'غير مغلف':'مغلف'):''}${l.weight100!=null||l.karat!=null?' (الوزن: '+money((l.weight100??catalog[l.product][1])/100)+' ج • عيار '+(l.karat??catalog[l.product][3])+')':''}`).join('\n')}\n${totals}\n${d.payment2?payment:'طريقة الدفع: '+payment}`;
}
export function differences(a,b){return Object.keys(fields).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k]));}

export function calculateSilver(d){
 validatePayment(d);const catalog=d.catalog;if(!Array.isArray(catalog))throw new Error('قائمة الفضة غير صالحة');
 const base=cents(d.basePrice21);if(base===null||base<=0n)throw new Error('اكتب سعر جرام الفضة الصحيح');
 if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>60)throw new Error('راجع القطع والكميات');
 let goldN=0n,feeN=0n,weight100=0,units=0;
 for(const l of d.lines){const s=catalog[l.product];if(!s||!Number.isInteger(l.qty)||l.qty<1||l.qty>999||!['wrapped','unwrapped'].includes(l.wrapping))throw new Error('راجع وزن الفضة والغلاف');const weight=BigInt(s[1]),fee=cents(l.fee??s[(l.wrapping==='unwrapped'?6:4)+(d.type==='buy'?1:0)]);if(fee===null)throw new Error('راجع مصنعية الفضة');goldN+=base*weight*BigInt(l.qty);feeN+=fee*weight*BigInt(l.qty);weight100+=s[1]*l.qty;units+=l.qty;}
 const discount=d.type==='buy'?0:Number(d.discount||0);if(!Number.isFinite(discount)||discount<0||discount>100||Math.abs(discount*100-Math.round(discount*100))>1e-7)throw new Error('راجع الخصم');
 const factor=d.payment==='فيزا'?100n+BigInt(d.visaPercent??2):100n,rounding=d.payment==='فيزا'?roundVisaTotal:round;
 const beforeCents=rounding((goldN+feeN)*factor,10000n),totalCents=rounding((goldN*10000n+feeN*(10000n-BigInt(Math.round(discount*100))))*factor,100000000n);
 return {totalCents,beforeCents,discount,units,weight100,feeTotalCents:(feeN+50n)/100n,basePrice21:String(d.basePrice21),visaPrice21:Number(base*factor)/10000,finalPrice21:Number(base*factor)/10000,finalPrice24:Number(base*factor)/10000};
}
