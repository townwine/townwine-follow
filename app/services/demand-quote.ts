/** Business quote rules transcribed from the supplied TownWine workbook on 2026-10-31 (all six countries).
 * Not a customs rules engine. Standard 750ml bottle: workbook weight = 2kg.
 * Persist the returned breakdown/rates with each request; never silently reprice it.
 */
export type QuoteCountry = 'HK' | 'US' | 'FR' | 'DE' | 'GB' | 'JP';
export type QuoteInput = {
  country: QuoteCountry; bottlePrice: number; bottles: number; localShipping: number;
  origin: 'EU' | 'US' | 'OTHER'; ftaConfirmed: boolean;
  germanyVatRefund: boolean; ukLocalTax: number; hkViaUk?: boolean;
};
export type QuoteRates = { date: string; KRW: number; USD: number; HKD: number; EUR: number; GBP: number; JPY: number };
export const quoteCurrency = { HK:'HKD', US:'USD', FR:'EUR', DE:'EUR', GB:'GBP', JP:'JPY' } as const;
export function calculateDemandQuote(i: QuoteInput, rates: QuoteRates) {
  if (!(Object.hasOwn(quoteCurrency,i.country))) throw new Error('지원하지 않는 견적 국가입니다.');
  if (!Number.isFinite(i.bottlePrice) || i.bottlePrice <= 0 || i.bottlePrice > 1e8 || !Number.isInteger(i.bottles) || i.bottles < 1 || i.bottles > 10000 || !Number.isFinite(i.localShipping) || i.localShipping < 0 || i.localShipping > 1e8) throw new Error('상품가·병 수·현지 배송비를 확인해 주세요.');
  if (!Number.isFinite(i.ukLocalTax) || i.ukLocalTax < 0) throw new Error('현지 세금을 확인해 주세요.');
  for (const k of ['KRW','USD','HKD','EUR','GBP','JPY'] as const) if (!Number.isFinite(rates[k]) || rates[k] <= 0) throw new Error('환율을 확인할 수 없습니다.');
  const fx = (c: keyof Omit<QuoteRates,'date'>) => rates.KRW/rates[c];
  const unit = fx(quoteCurrency[i.country]), usd=fx('USD'), hkd=fx('HKD'), eur=fx('EUR'), gbp=fx('GBP'), jpy=fx('JPY');
  const gross=i.bottlePrice*unit, local=i.localShipping/i.bottles*unit;
  let bankFee=0;
  let goods=gross, baseGoods=gross, taxableFreight=0, shipping=0, fee=0, localCost=local, fta=false;
  const agency = (v:number)=>Math.max(v*.05,8000)+(v>1000000?25000:0);
  if(i.country==='HK'){taxableFreight=Math.min(13*usd,gross<=200000?22000:27800);shipping=22000;fee=agency(gross);bankFee=i.hkViaUk?(gross+local)*.02:0;}
  if(i.country==='US'){taxableFreight=Math.min(12.3*usd,gross<200000?18500:47500);shipping=23000;fee=agency(gross);fta=i.origin==='US'&&i.ftaConfirmed&&i.bottlePrice>150;}
  if(i.country==='FR'){goods=gross/1.2;baseGoods=goods;taxableFreight=Math.min(11.9*eur,goods<200000?18500:43800);fta=i.origin==='EU'&&i.ftaConfirmed&&goods/usd>150;fee=goods*.1+9000+((fta||i.origin!=='EU'&&goods/usd>150)?goods*.02:0);shipping=11.9*eur+(fta?3*eur:0)+5.5*eur;}
  if(i.country==='DE'){const net=i.germanyVatRefund?i.bottlePrice/1.19:i.bottlePrice;goods=(net+net*.04+3)*eur;baseGoods=net*eur;taxableFreight=Math.min(20.24*usd,gross<200000?18500:48400);fta=i.origin==='EU'&&i.ftaConfirmed&&gross/usd>150;shipping=Math.round(2*3.75*eur)+4900+10000+(fta?gross*.02:0);}
  if(i.country==='GB'){if(i.bottlePrice<=i.ukLocalTax)throw new Error('상품가는 현지 세금보다 커야 합니다.');goods=(i.bottlePrice-i.ukLocalTax)/1.2*gbp;baseGoods=goods;localCost=local+i.ukLocalTax*gbp;taxableFreight=Math.min(12*eur,goods<200000?18500:48600);fta=i.ftaConfirmed;fee=goods*.1+10000+(goods/usd>150?goods*.02:0);shipping=12*gbp+(fta?3*eur:0)+5.5*gbp;}
  if(i.country==='JP'){taxableFreight=Math.min(19.2*usd,gross<200000?15500:30000);shipping=Math.round(500*jpy)+Math.round(320*jpy)+3235+Math.round(200*jpy)+3000;fee=agency(gross)+gross*.02;}
  const above=i.country==='DE'?gross/usd>=150:baseGoods/usd>150;
  const taxBase=baseGoods+taxableFreight;
  const duty=above&&!fta?Math.round(taxBase*.15):0;
  const liquor=Math.round((taxBase+duty)*.3), education=Math.round(liquor*.1);
  const vat=above?Math.round((taxBase+duty+liquor+education)*.1):0;
  const subtotal=goods+localCost+duty+liquor+education+vat+shipping+fee;
  const platformRate=i.country==='HK'?.04:.06;
  const platformFee=Math.round(subtotal*platformRate+2.35*hkd);
  const raw=subtotal+platformFee+bankFee;
  const krw=Math.ceil(raw/100)*100;
  return {version:'townwine-sheet-2026-10-31-v3',country:i.country,currency:quoteCurrency[i.country],weightKg:2,fxDate:rates.date,rates,fta,taxBase,platformRate,rawSalePrice:raw,actualPlatformFee:['DE','JP'].includes(i.country)?Math.round(krw*platformRate+2.35*hkd):krw*platformRate+2.35*hkd,bankFee,goods,localShipping:localCost,taxableFreight,duty,liquor,education,vat,internationalShipping:shipping,purchaseFee:fee,platformFee,unitKrw:krw,unitHkd:i.country==='US'?krw/hkd:Math.round(krw/hkd*100)/100,totalKrw:krw*i.bottles};
}

export const registrationCountries={HK:'홍콩',US:'미국',FR:'프랑스',DE:'독일',GB:'영국',JP:'일본'};
