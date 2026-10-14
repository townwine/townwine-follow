/** Bound to the official Townwine workbook. Configure QUOTE_SHEET_SECRET in Script Properties. */
var WORKBOOK_ID = '1sJnPCGz_jFKIf0XY5ytme5aqjNf7dh1LVSIwxpQxgsE';
var COUNTRY_TABS = {US:'미국',FR:'프랑스',DE:'독일',GB:'영국',HK:'홍콩',JP:'일본'};

function initializeSync() {
  var properties=PropertiesService.getScriptProperties();
  if(!properties.getProperty('QUOTE_SHEET_SECRET'))properties.setProperty('QUOTE_SHEET_SECRET',Utilities.getUuid()+Utilities.getUuid());
  SpreadsheetApp.openById(WORKBOOK_ID).getName();
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('QUOTE_SHEET_SECRET');
    if (!secret || !body.payload || !/^\d+$/.test(body.timestamp) || Math.abs(Date.now()-Number(body.timestamp)) > 300000) throw Error('Unauthorized');
    var expected = Utilities.computeHmacSha256Signature(body.timestamp+'.'+body.payload,secret,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
    if (body.signature !== expected) throw Error('Unauthorized');
    var data = JSON.parse(body.payload);
    if (!/^[a-f0-9]{64}$/.test(data.requestId) || !COUNTRY_TABS[data.country] || data.input.country !== data.country || !/^gid:\/\/shopify\/Product\/\d+$/.test(data.productId)) throw Error('Invalid request');
    lock.waitLock(20000);
    var sheet = SpreadsheetApp.openById(WORKBOOK_ID).getSheetByName(COUNTRY_TABS[data.country]);
    if (!sheet) throw Error('Missing country tab');
    var key = 'TW-'+data.requestId;
    var last = sheet.getLastRow();
    if (last>1 && sheet.getRange(2,2,last-1,1).createTextFinder(key).matchEntireCell(true).useRegularExpression(false).findNext()) return reply_({ok:true,requestId:data.requestId,duplicate:true});
    var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    if (headers[1]!=='견적번호'||headers[3]!=='이메일'||headers[4]!=='닉네임') throw Error('Unexpected sheet columns');
    var row = quoteRow_(headers,data,last);
    sheet.getRange(last+1,1,1,row.length).setValues([row]);
    SpreadsheetApp.flush();
    // The request key is the write receipt, including after an ambiguous network timeout.
    return reply_({ok:true,requestId:data.requestId});
  } catch (error) {
    console.error('Quote sheet write failed: '+error.message);
    return reply_({ok:false});
  } finally {if(lock.hasLock())lock.releaseLock();}
}

function quoteRow_(headers,data,sequence) {
  var i=data.input,q=data.quote,r=q.rates;
  var normalized=headers.map(function(h){return h.replace(/\s/g,'');});
  var row=headers.map(function(){return '';});
  function put(name,value,last) {
    if(value==null || typeof value==='number'&&!isFinite(value))return;
    var target=last?normalized.lastIndexOf(name):normalized.indexOf(name);
    if(target>=0)row[target]=typeof value==='string'&&/^[=+@-]/.test(value)?"'"+value:value;
  }
  put('No',sequence);put('견적번호','TW-'+data.requestId);put('상태','견적접수');
  put('이메일',data.email||'');put('닉네임',data.nickname);put('입력날짜',Utilities.formatDate(new Date(data.createdAt),'Asia/Seoul','yyyy-MM-dd'));
  put('상품명',data.title);put('구매병수',i.bottles);put('견적종류','공동구매');put('구매링크',data.sourceUrl||'');
  put('원산지',i.origin==='EU'?'EU':i.origin==='US'?'미국':'미국외');put('FTA',q.fta?'Y':'N');
  put('구매사이트소재국가',COUNTRY_TABS[data.country]);
  put('환율적용날짜',q.fxDate);
  ['EUR','USD','HKD','GBP','JPY'].forEach(function(c){put(c,r.KRW/r[c]);});
  var currency=q.currency;
  ['병당상품가('+currency+')','병당상품가(VAT포함)('+currency+')','병당상품가(VAT&TAX포함)('+currency+')','상품가('+currency+')'].forEach(function(h){put(h,i.bottlePrice);});
  ['현지배송비('+currency+')','현지배송비및수출면장수수료('+currency+')'].forEach(function(h){put(h,i.localShipping);});
  ['병당현지배송비('+currency+')','병당현지배송비및수출면장수수료('+currency+')'].forEach(function(h){put(h,i.localShipping/i.bottles);});
  put('현지세금(GBP)',i.ukLocalTax);put('무게(kg)',q.weightKg);
  put('관세',q.duty,true);put('주세',q.liquor,true);put('교육세',q.education,true);put('부가세',q.vat);
  put('세금합계',q.duty+q.liquor+q.education+q.vat);put('세금합계(KRW)',q.duty+q.liquor+q.education+q.vat);
  ['상품가(KRW)','KRW상품가'].forEach(function(h){put(h,q.goods);});
  ['현지배송비(KRW)','KRW현지배송비','KRW현지세금+배송비'].forEach(function(h){put(h,q.localShipping);});
  put('과세운임',q.taxableFreight);
  ['해외배송비','해외운송비','해외운송비*특수패킹비포함(KRW)'].forEach(function(h){put(h,q.internationalShipping);});
  ['구매수수료','구매수수료(KRW)','구매대행수수료'].forEach(function(h){put(h,q.purchaseFee);});
  ['쇼피파이수수료','쇼피파이수수료(예상)','쇼피파이수수료(예상)(KRW)'].forEach(function(h){put(h,q.platformFee);});
  put('최종판매가(KRW)',q.unitKrw);put('최종판매가(HKD)',q.unitHkd);
  return row;
}
function reply_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
