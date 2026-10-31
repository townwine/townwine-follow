var WORKBOOK_ID='1sJnPCGz_jFKIf0XY5ytme5aqjNf7dh1LVSIwxpQxgsE';
var COUNTRY_TABS={US:'미국',FR:'프랑스',DE:'독일',GB:'영국',HK:'홍콩',JP:'일본'};
function initializeSync(){var p=PropertiesService.getScriptProperties();if(!p.getProperty('QUOTE_SHEET_SECRET'))p.setProperty('QUOTE_SHEET_SECRET',Utilities.getUuid()+Utilities.getUuid());SpreadsheetApp.openById(WORKBOOK_ID).getName();}
function doPost(e){var lock=LockService.getScriptLock();try{
var body=JSON.parse(e.postData.contents),secret=PropertiesService.getScriptProperties().getProperty('QUOTE_SHEET_SECRET');
if(!secret||!body.payload||!/^\d+$/.test(body.timestamp)||Math.abs(Date.now()-Number(body.timestamp))>300000)throw Error('Unauthorized');
var expected=Utilities.computeHmacSha256Signature(body.timestamp+'.'+body.payload,secret,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
if(body.signature!==expected)throw Error('Unauthorized');
var data=JSON.parse(body.payload);if(data.action==='rates')return reply_({ok:true,rates:workbookRates_(data.country)});if(!/^[a-f0-9]{64}$/.test(data.requestId)||!COUNTRY_TABS[data.country]||data.input.country!==data.country||!/^gid:\/\/shopify\/Product\/\d+$/.test(data.productId))throw Error('Invalid request');
lock.waitLock(20000);var sheet=SpreadsheetApp.openById(WORKBOOK_ID).getSheetByName(COUNTRY_TABS[data.country]);if(!sheet)throw Error('Missing country tab');
var key='TW-'+data.requestId,last=sheet.getLastRow();if(last>1&&sheet.getRange(2,2,last-1,1).createTextFinder(key).matchEntireCell(true).useRegularExpression(false).findNext())return reply_({ok:true,requestId:data.requestId,duplicate:true});
var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];if(headers[1]!=='견적번호'||headers[3]!=='이메일'||headers[4]!=='닉네임')throw Error('Unexpected sheet columns');
var idColumn=ensureRequestColumn_(sheet,headers);if(last>1&&sheet.getRange(2,idColumn,last-1,1).createTextFinder(key).matchEntireCell(true).useRegularExpression(false).findNext())return reply_({ok:true,requestId:data.requestId,duplicate:true});var numbers=last>1?sheet.getRange(2,1,last-1,1).getValues():[];var sequence=numbers.reduce(function(max,row){var n=Number(row[0]);return Number.isSafeInteger(n)&&n>max?n:max;},0)+1;if(last>=sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),1);sheet.getRange(last+1,1,1,headers.length).setValues([quoteRow_(headers,data,sequence)]);SpreadsheetApp.flush();return reply_({ok:true,requestId:data.requestId});
}catch(error){console.error('Quote sheet write failed: '+error.message);return reply_({ok:false});}finally{if(lock.hasLock())lock.releaseLock();}}
function quoteRow_(headers,data,sequence){var i=data.input,q=data.quote,r=q.rates,normalized=headers.map(function(h){return String(h||'').replace(/\s/g,'');}),row=headers.map(function(){return '';});
function put(name,value,last){if(value==null||typeof value==='number'&&!isFinite(value))return;var target=last?normalized.lastIndexOf(name):normalized.indexOf(name);if(target>=0)row[target]=typeof value==='string'&&/^[=+@-]/.test(value)?"'"+value:value;}
put('No',sequence);put('견적번호',COUNTRY_TABS[data.country]+'견적#'+sequence);put('등록요청ID','TW-'+data.requestId);put('상태','견적접수');put('이메일',data.email||'');put('닉네임',data.nickname);put('입력날짜',Utilities.formatDate(new Date(data.createdAt),'Asia/Seoul','yyyy-MM-dd'));put('상품명',data.title);put('구매병수',i.bottles);put('견적종류','공동구매');put('구매링크',data.sourceUrl||'');if(i.origin)put('원산지',i.origin==='EU'?'EU':i.origin==='US'?'미국':'미국외');put('FTA',q.fta?'Y':'N');put('구매사이트소재국가',COUNTRY_TABS[data.country]);put('환율적용날짜',q.fxDate);
['EUR','USD','HKD','GBP','JPY'].forEach(function(c){put(c,r.KRW/r[c]);});var currency=q.currency;
['병당상품가('+currency+')','병당상품가(VAT포함)('+currency+')','병당상품가(VAT&TAX포함)('+currency+')','상품가('+currency+')'].forEach(function(h){put(h,i.bottlePrice);});
['현지배송비('+currency+')','현지배송비및수출면장수수료('+currency+')'].forEach(function(h){put(h,i.localShipping);});
['병당현지배송비('+currency+')','병당현지배송비및수출면장수수료('+currency+')'].forEach(function(h){put(h,i.localShipping/i.bottles);});
put('현지세금(GBP)',i.ukLocalTax);put('무게(kg)',q.weightKg);put('관세',q.duty,true);put('주세',q.liquor,true);put('교육세',q.education,true);put('부가세',q.vat);put('세금합계',q.duty+q.liquor+q.education+q.vat);put('세금합계(KRW)',q.duty+q.liquor+q.education+q.vat);
['상품가(KRW)','KRW상품가'].forEach(function(h){put(h,q.goods);});['현지배송비(KRW)','KRW현지배송비','KRW현지세금+배송비'].forEach(function(h){put(h,q.localShipping);});put('과세운임',q.taxableFreight);
['해외배송비','해외운송비','해외운송비*특수패킹비포함(KRW)'].forEach(function(h){put(h,q.internationalShipping);});['구매수수료','구매수수료(KRW)','구매대행수수료'].forEach(function(h){put(h,q.purchaseFee);});['쇼피파이수수료','쇼피파이수수료(예상)','쇼피파이수수료(예상)(KRW)'].forEach(function(h){put(h,q.platformFee);});put('관세',q.fta?0:(data.country==='US'?0.15:(q.duty>0?0.15:0)));put('주세',0.3);put('교육세',0.1);
put('병당상품가(VAT제외)(EUR)',i.bottlePrice/1.2);
put('훗타운과세운임',12.3*r.KRW/r.USD);put('GV운임',11.9*r.KRW/r.EUR);
put('과세가격',q.taxBase==null?q.goods+q.taxableFreight:q.taxBase);
put('항공운임',11.9*r.KRW/r.EUR);if(data.country==='FR')put('FTA',q.fta?3*r.KRW/r.EUR:0,true);
put('포장작업비',5.5*r.KRW/r.EUR);put('인플루언서할인쿠폰',0);
put('쇼피파이수수료',q.actualPlatformFee==null?q.unitKrw*0.06+2.35*r.KRW/r.HKD:q.actualPlatformFee);
put('적정판매가',q.rawSalePrice==null?q.goods+q.localShipping+q.duty+q.liquor+q.education+q.vat+q.internationalShipping+q.purchaseFee+q.platformFee:q.rawSalePrice);
fillCountryRow_(row,data);put('최종판매가(KRW)',q.unitKrw);put('최종판매가(HKD)',q.unitHkd);return row;}
function reply_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function ensureRequestColumn_(sheet,headers){var index=headers.indexOf('등록요청ID');if(index<0){index=headers.length;if(index>=sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),1);sheet.getRange(1,index+1).setValue('등록요청ID');headers.push('등록요청ID');}sheet.hideColumns(index+1);return index+1;}
function migrateApprovedQuoteNumbers(){var targets=[[132,'TW-555e801dcf5d10b0bbc476ab14b745ce6ac7804f375d3ed613afff47fc03c00d'],[133,'TW-87430500c008d86ae4c90044901e15e93fe9fa31d4fc1c042e302185acf423e6']];var lock=LockService.getScriptLock();lock.waitLock(20000);try{var sheet=SpreadsheetApp.openById(WORKBOOK_ID).getSheetByName('미국');var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];if(headers[0]!=='No'||headers[1]!=='견적번호')throw Error('Unexpected sheet columns');var column=ensureRequestColumn_(sheet,headers),last=sheet.getLastRow();targets.forEach(function(target){var cell=sheet.getRange(2,2,last-1,1).createTextFinder(target[1]).matchEntireCell(true).useRegularExpression(false).findNext();if(!cell)return;var row=cell.getRow();if(Number(sheet.getRange(row,1).getValue())!==target[0])throw Error('Unexpected quote number');sheet.getRange(row,column).setValue(target[1]);SpreadsheetApp.flush();cell.setValue('미국견적#'+target[0]);});SpreadsheetApp.flush();}finally{lock.releaseLock();}}
function workbookRates_(country){
 var book=SpreadsheetApp.openById(WORKBOOK_ID), rates={KRW:1,date:Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd')};
 [COUNTRY_TABS[country]||'미국','프랑스','영국','일본'].forEach(function(name){var rows=book.getSheetByName(name).getRange(1,1,2,45).getValues();['EUR','USD','HKD','GBP','JPY'].forEach(function(c){var n=rows[0].indexOf(c);if(!rates[c]&&n>=0&&Number(rows[1][n])>0)rates[c]=1/Number(rows[1][n]);});});
 ['EUR','USD','HKD','GBP','JPY'].forEach(function(c){if(!rates[c]||!isFinite(rates[c]))throw Error('Missing workbook rate');});return rates;
}

// Country-specific workbook columns, verified against the 2026-10-31 headers.
function fillCountryRow_(row,data){
 var i=data.input,q=data.quote,r=q.rates,fx=function(c){return r.KRW/r[c];},gross=i.bottlePrice*fx(q.currency),local=i.localShipping/i.bottles,tax=q.duty+q.liquor+q.education+q.vat;
 if(!isFinite(gross))return;
 var cells;
 if(data.country==='HK')cells={K:.15,S:i.hkViaUk?'Y':'N',T:'HKD',U:i.bottlePrice,V:i.localShipping,W:local,X:(q.bankFee||0)/fx('HKD'),Y:i.bottlePrice,Z:local,AA:(q.bankFee||0)/fx('HKD'),AB:q.goods,AC:q.localShipping,AD:q.bankFee||0,AE:gross/fx('USD'),AF:2,AG:13*fx('USD'),AH:q.taxableFreight,AI:q.taxBase,AJ:q.duty,AK:q.liquor,AL:q.education,AM:q.vat,AN:tax,AO:q.internationalShipping,AP:q.purchaseFee,AQ:0,AR:q.platformFee,AS:q.rawSalePrice,AT:q.unitKrw,AU:q.unitHkd};
 if(data.country==='DE'){var net=i.germanyVatRefund?i.bottlePrice/1.19:i.bottlePrice;cells={N:q.fta?0:.15,K:i.germanyVatRefund?'독일':'기타',U:i.bottlePrice,V:gross,W:net,X:i.localShipping,Y:local,Z:.04,AA:net*.04,AB:3,AC:net-i.bottlePrice,AD:q.goods+q.localShipping,AE:2,AF:20.24*fx('USD'),AG:q.taxableFreight,AH:q.taxBase,AI:q.duty,AJ:q.liquor,AK:q.education,AL:q.vat,AM:tax,AN:q.internationalShipping,AO:0,AP:q.platformFee,AQ:q.actualPlatformFee,AR:q.rawSalePrice,AS:q.unitKrw,AT:q.unitHkd};}
 if(data.country==='GB')cells={T:i.bottlePrice,U:(i.bottlePrice-i.ukLocalTax)/1.2,V:i.ukLocalTax,W:i.localShipping,X:local,Y:q.goods,Z:q.localShipping,AA:2,AB:12*fx('EUR'),AC:q.taxableFreight,AD:q.taxBase,AE:q.duty,AF:q.liquor,AG:q.education,AH:q.vat,AI:tax,AJ:q.purchaseFee,AK:12*fx('GBP'),AL:q.fta?3*fx('EUR'):0,AM:5.5*fx('GBP'),AN:0,AO:q.internationalShipping,AP:q.platformFee,AQ:q.actualPlatformFee,AR:q.rawSalePrice,AS:q.unitKrw,AT:q.unitHkd};
 if(data.country==='JP')cells={K:.15,N:i.bottlePrice,O:i.bottlePrice*.02,P:i.localShipping,Q:local,V:q.goods,W:gross*.02,X:q.localShipping,Y:gross/fx('USD'),Z:2,AA:19.2*fx('USD'),AB:q.taxableFreight,AC:q.taxBase,AD:q.duty,AE:q.liquor,AF:q.education,AG:q.vat,AH:tax,AI:Math.round(500*fx('JPY')),AJ:Math.round(320*fx('JPY')),AK:3235,AL:Math.round(200*fx('JPY')),AM:3000,AN:q.internationalShipping,AO:q.purchaseFee-gross*.02,AP:0,AQ:q.platformFee,AR:q.actualPlatformFee,AS:q.rawSalePrice,AT:q.unitKrw,AU:q.unitHkd};
 Object.keys(cells||{}).forEach(function(col){var n=0;for(var j=0;j<col.length;j++)n=n*26+col.charCodeAt(j)-64;var value=cells[col];if(n<=row.length&&value!=null&&(typeof value!=='number'||isFinite(value)))row[n-1]=value;});
}
