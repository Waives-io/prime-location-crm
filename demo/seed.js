// Demo data for "נדל״ן בע״מ": fictional people, companies and fake 05X-555XXXX numbers.
// Dates are offsets in days from "today", so the dashboard is never empty. `M(k)` = k days ago but still inside this month.
window.PL_DEMO_SEED = (todayISO) => {
  const today = new Date(todayISO + 'T09:00:00');
  const dom = today.getDate();
  const M = (k) => -Math.min(k, dom - 1);
  const day = (off) => { const d = new Date(today); d.setDate(d.getDate() + off); return d; };
  const date = (off) => { const d = day(off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ts = (off) => day(off).toISOString();
  let n = 0;
  const uid = (p) => `${p}-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  // option lists; match_group = purpose group / transaction code used by matching
  const options = [];
  const opt = (list_key, value, match_group) => { const o = { id: uid('a0000000'), list_key, value, match_group, sort: (options.filter(x => x.list_key === list_key).length + 1) * 10, created_at: ts(-200) }; options.push(o); return o.id; };
  const need = { rent: opt('lead_need', 'לשכור', 'rent'), buy: opt('lead_need', 'לקנות', 'buy'), invest: opt('lead_need', 'להשקעה', 'invest'), let: opt('lead_need', 'להשכיר', null) };
  const lp = {
    logistics: opt('lead_purpose', 'מרלו״ג', 'storage'), storage: opt('lead_purpose', 'מחסן', 'storage'),
    light: opt('lead_purpose', 'תעשייה קלה', 'industry'), heavy: opt('lead_purpose', 'תעשייה כבדה', 'industry'),
    offices: opt('lead_purpose', 'משרדים', 'offices'), shop: opt('lead_purpose', 'מסחר / חנות', 'commerce'),
    land: opt('lead_purpose', 'קרקע / מגרש', 'land'),
  };
  const op = {
    storage: opt('owner_purpose', 'מחסן', 'storage'), logistics: opt('owner_purpose', 'מרלו״ג', 'storage'),
    industry: opt('owner_purpose', 'מבנה תעשייה', 'industry'), offices: opt('owner_purpose', 'משרדים', 'offices'),
    shop: opt('owner_purpose', 'חנות', 'commerce'), commerce: opt('owner_purpose', 'מסחר', 'commerce'),
    land: opt('owner_purpose', 'קרקע', 'land'),
  };

  // city centres = the CITIES list in index.html, so "nearest city" on the dashboard is the city written here
  const CITY = {
    'קריית גת': [31.610, 34.770], 'אשקלון': [31.668, 34.574], 'אשדוד': [31.800, 34.650], 'באר שבע': [31.252, 34.791],
    'שדרות': [31.525, 34.596], 'נתיבות': [31.420, 34.588], 'קריית מלאכי': [31.730, 34.745], 'רחובות': [31.894, 34.811],
    'ראשון לציון': [31.964, 34.804], 'חולון': [32.016, 34.780], 'יבנה': [31.877, 34.739], 'אופקים': [31.314, 34.620],
  };
  const at = (city, dLat = 0, dLng = 0) => ({ lat: +(CITY[city][0] + dLat).toFixed(5), lng: +(CITY[city][1] + dLng).toFixed(5) });

  const contacts = [];
  const contact = (name, company, phone) => { const c = { id: uid('c0000000'), phone, name, entity_type: company ? 'company' : 'private', company_name: company, created_at: ts(-200) }; contacts.push(c); return c.id; };

  // leads: [name, company, need, purpose, size, unit, city, dLat, dLng, radius km, height, budget, 't'otal|'s'qm, currency,
  //         lead date offset, needed-by offset, status, closed offset, updated offset, notes]
  const L = [
    ['יוסי אברהם', 'אברהם לוגיסטיקה בע״מ', 'rent', 'logistics', 1200, 'sqm', 'קריית גת', 0, 0, 6, 9, 48, 's', 'ILS', M(3), 40, 'active', null, M(2), 'רמפת פריקה ו-2 דלתות משאית'],
    ['מירב כהן', null, 'buy', 'offices', 150, 'sqm', 'אשקלון', 0, 0, 4, 3, 2300000, 't', 'ILS', -21, 75, 'active', null, -5, 'קומה גבוהה, חניה צמודה'],
    ['דוד לוי', 'לוי מתכות', 'rent', 'heavy', 2, 'dunam', 'קריית גת', 0.004, -0.006, 10, 12, 40, 's', 'ILS', -46, 3, 'active', null, -41, 'חשמל תלת פאזי, עגורן גשר'],
    ['רונית שרעבי', null, 'rent', 'shop', 80, 'sqm', 'שדרות', 0, 0, 3, 3.5, 7000, 't', 'ILS', M(6), 1, 'active', null, M(6), 'חזית לרחוב ראשי'],
    ['אבי מזרחי', 'מזרחי שיווק והפצה', 'rent', 'storage', 500, 'sqm', 'אשדוד', 0, 0, 6, 7, 45, 's', 'ILS', -36, 52, 'active', null, -34, null],
    ['נועה פרץ', null, 'buy', 'land', 1, 'dunam', 'קריית גת', 0.012, -0.03, 4, 6, 1800000, 't', 'ILS', M(1), 220, 'active', null, M(1), 'מגרש לבנייה פרטית'],
    ['משה ביטון', 'ביטון הובלות', 'rent', 'light', 800, 'sqm', 'שדרות', 0, 0, 7, 8, 38, 's', 'ILS', -19, 80, 'active', null, -12, 'חניה למשאיות'],
    ['ליאור אזולאי', 'אזולאי השקעות', 'invest', 'shop', 300, 'sqm', 'אשקלון', 0, 0, 8, 4, 1250000, 't', 'USD', -9, 150, 'active', null, -9, 'נכס מניב עם שוכר קיים'],
    ['עמית גבאי', 'גבאי טקסטיל', 'buy', 'light', 3, 'dunam', 'קריית גת', 0, 0, 15, 10, 9000000, 't', 'ILS', -130, -40, 'irrelevant', -38, -38, 'ויתר – עבר לצפון'],
    ['שירן אוחיון', null, 'rent', 'offices', 60, 'sqm', 'אשקלון', 0, 0, 3, 3, 3500, 't', 'ILS', -95, -45, 'closed', -50, -50, null],
    ['אורן שטרית', 'שטרית אלקטרוניקה', 'rent', 'light', 400, 'sqm', 'אשדוד', -0.004, 0.006, 5, 6, 55, 's', 'ILS', M(4), 6, 'active', null, M(4), 'מיזוג וחדר נקי קטן'],
    ['חן ממן', 'ממן קייטרינג', 'rent', 'storage', 250, 'sqm', 'נתיבות', 0, 0, 5, 5, 11000, 't', 'ILS', -28, 30, 'active', null, -28, 'כולל חדר קירור'],
    ['גלית אלמוג', null, 'buy', 'offices', 90, 'sqm', 'רחובות', 0, 0, 3, 3, 1700000, 't', 'ILS', M(8), 120, 'active', null, M(8), 'לקליניקה'],
    ['רפאל סבג', 'סבג סחר', 'rent', 'logistics', 3000, 'sqm', 'אשדוד', 0, 0, 10, 12, 52, 's', 'ILS', -15, -3, 'active', null, -15, 'שטח תפעולי למכולות'],
    ['יעל בירנבאום', 'בירנבאום עיצובים', 'rent', 'shop', 120, 'sqm', 'ראשון לציון', 0, 0, 4, 4, 14000, 't', 'ILS', -52, 25, 'active', null, -44, null],
    ['איתי פרידמן', 'פרידמן תוכנה בע״מ', 'rent', 'offices', 220, 'sqm', 'רחובות', 0.003, 0.004, 5, 3, 75, 's', 'ILS', -7, 60, 'active', null, -3, 'סמוך לרכבת'],
    ['סיגל אדרי', null, 'invest', 'storage', 600, 'sqm', 'קריית גת', 0, 0, 12, 7, 4800000, 't', 'ILS', -64, 100, 'active', null, -61, 'תשואה 7% ומעלה'],
    ['ברק נחום', 'נחום מזון', 'rent', 'light', 1500, 'sqm', 'קריית מלאכי', 0, 0, 8, 9, 40, 's', 'ILS', M(5), 45, 'active', null, M(5), 'רישוי עסק למזון'],
    ['טל סויסה', null, 'rent', 'shop', 45, 'sqm', 'נתיבות', 0, 0, 2, 3, 4500, 't', 'ILS', -110, -60, 'closed', -70, -70, null],
    ['אלון קורן', 'קורן הנדסה', 'buy', 'industry', 1000, 'sqm', 'אשקלון', 0, 0, 8, 8, 7500000, 't', 'ILS', -60, -10, 'closed', M(4), M(4), null],
    ['מאיה רוזן', null, 'rent', 'offices', 40, 'sqm', 'חולון', 0, 0, 3, 3, 3800, 't', 'ILS', M(2), 20, 'active', null, M(2), null],
    ['שמעון חזן', 'חזן ובניו', 'rent', 'storage', 900, 'sqm', 'באר שבע', 0, 0, 8, 8, 32, 's', 'ILS', -40, 0, 'active', null, -33, 'גישה לסמיטריילר'],
    ['רותם לוי', 'לוי פרזול', 'rent', 'storage', 350, 'sqm', 'שדרות', 0, 0, 5, 6, 12500, 't', 'ILS', -24, 90, 'active', null, -24, null],
    ['דנה כץ', null, 'buy', 'shop', 70, 'sqm', 'יבנה', 0, 0, 3, 3, 1600000, 't', 'ILS', -150, -90, 'irrelevant', M(9), M(9), 'מצאה דרך מתווך אחר'],
    ['ניר עמר', 'עמר תעשיות', 'rent', 'heavy', 4000, 'sqm', 'אופקים', 0, 0, 12, 14, 28, 's', 'ILS', -75, 35, 'active', null, -70, null],
    ['אפרת גולן', 'גולן פרסום', 'rent', 'offices', 120, 'sqm', 'אשדוד', 0, 0, 4, 3, 9000, 't', 'ILS', -11, 4, 'active', null, -11, null],
    ['חיים בן דוד', 'בן דוד בנייה', 'buy', 'land', 4, 'dunam', 'נתיבות', 0, 0, 10, 10, 5500000, 't', 'ILS', -33, 180, 'active', null, -31, 'קרקע לתעשייה'],
    ['אורית מלכה', null, 'let', 'shop', 90, 'sqm', 'קריית גת', 0, 0, 2, 3, 8000, 't', 'ILS', M(7), 30, 'active', null, M(7), 'רוצה להשכיר חנות קיימת'],
    ['קובי אלון', 'אלון מוצרי חשמל', 'rent', 'logistics', 2000, 'sqm', 'קריית גת', -0.003, 0.004, 8, 10, 46, 's', 'ILS', -90, -20, 'closed', M(6), M(6), null],
    ['הדס ויצמן', null, 'invest', 'offices', 200, 'sqm', 'ראשון לציון', 0, 0, 6, 3, 900000, 't', 'USD', -17, 140, 'active', null, -17, null],
  ];
  const lead = L.map(([name, company, nd, pu, size, unit, city, dLat, dLng, rKm, h, budget, bk, cur, ld, nb, status, cl, up, notes], i) => ({
    id: uid('d1000000'), contact_id: contact(name, company, `05${'02348'[i % 5]}-555${String(1001 + i).slice(-4)}`),
    lead_date: date(ld), need_id: need[nd], purpose_id: lp[pu], size_value: size, size_unit: unit, ...at(city, dLat, dLng),
    address: city, radius_m: rKm * 1000, height_m: h, notes, budget_value: budget, budget_kind: bk === 's' ? 'per_sqm' : 'total',
    budget_currency: cur, needed_by: date(nb), status, closed_at: cl == null ? null : ts(cl), custom: {},
    created_at: ts(ld), updated_at: ts(up),
  }));

  // properties: [name, company, purpose, built, plot, city, dLat, dLng, address, description, kind, asking price/value,
  //              rented now, current rent, asking rent, created offset, status, closed offset, updated offset]
  const O = [
    ['אליהו דהן', 'דהן נכסים', 'storage', 1300, 2200, 'קריית גת', 0.002, -0.003, 'אזור התעשייה, קריית גת', 'מבנה אחסנה, גובה 11 מ׳, 2 רמפות', 'rent', 9500000, false, null, 59000, -25, 'active', null, -6],
    ['שמואל רביבו', null, 'logistics', 1100, 2000, 'קריית גת', -0.006, 0.01, 'פארק תעשייה מערב, קריית גת', 'מרלו״ג עם חצר תפעולית', 'rent', 8800000, false, null, 56000, M(3), 'active', null, M(3)],
    ['ציון אלמליח', 'אלמליח החזקות', 'industry', 2100, 3000, 'קריית גת', 0.01, -0.02, 'אזור התעשייה הצפוני, קריית גת', 'מבנה תעשייה, תלת פאזי, עגורן 10 טון', 'rent', 16000000, false, null, 78000, -50, 'active', null, -48],
    ['מזל חדד', null, 'shop', 85, 85, 'שדרות', 0.002, 0.001, 'מרכז העיר, שדרות', 'חנות בקומת קרקע, חזית 7 מ׳', 'rent', 1300000, false, null, 6500, -14, 'active', null, -14],
    ['גיל אוחנה', 'אוחנה בנייה', 'storage', 520, 900, 'אשדוד', 0.003, -0.002, 'אזור התעשייה הצפוני, אשדוד', 'מחסן עם רמפה ושער חשמלי', 'rent', 4400000, true, 21000, 23500, -40, 'active', null, -38],
    ['ענבל טל', null, 'offices', 155, 155, 'אשקלון', 0.001, -0.004, 'מרינה, אשקלון', 'משרדים מחולקים, קומה 6, נוף לים', 'sale', 2150000, null, null, null, -30, 'active', null, -30],
    ['אריה גרוס', 'גרוס נדל״ן', 'industry', 850, 1500, 'שדרות', -0.004, 0.003, 'אזור תעשייה ספיר, שדרות', 'מבנה תעשייה עם משרדים בקומה ב׳', 'rent', 6200000, false, null, 30000, -22, 'active', null, -22],
    ['רינה פרלמן', null, 'commerce', 320, 400, 'אשקלון', -0.002, 0.003, 'רחוב הרצל, אשקלון', 'קומת מסחר מושכרת לרשת', 'sale', 4300000, null, null, null, -12, 'active', null, -12],
    ['יוסף מרציאנו', null, 'land', 0, 1050, 'קריית גת', 0.01, -0.028, 'שכונת כרמי גת, קריית גת', 'מגרש לבנייה צמודת קרקע', 'sale', 1750000, null, null, null, M(2), 'active', null, M(2)],
    ['שלמה קדוש', 'קדוש ושות׳', 'industry', 420, 600, 'אשדוד', -0.002, 0.004, 'אזור תעשייה ב׳, אשדוד', 'מבנה קל עם מיזוג מרכזי', 'rent', 3600000, false, null, 23000, -35, 'active', null, -35],
    ['ורד שושן', null, 'storage', 240, 300, 'נתיבות', 0.002, 0.002, 'אזור התעשייה, נתיבות', 'מחסן עם חדר קירור', 'rent', 1700000, false, null, null, -26, 'active', null, -26],
    ['תומר נגר', null, 'offices', 95, 95, 'רחובות', 0.001, 0.002, 'פארק המדע, רחובות', 'משרד במגדל משרדים, 2 חניות', 'sale', 1750000, null, null, null, -16, 'active', null, -16],
    ['דורית שמש', 'שמש לוגיסטיקה', 'logistics', 3200, 6000, 'אשדוד', 0.004, 0.005, 'אזור התעשייה הדרומי, אשדוד', 'מרלו״ג גובה 13 מ׳, 6 רמפות', 'rent', 26000000, false, null, 172000, -20, 'active', null, -9],
    ['עוזי ברק', null, 'shop', 110, 110, 'ראשון לציון', 0.002, -0.003, 'רחוב רוטשילד, ראשון לציון', 'חנות פינתית, חלון ראווה כפול', 'rent', 2600000, false, null, 15000, -48, 'active', null, -46],
    ['נחמה זילבר', null, 'offices', 230, 230, 'רחובות', 0.002, 0.002, 'קריית המדע, רחובות', 'קומת משרדים מרוהטת', 'rent', 4100000, false, null, 16500, M(4), 'active', null, M(4)],
    ['בני שלום', 'שלום אחזקות', 'storage', 620, 1100, 'קריית גת', -0.004, 0.002, 'אזור התעשייה, קריית גת', 'מחסן מושכר עם חוזה ל-5 שנים', 'sale', 4500000, null, null, null, -70, 'active', null, -66],
    ['יגאל חורי', null, 'industry', 1450, 2500, 'קריית מלאכי', 0.002, 0.004, 'אזור התעשייה, קריית מלאכי', 'מבנה מזון לשעבר, רצפת אפוקסי', 'rent', 9000000, false, null, 58000, -10, 'active', null, -10],
    ['ליה ברגר', null, 'offices', 45, 45, 'חולון', 0.001, 0.002, 'אזור התעשייה, חולון', 'משרד קטן עם מטבחון', 'rent', 900000, false, null, 4100, -60, 'active', null, -58],
    ['ששון יפרח', 'יפרח השקעות', 'storage', 950, 1600, 'באר שבע', 0.003, 0.001, 'עמק שרה, באר שבע', 'מחסן עם גישה לסמיטריילר', 'rent', 5500000, false, null, 28500, -45, 'active', null, -44],
    ['אסתר מימון', null, 'commerce', 2500, 3000, 'אשקלון', 0.003, 0.002, 'מרכז מסחרי, אשקלון', 'קומת מסחר מתחת למגורים', 'sale', 62000000, null, null, null, -120, 'irrelevant', -40, -40],
    ['ראובן סעדה', null, 'shop', 60, 60, 'נתיבות', 0, 0, 'מרכז העיר, נתיבות', 'חנות קטנה ברחוב ראשי', 'rent', 800000, false, null, 4300, -100, 'closed', -70, -70],
    ['מיכל אבוטבול', 'אבוטבול נכסים', 'industry', 980, 1600, 'אשקלון', 0.005, -0.004, 'אזור התעשייה הצפוני, אשקלון', 'מבנה תעשייה, 2 קומות', 'sale', 7300000, null, null, null, -80, 'closed', M(4), M(4)],
    ['ארז דאהן', null, 'logistics', 2100, 4000, 'קריית גת', -0.003, 0.005, 'פארק תעשייה מזרח, קריית גת', 'מרלו״ג חדש', 'rent', 15000000, false, null, 95000, -95, 'closed', M(6), M(6)],
    ['פנינה לוי', null, 'shop', 75, 75, 'יבנה', 0, 0, 'מרכז העיר, יבנה', 'חנות בקניון פתוח', 'sale', 1550000, null, null, null, -55, 'active', null, -53],
    ['עידו כרמי', 'כרמי תעשיות', 'industry', 4200, 7000, 'אופקים', 0.004, 0.003, 'אזור התעשייה, אופקים', 'מבנה תעשייה כבדה, גובה 14 מ׳', 'rent', 21000000, false, null, 105000, M(1), 'active', null, M(1)],
  ];
  const owner = O.map(([name, company, pu, built, plot, city, dLat, dLng, address, description, kind, price, rented, rent, askRent, cr, status, cl, up], i) => ({
    id: uid('d2000000'), contact_id: contact(name, company, `05${'48230'[i % 5]}-555${String(2001 + i).slice(-4)}`),
    purpose_id: op[pu], built_sqm: built || plot, plot_sqm: plot, ...at(city, dLat, dLng), address, description, deal_kind: kind,
    asking_price: price, is_rented: kind === 'rent' ? rented : null, monthly_rent: kind === 'rent' && rented ? rent : null,
    yield_pct: kind === 'rent' && rented ? Math.round(rent * 12 / price * 10000) / 100 : null,
    asking_rent: kind === 'rent' ? askRent : null, ai_price_per_sqm: null, status, closed_at: cl == null ? null : ts(cl), custom: {},
    created_at: ts(cr), updated_at: ts(up),
  }));
  // ── demo-only fields (as the app's own custom fields, so the form edits them with no extra code) ──
  const fields = [
    { id: uid('f0000000'), module: 'lead', key: 'f_stage', label: 'סטטוס', type: 'list', options: ['חם', 'בתהליך', 'חדש', 'לא פעיל'], sort: 10, section: 'contact', created_at: ts(-200) },
    { id: uid('f0000000'), module: 'lead', key: 'f_source', label: 'מקור הגעה', type: 'list', options: ['אתר החברה', 'הפניה', 'גוגל', 'לידים נכנסים', 'קמפיין פייסבוק', 'יד2'], sort: 20, section: 'contact', created_at: ts(-200) },
    { id: uid('f0000000'), module: 'lead', key: 'f_email', label: 'אימייל', type: 'text', options: [], sort: 30, section: 'contact', created_at: ts(-200) },
    { id: uid('f0000000'), module: 'owner', key: 'f_pstatus', label: 'סטטוס נכס', type: 'list', options: ['פעיל', 'פנוי', 'מושכר', 'בתהליך שיווק'], sort: 10, section: 'property', created_at: ts(-200) },
    { id: uid('f0000000'), module: 'owner', key: 'f_occ', label: 'תפוסה %', type: 'number', options: [], sort: 20, section: 'property', created_at: ts(-200) },
    { id: uid('f0000000'), module: 'owner', key: 'f_email', label: 'אימייל איש קשר', type: 'text', options: [], sort: 30, section: 'contact', created_at: ts(-200) },
    { id: uid('f0000000'), module: 'lead', key: 'f_old', label: 'שדה ישן', type: 'text', options: [], sort: 90, section: 'money', hidden: true, created_at: ts(-200) },
  ];
  const SOURCES = fields[1].options;
  const latin = ['yossi', 'merav', 'david', 'ronit', 'avi', 'noa', 'moshe', 'lior', 'amit', 'shiran', 'oren', 'chen', 'galit', 'refael', 'yael', 'itay', 'sigal', 'barak', 'tal', 'alon', 'maya', 'shimon', 'rotem', 'dana', 'nir', 'efrat', 'chaim', 'orit', 'kobi', 'hadas'];
  const at2 = (off, h, m = 0) => { const d = day(off); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const ageDays = (iso) => Math.round((today - new Date(iso)) / 864e5);
  // round 2+3 shape: size range, brokers (+ licence), companies (+ ח.פ.), optional fields left empty on some records
  const contactOf = (d) => contacts.find(c => c.id === d.contact_id);
  lead.forEach((d, i) => {
    const sz = d.size_value;
    d.size_min = i % 3 === 0 ? Math.round(sz * 0.8) : sz;
    d.size_max = i % 3 === 0 ? Math.round(sz * 1.25) : sz;
    if (d.size_unit === 'dunam') { d.size_min = i % 3 === 0 ? Math.max(1, sz - 1) : sz; d.size_max = i % 3 === 0 ? sz + 1 : sz; }
    const c = contactOf(d);
    if (c.entity_type === 'company') c.company_number = String(514000000 + i * 7919).slice(0, 9);
    if ([7, 25].includes(i)) { c.entity_type = 'broker'; c.broker_license = String(3141500 + i); c.company_name = null; c.company_number = null; }
  });
  // a few leads with optional fields left empty, as Leah may save them now
  Object.assign(lead[16], { needed_by: null });                     // סיגל אדרי – no deadline
  Object.assign(lead[29], { budget_value: null, budget_kind: null }); // הדס ויצמן – no budget yet
  Object.assign(lead[27], { size_value: null, size_min: null, size_max: null, height_m: null }); // אורית מלכה – no size
  lead.forEach((d, i) => {
    const stage = d.status !== 'active' || ageDays(d.updated_at) >= 30 ? 'לא פעיל' : ageDays(d.created_at) <= 7 ? 'חדש' : ['חם', 'בתהליך', 'בתהליך', 'חם', 'בתהליך'][i % 5];
    d.custom = { f_stage: stage, f_source: SOURCES[i % SOURCES.length], f_email: `${latin[i]}@${i % 3 ? 'gmail.com' : 'company.co.il'}` };
    d.response_h = [1.5, 2, 3, 0.5, 4, 2.5, 1, 6, 2][i % 9];           // hours until the first reply (demo data)
    d.log = i % 3 ? [] : [{ id: uid('e0000000'), text: 'שיחת היכרות – מעוניין לראות אפשרויות השבוע', at: at2(-2 - (i % 5), 11, 20) }];
    d.tasks = d.status !== 'active' ? [] : [
      { id: uid('e0000000'), kind: 'task', text: i % 2 ? 'לחזור עם הצעת מחיר' : 'לשלוח רשימת נכסים מתאימים', due: at2(i % 4, 14), done: false },
      ...(i % 3 === 0 ? [{ id: uid('e0000000'), kind: 'meeting', text: 'סיור בנכס', due: at2(2 + (i % 3), 10, 30), done: false }] : []),
    ];
  });
  // one picture per property, matching its type, never repeated (Unsplash photos, see assets/photos/CREDITS.txt)
  const COVERS = { 'מחסן': 'storage', 'מרלו״ג': 'storage', 'מבנה תעשייה': 'industry', 'משרדים': 'offices', 'חנות': 'shop', 'מסחר': 'mall', 'קרקע': 'land' };
  const used = {};
  const optValue = (id) => options.find(o => o.id === id)?.value;
  owner.forEach((d, i) => {
    const kind = COVERS[optValue(d.purpose_id)] || 'offices';
    used[kind] = (used[kind] || 0) + 1;
    d.cover = `assets/photos/u-${kind}-${used[kind]}.jpg`;           // demo picture when the deal has no photo of its own
    const pstatus = d.status !== 'active' || (d.deal_kind === 'rent' && d.is_rented) ? 'מושכר' : ['פנוי', 'פעיל', 'בתהליך שיווק', 'פנוי', 'פעיל'][i % 5];
    const occ = pstatus === 'מושכר' ? 100 : pstatus === 'פנוי' ? 0 : [95, 75, 40, 88, 60][i % 5];
    if (i % 4 === 0) d.notes = ['גמיש במחיר לשוכר לטווח ארוך', 'אפשר לחלק לשתי יחידות', 'הבעלים מעדיף עסקה עד סוף השנה'][i % 3];
    if (d.deal_kind === 'sale' && i % 5 === 2) { d.is_rented = true; d.monthly_rent = Math.round(d.asking_price * 0.065 / 12 / 100) * 100;
      d.yield_pct = Math.round(d.monthly_rent * 12 / d.asking_price * 10000) / 100; }   // sold with a tenant (round 2: rent + yield for sale too)
    const oc = contactOf(d); if (oc.entity_type === 'company') oc.company_number = String(515000000 + i * 6007).slice(0, 9);
    d.custom = { f_pstatus: pstatus, f_occ: occ, f_email: `${['info', 'office', 'nadlan', 'invest'][i % 4]}@${['dahan', 'gross', 'shemesh', 'yifrach', 'karmi'][i % 5]}.co.il` };
    d.log = [];
    d.tasks = d.status !== 'active' ? [] : [
      { id: uid('e0000000'), kind: 'task', text: 'שיחת מעקב עם הבעלים', due: at2(-1 + (i % 3), 12), done: false },
      ...(i % 2 ? [{ id: uid('e0000000'), kind: 'meeting', text: 'ביקור בנכס עם מתעניין', due: at2(1 + (i % 4), 9, 30), done: false }] : []),
    ];
  });
  return { options, fields, contacts, lead, owner };
};
