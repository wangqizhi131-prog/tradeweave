const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const storageKey = 'tradeweave-buyer-v1';
const i18n = window.TradeWeaveI18n;
const factFields = [['material', 'Material', '材质'], ['production', 'Production', '制作方式'], ['madeIn', 'Made in', '产地'], ['dimensions', 'Dimensions', '尺寸'], ['capacity', 'Capacity', '容量'], ['care', 'Care', '保养'], ['dispatch', 'Dispatch', '发货时间'], ['shippingPrice', 'Shipping price', '运费'], ['arrivalDateGuarantee', 'Arrival guarantee', '送达日期承诺']];
let saved = {};
try { saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}') || {}; } catch {}
if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
const validOrder = order => order && typeof order.orderId === 'string' && typeof order.amount === 'string' && /^\d+\.\d{2}$/.test(order.amount) && order.currency === 'USD' && typeof order.status === 'string';
const validCheckout = order => order && typeof order.id === 'string' && typeof order.checkoutToken === 'string' && /^\d+\.\d{2}$/.test(order.amount) && order.currency === 'USD' && Number.isInteger(order.quantity) && order.quantity >= 1 && order.quantity <= 100;
const captureResponseStatuses = new Set(['COMPLETED', 'PENDING', 'DECLINED', 'DENIED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED']);
const terminalCheckoutStatuses = new Set(['COMPLETED', 'CANCELLED', 'FAILED', 'DECLINED', 'DENIED', 'PARTIALLY_REFUNDED', 'REFUNDED']);
// Carry forward approved v0.3 checkouts so moving the UI does not strand confirmation.
if (!saved.legacyMigrated && !saved.pendingCheckout) {
  try { const legacy = JSON.parse(sessionStorage.getItem('tradeweave-workspace-v2') || '{}'); if (validCheckout(legacy.pendingCheckout)) saved.pendingCheckout = legacy.pendingCheckout; } catch {}
}
const normalizeLanguage = value => ({ Chinese: 'zh-CN', English: 'en' })[value] || (i18n?.language(value)?.code || 'en');
const state = { legacyMigrated: true, language: normalizeLanguage(saved.language), replyLanguage: saved.replyLanguageTouched === true ? normalizeLanguage(saved.replyLanguage) : normalizeLanguage(saved.language), replyLanguageTouched: saved.replyLanguageTouched === true,
  histories: Object.fromEntries(Object.entries(saved.histories && typeof saved.histories === 'object' ? saved.histories : {}).filter(([id, messages]) => Array.isArray(messages)).slice(0, 100).map(([id, messages]) => [id, messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string').slice(-30)])),
  orders: Array.isArray(saved.orders) ? saved.orders.filter(validOrder).slice(0, 50) : [],
  answers: Number.isInteger(saved.answers) && saved.answers >= 0 ? saved.answers : 0,
  checkouts: Number.isInteger(saved.checkouts) && saved.checkouts >= 0 ? saved.checkouts : 0,
  cart: Array.isArray(saved.cart) ? saved.cart.filter(i => i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 5).slice(0,20) : [],
  requestKey: typeof saved.requestKey === 'string' ? saved.requestKey : null,
  openCheckout: validCheckout(saved.openCheckout) ? saved.openCheckout : null,
  pendingCheckout: validCheckout(saved.pendingCheckout) ? saved.pendingCheckout : null };
if (!saved.histories && Array.isArray(saved.history)) state.histories['coast-tote'] = saved.history.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string').slice(-30);
let buyerAccount = null, buyerAccountMode = 'signin';
let selectedVariant = null;
let addedToCart = false;
let galleryProductId = null, galleryImagePath = null;
let store = null, product = null, config = {}, quantity = 1, busy = false, aiBusy = false, loading = false;
let cartQuote = null, recoveringCreation = null, cartNotice = null, quoteApproved = false;
let activeCheckout = state.pendingCheckout || state.openCheckout, sdkPromise = null, paypalMounted = false, selectedOrder = null, toastTimer;
let fxRate = null;
let ordersStatus = null, ordersKnown = false;
busy = Boolean(state.pendingCheckout);
const t = (key, values, language = state.language) => i18n.get(language, key, values);
const currentLanguage = () => i18n.language(state.language);
const localize = (value, language = state.language) => value?.[i18n.language(language).product] || value?.en || value?.zh || Object.values(value || {}).find(text => typeof text === 'string' && text.trim()) || '';
const needsFallback = value => Boolean(value && Object.values(value).some(text => typeof text === 'string' && text.trim()) && !value[currentLanguage().product]?.trim());
function productNeedsFallback(item) {
  if (!item) return false;
  return [item.name, item.subtitle, item.description, ...item.tags, ...item.variants.map(variant => variant.name), ...Object.values(item.facts)].some(needsFallback);
}
function usd(value) {
  return window.TradeWeaveMoney.format(value, 'USD', currentLanguage().intl);
}
function appendPriceParts(target, value, currency, locale, extraOptions = {}) {
  window.TradeWeaveMoney.render(target, value, currency, locale, extraOptions, true);
}
function renderBuyerPrice(target, value, currency = 'USD') {
  target.replaceChildren();
  if (currency === 'USD' && state.language === 'zh-CN' && fxRate?.rate) {
    appendPriceParts(target, Number(value) * fxRate.rate, 'CNY', 'zh-CN', { maximumFractionDigits: 2 });
    target.append(document.createTextNode(' CNY ('));
    appendPriceParts(target, value, 'USD', currentLanguage().intl);
    target.append(document.createTextNode(')'));
    return;
  }
  appendPriceParts(target, value, currency, currentLanguage().intl);
}
function priceLabel(value, currency = 'USD') {
  return window.TradeWeaveMoney.format(value, currency, currentLanguage().intl);
}
function fxDisclosure() {
  if (state.language !== 'zh-CN') return '';
  return t('paypalUsd');
}
function updateFxNotes() {
  const note = $('#shop-fx-note');
  note.hidden = state.language !== 'zh-CN';
  note.textContent = state.language === 'zh-CN' ? fxDisclosure() : '';
  const globalFxNote = $('#shop-fx-global-note');
  globalFxNote.hidden = state.language !== 'zh-CN';
  globalFxNote.textContent = state.language !== 'zh-CN' ? '' : fxRate?.rate ? t('fxGlobal', { date: fxRate.date, rate: fxRate.rate.toFixed(4) }) : t('fxUnavailable');
  const contentNote = $('#shop-content-note');
  contentNote.hidden = !store?.products?.some(productNeedsFallback); contentNote.textContent = contentNote.hidden ? '' : t('contentFallback');
  const productContentNote = $('#shop-product-content-note');
  productContentNote.hidden = !productNeedsFallback(product); productContentNote.textContent = productContentNote.hidden ? '' : t('contentFallback');
}
function node(tag, className, text) { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; }
function buyerInitials(name) { return (name || 'Shopper').trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toUpperCase().slice(0, 2) || 'S'; }
function renderBuyerAccount() {
  const signedIn = Boolean(buyerAccount);
  $('#buyer-login-view').hidden = signedIn; $('#buyer-profile-view').hidden = !signedIn;
  $('#buyer-account-initials').hidden = !signedIn;
  $('#buyer-account-trigger').classList.toggle('signed-in', signedIn);
  $('#buyer-account-trigger').setAttribute('aria-label', t('accountTrigger'));
  $('#buyer-account-close').setAttribute('aria-label', t('accountClose'));
  if (signedIn) {
    const initials = buyerInitials(buyerAccount.name);
    $('#buyer-account-initials').textContent = initials;
    $('#buyer-account-title').textContent = t('accountProfileTitle');
    $('#buyer-account-subtitle').textContent = t('accountProfileSubtitle');
    $('#buyer-account-kicker').textContent = t('accountTrigger');
    $('#buyer-profile-avatar').textContent = initials;
    $('#buyer-profile-name').textContent = buyerAccount.name;
    $('#buyer-profile-email').textContent = buyerAccount.email || '—';
    $('#buyer-account-label').textContent = t('accountLabel');
    $('#buyer-profile-kind').textContent = t('accountKindBuyer');
    $('#buyer-account-orders').textContent = t('accountOrders');
    $('#buyer-switch-account').textContent = t('accountSwitch');
    $('#buyer-sign-out').textContent = t('accountSignOut');
  } else {
    $('#buyer-account-initials').textContent = '';
    setBuyerAccountMode(buyerAccountMode);
  }
}
function setBuyerAccountMode(mode) {
  buyerAccountMode = mode === 'create' ? 'create' : 'signin';
  const create = buyerAccountMode === 'create';
  $('#buyer-name-field').hidden = !create;
  $('#buyer-account-title').textContent = t(create ? 'accountTitleCreate' : 'accountTitleSignIn');
  $('#buyer-account-subtitle').textContent = t(create ? 'accountSubtitleCreate' : 'accountSubtitleSignIn');
  $('#buyer-account-kicker').textContent = t('accountTrigger');
  $('#buyer-account-dialog .account-tabs').setAttribute('aria-label', t('accountAccess'));
  $('#buyer-name-field').firstChild.textContent = t('accountName');
  $('#buyer-email-field').firstChild.textContent = t('accountIdentity');
  $('#buyer-password-field').firstChild.textContent = t('accountPassword');
  $('#buyer-account-name').placeholder = t('accountNamePlaceholder');
  $('#buyer-account-email').placeholder = t('accountIdentityPlaceholder');
  $('#buyer-account-password').placeholder = t('accountPasswordPlaceholder');
  $('#buyer-account-continue').textContent = t('accountContinue');
  $('#buyer-account-dialog [data-buyer-account-mode="signin"]').textContent = t('accountTabSignIn');
  $('#buyer-account-dialog [data-buyer-account-mode="create"]').textContent = t('accountTabCreate');
  $('#buyer-account-dialog [data-buyer-account-mode="signin"]').setAttribute('aria-pressed', String(!create));
  $('#buyer-account-dialog [data-buyer-account-mode="create"]').setAttribute('aria-pressed', String(create));
  $('#buyer-account-dialog .account-divider span').textContent = t('accountOr');
  $('#buyer-google-signin').lastChild.textContent = t('accountGoogle');
  $('#buyer-account-close').setAttribute('aria-label', t('accountClose'));
}
function completeBuyerAccount(viaGoogle = false) {
  const identity = $('#buyer-account-email').value.trim();
  const enteredName = $('#buyer-account-name').value.trim();
  const fallbackName = viaGoogle ? 'Google shopper' : identity.split('@')[0] || 'Shopper';
  buyerAccount = { name: (buyerAccountMode === 'create' ? enteredName : '') || fallbackName, email: viaGoogle ? '' : identity };
  $('#buyer-account-password').value = '';
  renderBuyerAccount();
}
function openBuyerAccount() { renderBuyerAccount(); $('#buyer-account-dialog').showModal(); }
function persist() { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); return true; } catch { return false; } }
function toast(text) { $('#shop-toast').textContent = text; $('#shop-toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#shop-toast').classList.remove('show'), 4500); }
function statusLabel(status) { const key = ({ CREATING: 'statusCreating', CREATED: 'statusCreated', APPROVED: 'statusApproved', CAPTURE_PENDING: 'statusCapturePending', COMPLETED: 'completed', PENDING: 'statusPending', DECLINED: 'statusDeclined', DENIED: 'statusDenied', CANCELLED: 'statusCancelled', FAILED: 'statusFailed', PARTIALLY_REFUNDED: 'statusPartiallyRefunded', REFUNDED: 'statusRefunded' })[status] || 'statusUnconfirmed'; return t(key); }
function renderOrdersStatus() {
  if (!ordersStatus) return;
  const { key, status, detail, detailKey } = ordersStatus;
  $('#shop-orders-status').textContent = t(key, status ? { status: statusLabel(status) } : undefined) + (detailKey ? ' ' + t(detailKey) : detail ? ' ' + detail : '');
}
function setOrdersStatus(key, options = {}) { ordersStatus = { key, ...options }; renderOrdersStatus(); }
function localizedOrderItem(item) {
  return item.name || t('product');
}
function translateStatic() {
  const text = (selector, key) => { const element = $(selector); if (element) element.textContent = t(key); };
  const attr = (selector, name, key) => { const element = $(selector); if (element) element.setAttribute(name, t(key)); };
  document.documentElement.lang = currentLanguage().intl;
  text('.skip-link', 'skip'); text('#shop-demo-label', 'sandbox'); text('#shop-preview>span', 'preview');
  const previewLink = $('#shop-preview>a'); if (previewLink) previewLink.lastChild.textContent = t('backWorkspace');
  attr('.shop-header nav', 'aria-label', 'nav');
  $$('[data-shop-page="catalog"]').forEach(el => { if (el.matches('nav a')) el.childNodes[0].textContent = t('shop'); });
  const cartLink = $('.shop-header [data-shop-page="cart"]'); if (cartLink) cartLink.childNodes[0].textContent = t('cart');
  const ordersLink = $('.shop-header [data-shop-page="orders"]'); if (ordersLink) ordersLink.childNodes[0].textContent = t('orders');
  const map = {
    '#shop-offline':'offline','#shop-loading':'loading','#shop-load-error h1':'loadError','#shop-retry':'retry',
    '#shop-catalog-title':'catalogTitle','#shop-catalog-filters-label':'catalogFilters','.shop-catalog-heading>p':'catalogIntro','#shop-cart-title':'cartTitle','#shop-orders-title':'ordersTitle',
    '#shop-product-missing h1':'unavailable','#shop-product-missing p':'removed','#shop-product-missing a':'browseShop',
    '.shop-back-link':'backProducts','#shop-no-image':'noImage','.shop-art>span':'illustration',
    '#shop-subtotal-label':'subtotal','#shop-product-note':'reviewCart','#shop-added-cart-link':'viewCart','#shop-added-continue-link':'continueShopping',
    '.shop-total-note':'itemOnly','#shop-ask-label':'askProduct','#shop-confirmation a':'viewOrder','#shop-facts-label':'facts','#shop-facts-note':'factsNote',
    '#shop-cart-view .shop-orders-heading p':'cartIntro','#shop-cart-view .shop-cart-summary>h2':'orderSummary','.cart-summary-line span':'subtotal',
    '#shop-cart-view .shop-total-note':'sandboxOnly','#shop-cart-view .shop-cart-summary>a':'continueShopping',
    '#shop-refresh-orders':'refreshOrders','#shop-orders-view .shop-orders-heading p':'ordersIntro','#shop-orders-view .shop-orders-note':'paymentSeparate',
    '#shop-open-policies':'shopPolicies','#shop-open-contact':'contactTitle','.shop-footer>span:nth-of-type(1)':'footerMade','.shop-footer>span:nth-of-type(2)':'fictional','.shop-footer>a':'backShop',
    '#shop-chat-title':'chatTitle','#shop-new-chat':'newChat','#shop-chat .shop-prompts button:nth-child(1)':'materials','#shop-chat .shop-prompts button:nth-child(2)':'care','#shop-chat .shop-prompts button:nth-child(3)':'delivery',
    '#shop-chat-input':'askPlaceholder','#shop-chat-handover':'askMaker','#shop-read-facts':'readFacts','#shop-receipt-title':'orderDetails',
    '#shop-receipt>p':'noMoney','#shop-download-receipt':'downloadReceipt','#shop-policies-title':'policyTitle','#shop-contact-title':'contactTitle',
    '#shop-contact .buyer-dialog-heading p':'contactIntro','#shop-contact-form label[for="shop-contact-order"]':'aboutOrder',
    '#shop-contact-form label[for="shop-contact-question"]':'question','#shop-contact-form .shop-share-context':'includeContext',
    '#shop-contact-send':'sendToMaker','#shop-contact .section-heading h3':'yourQuestions','#shop-refresh-questions':'refreshReplies'
  };
  for (const [selector, key] of Object.entries(map)) { const element = $(selector); if (!element || ['#shop-chat-input'].includes(selector)) continue; if (selector === '#shop-contact-form label[for="shop-contact-order"]') element.firstChild.textContent = t(key); else if (selector === '#shop-contact-form label[for="shop-contact-question"]') element.firstChild.textContent = t(key); else if (selector === '#shop-contact-form .shop-share-context') element.lastChild.textContent = t(key); else element.textContent = t(key); }
  ['questionMaterials', 'questionCare', 'questionDelivery'].forEach((key, index) => { const prompt = $$('.shop-prompts button')[index]; if (prompt) prompt.dataset.question = t(key); });
  const variantLabel = $('#shop-variant-label'); if (variantLabel.firstChild.nodeType === Node.TEXT_NODE) variantLabel.firstChild.textContent = t('chooseOption');
  const searchLabel = $('.shop-catalog-search'); if (searchLabel) searchLabel.firstChild.textContent = t('findProduct');
  const availability = $('#shop-catalog-availability')?.parentElement, sort = $('#shop-catalog-sort')?.parentElement;
  if (availability) $('#shop-availability-label').textContent = t('availability'); if (sort) $('#shop-sort-label').textContent = t('sortBy');
  $('#shop-price-legend').textContent = t('priceRange'); $('#shop-price-min-label').textContent = t('minPrice'); $('#shop-price-max-label').textContent = t('maxPrice');
  $('#shop-price-min').placeholder = t('minPriceShort'); $('#shop-price-max').placeholder = t('maxPriceShort');
  $('#shop-tag-label').textContent = t('productTag'); renderCatalogTagOptions();
  const search = $('#shop-catalog-search'); search.placeholder = t('searchPlaceholder'); search.setAttribute('aria-label', t('searchShop'));
  const options = { '#shop-catalog-availability':['allProducts','inStock'], '#shop-catalog-sort':['makerOrder','priceLow','priceHigh','productName'], '#shop-reply-language':['replyIn'] };
  for (const [selector, keys] of Object.entries(options)) { const select = $(selector); if (select) [...select.options].forEach((option, index) => { if (selector === '#shop-reply-language') return; option.textContent = t(keys[index]); }); }
  const replyLabel = $('#shop-reply-language').parentElement; if (replyLabel.firstChild.nodeType === Node.TEXT_NODE) replyLabel.firstChild.textContent = t('replyIn') + ' ';
  attr('#shop-chat-close','aria-label','closeAssistant'); attr('#shop-receipt-close','aria-label','closeDetails'); attr('#shop-policies-close','aria-label','closePolicies'); attr('#shop-contact-close','aria-label','closeQuestions');
  attr('#shop-chat-input','placeholder','askPlaceholder'); attr('#shop-chat-input','aria-label','question');
  attr('.shop-purchase-summary .qty-stepper','aria-label','quantity'); attr('#shop-minus','aria-label','decrease'); attr('#shop-plus','aria-label','increase');
  const send = $('#shop-chat-form button'); if (send) send.setAttribute('aria-label', t('sendQuestion'));
  const sr = $('#shop-chat-form .sr-only'); if (sr) sr.textContent = t('question');
  const contactSelect = $('#shop-contact-order'); if (contactSelect?.options.length) contactSelect.options[0].textContent = t('generalQuestion');
  const languageSelect = $('#shop-language'); languageSelect.setAttribute('aria-label', t('language'));
  if ($('.shop-catalog-heading>p')) $('.shop-catalog-heading>p').textContent = t('catalogIntro');
  updateFxNotes();
  renderBuyerAccount();
}
function setupLanguageSelect() {
  const select = $('#shop-language'); select.replaceChildren();
  i18n.languages.forEach(language => { const option = node('option', '', language.label); option.value = language.code; select.append(option); });
  select.value = state.language;
  select.disabled = busy || Boolean(activeCheckout);
  const reply = $('#shop-reply-language'); reply.replaceChildren();
  i18n.languages.forEach(language => { const option = node('option', '', language.label); option.value = language.code; reply.append(option); });
  reply.value = state.replyLanguage;
  select.addEventListener('change', () => {
    const previousLanguage = state.language, previousReply = state.replyLanguage;
    state.language = select.value; if (!state.replyLanguageTouched) state.replyLanguage = select.value;
    const saved = persist();
    if (paypalMounted || sdkPromise) {
      if (saved) { location.reload(); return; }
      state.language = previousLanguage; state.replyLanguage = previousReply; select.value = previousLanguage;
      toast(({ en: 'Language could not be changed because browser storage is unavailable. Your cart is still here.', 'zh-CN': '浏览器存储不可用，暂时无法切换语言；购物车仍保留。', ja: 'ブラウザーの保存領域を利用できないため、言語を変更できません。カートは保持されています。', es: 'No se puede cambiar el idioma porque el almacenamiento del navegador no está disponible. El carrito se conserva.', fr: 'Impossible de changer de langue : le stockage du navigateur est indisponible. Votre panier est conservé.' })[previousLanguage]);
      return;
    }
    applyLanguage();
  });
}
const catalogFilterPanel = $('#shop-catalog-filters');
const catalogFilterBreakpoint = matchMedia('(max-width:700px)');
function setCatalogFilterDefault() { catalogFilterPanel.open = !catalogFilterBreakpoint.matches; }
setCatalogFilterDefault();
catalogFilterBreakpoint.addEventListener('change', setCatalogFilterDefault);
function applyLanguage() {
  translateStatic();
  renderProduct(); renderOrders(); renderShopCatalog(); renderCart(); renderPending(); renderChat(); renderPolicyDialogIfOpen();
  aiStatus();
  $('#shop-checkout-note').textContent = checkoutInstruction();
  renderOrdersStatus();
  $('#shop-language').value = state.language; $('#shop-reply-language').value = state.replyLanguage;
  showPage();
}
function renderPolicyDialogIfOpen() { if ($('#shop-policies').open) { $('#shop-policies').close(); $('#shop-open-policies').click(); } }
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(35000), headers: { 'content-type': 'application/json', ...options.headers } }); }
  catch (error) { throw new Error(error.name === 'TimeoutError' ? t('timeout') : t('unavailableConnection')); }
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || t('errorRequest')); error.status = response.status; throw error; }
  return data;
}
function showPage(scroll = false) {
  const page = ['#orders', '#product', '#cart'].includes(location.hash) ? location.hash.slice(1) : 'catalog';
  if (page === 'product' && product && addedToCart && !state.cart.some(item => item.productId === product.id)) {
    addedToCart = false;
    renderProduct();
  }
  $('#shop-product-view').hidden = page !== 'product' || !product; $('#shop-orders-view').hidden = page !== 'orders'; $('#shop-cart-view').hidden = page !== 'cart'; if (page === 'cart') renderCart(); $('#shop-catalog-view').hidden = page !== 'catalog' || !store;
  $('#shop-product-missing').hidden = page !== 'product' || !store || Boolean(product);
  $$('[data-shop-page]').forEach(link => { if (link.dataset.shopPage === page || page === 'product' && link.dataset.shopPage === 'catalog') link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  document.title = (page === 'orders' ? t('pageOrders') : page === 'cart' ? t('pageCart') : page === 'product' && product ? localize(product.name) : t('pageShop')) + ' · ' + (store?.shop.name || 'TradeWeave');
  if (scroll) { window.scrollTo({ top: 0, behavior: 'instant' }); $('#shop-main').focus({ preventScroll: true }); }
}
document.addEventListener('click', event => {
  const item = event.target.closest('[data-item]');
  if (item && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); if (busy && !state.pendingCheckout) { toast(t('finishCheckout')); return; } history.pushState(null, '', item.href); syncProduct(); showPage(true); return; }
  const link = event.target.closest('[data-shop-page]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); const hash = '#' + link.dataset.shopPage;
  if (location.hash !== hash) history.pushState(null, '', hash);
  showPage(true);
});
$('#buyer-account-trigger').addEventListener('click', openBuyerAccount);
$('#buyer-account-close').addEventListener('click', () => $('#buyer-account-dialog').close());
$$('[data-buyer-account-mode]').forEach(button => button.addEventListener('click', () => setBuyerAccountMode(button.dataset.buyerAccountMode)));
$('#buyer-account-form').addEventListener('submit', event => { event.preventDefault(); completeBuyerAccount(false); });
$('#buyer-google-signin').addEventListener('click', () => completeBuyerAccount(true));
function clearBuyerAccountFields() { $('#buyer-account-name').value = ''; $('#buyer-account-email').value = ''; $('#buyer-account-password').value = ''; }
function switchBuyerAccount() { buyerAccount = null; clearBuyerAccountFields(); renderBuyerAccount(); $('#buyer-account-email').focus(); }
$('#buyer-switch-account').addEventListener('click', switchBuyerAccount);
$('#buyer-sign-out').addEventListener('click', switchBuyerAccount);
$('#buyer-account-orders').addEventListener('click', () => { $('#buyer-account-dialog').close(); if (location.hash !== '#orders') history.pushState(null, '', '#orders'); showPage(true); refreshOrders(); });
addEventListener('hashchange', () => { syncProduct(); showPage(); }); addEventListener('popstate', () => { syncProduct(); showPage(); });
function renderProduct() {
  if (!product) return;
  const chinese = state.language === 'zh-CN';
  $('.shop-product-copy').lang = currentLanguage().intl;
  $('#shop-name').textContent = store.shop.name; $('#shop-monogram').textContent = store.shop.name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  $('#shop-product-name').textContent = localize(product.name); $('#shop-subtitle').textContent = localize(product.subtitle); $('#shop-description').textContent = localize(product.description);
  const amount = selectedVariant?.price || product.price;
  renderBuyerPrice($('#shop-price'), amount, product.currency); $('#shop-currency').textContent = '';
  updateFxNotes();
  const location = chinese && store.shop.location === 'Nanjing, China' ? '中国南京' : store.shop.location;
  $('#shop-origin').textContent = location;
  const stock = selectedVariant ? selectedVariant.stock : product.stock;
  $('#shop-stock').textContent = stock ? `${selectedVariant ? t('optionStock') + ' ' : ''}${stock} ${t('itemsAvailable')}` : t('soldOut');
  $('#shop-tags').replaceChildren(...product.tags.map(tag => node('span', '', localize(tag))));
  $('#shop-facts-label').textContent = t('facts'); $('#shop-facts-note').textContent = t('factsNote');
  $('#shop-facts').replaceChildren();
  factFields.forEach(([key, en, zh]) => {
    const value = localize(product.facts[key]);
    $('#shop-facts').append(node('dt', '', t('fact_' + key)), node('dd', value ? 'shop-fact-supplied' : 'shop-fact-missing', value || t('notProvided')));
  });
  $('#shop-chat-product').textContent = localize(product.name); $('#shop-ask-label').textContent = t('askProduct');
  renderGallery(); renderVariants();
  $('#shop-subtotal-label').textContent = t('subtotal');
  $('#shop-product-note').textContent = t(addedToCart ? 'toastAdded' : 'reviewCart');
  $('#shop-add-confirmation').hidden = !addedToCart;
  updateQuantity(quantity); showPage();
}
function updateQuantity(next) {
  const limit = product ? Math.min(5, selectedVariant ? selectedVariant.stock : product.stock) : 0;
  const sameCheckout = activeCheckout && (!activeCheckout.productId ? product?.id === 'coast-tote' : product?.id === activeCheckout.productId);
  quantity = busy && sameCheckout ? activeCheckout.quantity : limit ? Math.min(limit, Math.max(1, next)) : 0;
  $('#shop-quantity').textContent = quantity; $('#shop-minus').disabled = busy || quantity <= 1; $('#shop-plus').disabled = busy || quantity >= limit;
  if (sameCheckout && busy) renderBuyerPrice($('#shop-total'), activeCheckout.amount, activeCheckout.currency);
  else if (product) renderBuyerPrice($('#shop-total'), Math.round(Number(selectedVariant?.price || product.price) * 100) * quantity / 100, product.currency);
  else $('#shop-total').textContent = '—';
  $('#shop-variant').disabled = busy;
  $('#shop-add-cart').disabled = busy || !quantity || Boolean(activeCheckout);
  $('#shop-add-cart').textContent = quantity ? t('addCart') : t('soldOut');
  updateCartControls();
}
$('#shop-minus').addEventListener('click', () => updateQuantity(quantity - 1)); $('#shop-plus').addEventListener('click', () => updateQuantity(quantity + 1));
function onlineState() { $('#shop-offline').hidden = navigator.onLine; }
addEventListener('online', onlineState); addEventListener('offline', onlineState); onlineState();

function renderChat() {
  const root = $('#shop-conversation'); root.replaceChildren();
  $('#shop-chat').classList.toggle('has-conversation', chatHistory().some(message => message.role === 'user'));
  if (!chatHistory().length) root.append(node('p', 'shop-chat-welcome', t('chatWelcome')));
  chatHistory().forEach(message => {
    const item = node('div', 'shop-message ' + (message.isError ? 'notice' : message.role));
    item.append(node('span', '', message.role === 'user' ? t('you') : message.isError ? t('connectionNotice') : t('assistant')), node('p', '', message.text));
    if (message.role === 'assistant' && Array.isArray(message.evidence) && message.evidence.length) {
      const evidenceLanguage = message.evidenceLanguage || state.language, evidenceT = (key, values) => t(key, values, evidenceLanguage);
      const evidence = node('section', 'shop-answer-evidence'), title = node('h3', '', evidenceT('evidenceTitle')), list = node('dl', 'shop-answer-evidence-list');
      evidence.append(title);
      message.evidence.forEach(field => {
        const unknown = !field.value;
        const valueClass = unknown ? 'evidence-unknown' : field.none ? 'evidence-none' : 'evidence-supplied';
        const labelKey = field.labelKey || (['price', 'stock', 'options'].includes(field.key) ? 'evidence_' + field.key : 'fact_' + field.key);
        const value = node('span', 'evidence-value', field.value || evidenceT('notProvided'));
        const detail = node('dd', valueClass); detail.append(value);
        if (!unknown && field.source) detail.append(node('span', 'evidence-source evidence-source-' + field.source, evidenceT(field.source === 'listing' ? 'evidenceSourceListing' : 'evidenceSourceSeller')));
        list.append(node('dt', '', evidenceT(labelKey)), detail);
      });
      evidence.append(list, node('p', 'shop-evidence-note', evidenceT('evidenceNote')));
      item.append(evidence);
    }
    if (message.retryQuestion) { const retry = node('button', 'quiet-button shop-retry-question', t('retry')); retry.type = 'button'; retry.dataset.retryIndex = chatHistory().indexOf(message); item.append(retry); }
    root.append(item);
  });
  const latest = root.lastElementChild;
  if (latest?.classList.contains('assistant') && latest.offsetHeight > root.clientHeight) {
    const offset = latest.getBoundingClientRect().top - root.getBoundingClientRect().top - root.clientTop;
    root.scrollTop = Math.max(0, root.scrollTop + offset);
  } else root.scrollTop = root.scrollHeight;
  $('#shop-new-chat').disabled = aiBusy || !chatHistory().length;
}
function aiStatus(text) {
  $('#shop-ai-status').textContent = text || t('aiSellerFacts');
  $$('#shop-chat-form input, #shop-chat-form button, .shop-prompts button').forEach(control => control.disabled = aiBusy || !product);
  $('#shop-reply-language').disabled = aiBusy; $('#shop-chat-form').setAttribute('aria-busy', String(aiBusy));
}
function checkoutInstruction() {
  if (!config.paypalReady) return t('checkoutUnavailable');
  if (paypalMounted && quoteApproved) return t(state.openCheckout ? 'checkoutResumeReady' : 'checkoutStepTwo');
  return t(state.openCheckout ? 'checkoutResumeLoad' : 'checkoutStepOne');
}
function chatHistory(id = product?.id) { return state.histories[id] || []; }
function addMessage(role, text, isError = false, id = product?.id, metadata = {}) { state.histories[id] = [...chatHistory(id), { role, text, isError, ...metadata }].slice(-30); persist(); if (product?.id === id) renderChat(); }
function answerEvidence(question, item = product, variant = selectedVariant, answerLanguage = state.replyLanguage) {
  if (!item) return [];
  const evidenceLanguage = answerLanguage || state.replyLanguage || state.language || state.locale || 'en';
  const evidenceLocalize = value => localize(value, evidenceLanguage), evidenceT = (key, values) => t(key, values, evidenceLanguage);
  const q = question.toLocaleLowerCase();
  const keys = new Set();
  const shippingPriceQuestion = /shipping\s+(?:price|costs?|fees?|charges?|rates?)\b|delivery\s+(?:price|costs?|fees?|charges?|rates?)\b|how much\s+(?:(?:is|does)\s+(?:the\s+)?(?:shipping|delivery)|to\s+ship)\b|how much\s+(?:will|would)\s+(?:the\s+)?(?:shipping|delivery)\s+be\b|what\s+(?:is|are)\s+(?:the\s+)?shipping\b|cost\s+to\s+ship\b|(?:free|included)\s+(?:shipping|delivery)\b|(?:is|are)\s+(?:the\s+)?(?:shipping|delivery)\s+(?:free|included)\b|(?:shipping|delivery)\s+(?:is\s+)?(?:extra|additional)\b|pay\s+extra\s+for\s+(?:shipping|delivery)\b|(?:pay|paying).{0,20}(?:for\s+)?(?:the\s+)?(?:shipping|delivery)\b|(?:extra|additional)\s+(?:(?:shipping|delivery)\s+(?:fee|charge|cost)|(?:fee|charge|cost)\s+(?:for\s+)?(?:shipping|delivery))\b|shipping\s+(?:is\s+)?free\b|ship(?:s|ped)?\s+(?:for\s+)?free\b|shipping\s+for\s+free\b|postage|送料無料|送料込み|送料|包邮|包郵|免运费|免郵費|运费|運費|邮费|郵費|配送費|frais de livraison|frais de port|co[uû]t\s+(?:de\s+)?(?:livraison|exp[eé]dition)|combien\s+(?:co[uû]te|co[uû]tent)\s+(?:(?:la\s+)|l[’']\s*)?(?:livraison|exp[eé]dition)|(?:livraison|exp[eé]dition)\s+(?:est(?:[- ]elle)?\s+)?(?:gratuite|offerte|incluse|payante)|livraison.{0,20}payante|suppl[eé]ment.{0,30}(?:livraison|exp[eé]dition)|(?:livraison|exp[eé]dition).{0,30}suppl[eé]ment|(?:coste|precio) del env[ií]o|cu[aá]nto cuesta el env[ií]o|env[ií]o\s+(?:es\s+)?(?:gratis|gratuito)|env[ií]o.{0,30}(?:costo|coste|cargo|adicional|extra)|(?:costo|coste|cargo).{0,30}env[ií]o|(?:env[ií]o|entrega).{0,25}(?:adicional|extra)|pagar.{0,25}(?:env[ií]o|entrega)|(?:env[ií]o|entrega).{0,25}pagar/i;
  const expandedShippingPriceQuestion = /how much\s+to\s+send\b|cost\s+to\s+send\b|cu[aá]nto\s+cuesta\s+enviar\b/i;
  const shippingPricePattern = new RegExp(`${shippingPriceQuestion.source}|${expandedShippingPriceQuestion.source}`, 'i');
  const explicitArrivalQuestion = /\b(?:when|arrival|arrive|guarantee|guaranteed|date|estimate|by\s+(?:friday|monday|\w+day))\b|\bhere\b.{0,20}\b(?:by\s+)?(?:friday|monday|\w+day)\b|\bhow long\b.{0,30}\b(?:receive|get|reach)\b|\bwhat day\b.{0,25}\b(?:receive|get|reach|arrive)\b|\bwhen\b.{0,30}\b(?:receive|get|reach|expect)\b|什么时候到|何时到|到货|到貨|送达|送達|送到|到达|到達|(?:周|星期|礼拜)[一二三四五六日天]|保証|到着|届|lleg|entreg|garant|arriv/i;
  const explicitDispatchTimingQuestion = /dispatch(?:\s+(?:time|timing|schedule))?|\bwhen\b.{0,50}\b(?:ship(?:ped|s)?|send out|dispatch)\b|\bhow long\b.{0,45}\b(?:before|until)\b.{0,25}\b(?:sent|shipped|dispatched|ship(?:s|ped)?)\b|\bhow long\b.{0,35}\b(?:shipping|delivery)\s+(?:take|takes|last|lasts)\b|\bhow soon\b.{0,40}\b(?:ship|send|dispatch)\b|\bprocessing\b.{0,25}\b(?:time|take|takes|days?)\b|shipping\s+(?:time|timeline|takes|in|within)\b|delivery\s+(?:time|timeline|takes|in|within)\b|发货时间|發貨時間|配送时间|配送時期|発送時期|配送時間|発送(?:まで|日数)|配送まで|d[eé]lai\s+(?:de\s+livraison|d[’']exp[eé]dition)|combien\s+de\s+temps.{0,45}(?:exp[eé]di|livr)|tard(?:a|an|ar).{0,40}(?:env[ií]|exped)|cu[aá]ndo.{0,45}(?:se\s+)?env[ií]a|quand.{0,45}(?:exp[eé]di|envoy)/i;
  const explicitCapacityQuestion = /\b(?:capacit(?:y|ies)|volume|millilit(?:er|re)s?)\b|\b\d+\s*ml\b|容量|容積|内容量|何ミリリットル|capacidad|contenance|capacit[eé]|volume/i;
  const ambiguousSizeQuestion = /\bsize\b|尺寸|大小|多大|寸法|サイズ|tama[nñ]o|taille/i;
  const explicitItemPriceQuestion = /\b(?:product|item|listed)\s+(?:price|cost)\b|\b(?:product|item)\b.{0,24}\b(?:price|cost)\b|\b(?:price|cost)\s+(?:of|for)\s+(?:the\s+)?(?:product|item)\b|\b(?:price|cost)\s+(?:of|for)\s+(?:(?:the|this)\s+)?(?:tote|bag)\b.{0,32}\b(?:and|plus)\b|\bhow much\s+(?:does|is)\s+(?:(?:the|this)\s+)?(?:product|item|tote|bag)\b|商品价格|商品價格|商品の価格|precio del producto|prix du produit/i;
  const optionsQuestion = /option|variant|specification|specs|\b(?:what|which)\s+(?:sizes?|colou?rs?)\b|\b(?:sizes?|colou?rs?)\s+(?:can\s+i\s+choose|are\s+available|do\s+you\s+offer)\b|\bavailable\s+in\b|规格|規格|选项|選項|尺寸|大小|颜色|顏色|オプション|仕様|サイズ|色|opci[oó]n|variante|talla|color|tama[nñ]os?.{0,25}(?:disponibles?|hay|puedo\s+elegir)|colores?.{0,25}(?:disponibles?|hay|puedo\s+elegir)|qu[eé]\s+(?:tallas?|colores?)\s+(?:hay|tienen|ofrecen|est[aá]n\s+disponibles?)|tailles?.{0,25}(?:(?:sont|sont-elles)\s+)?(?:disponibles?|propos[eé]es)|couleurs?.{0,25}(?:(?:sont|sont-elles)\s+)?(?:disponibles?|propos[eé]es)|quelles?\s+(?:tailles?|couleurs?|options?).{0,30}(?:disponibles?|propos[eé]es)/i;
  const explicitStockQuestion = /\bstock\b|inventory|in stock|sold\s+out|\bany\s+left\b|\bhow\s+many\b.{0,30}\b(left|available|in stock)\b|\bdo\s+you\s+have\s+any\s+left\b|\bavailable\s+in\s+[^?!.]+|库存|庫存|在庫|existencias|inventario|agotad|queda|quantit[eé]s? en stock|rupture de stock|[eé]puis[eé]/i;
  const mentionedVariant = (item.variants || []).find(option => Object.values(option.name || {}).some(name => {
    const normalized = String(name || '').trim().toLocaleLowerCase();
    return normalized.length > 1 && q.includes(normalized);
  }));
  const variantInquiry = mentionedVariant && /\b(?:in|option|variant|size|colour|color|available|availability|stock|sold out|left|price|cost|how much|choose|get|have|offer|come in)\b|规格|規格|尺寸|大小|颜色|顏色|选|選|价格|價格|多少钱|多少錢|有货|有貨|库存|庫存|サイズ|色|在庫|価格|いくら|talla|color|opci[oó]n|variante|precio|disponible|stock|elegir|puedo|talle|taille|couleur|option|prix/i.test(q);
  const evidenceVariant = mentionedVariant || (!optionsQuestion.test(q) ? variant : null);
  const materialOnlyQuestion = /material|fabric|cotton|材质|材料|材質|素材|面料|algod[oó]n|coton|mati[eè]re|\bmade of\b|\bmade from\b/i.test(q)
    && !/production|handwoven|制作|作り|fabrication/i.test(q);
  const groups = [
    [/material|fabric|cotton|\bmade(?: of)?\b|production|handwoven|材质|材料|材質|素材|面料|制作|作り|素材|algod[oó]n|coton|mati[eè]re|fabrication|tejido|tissé/i, ['material', 'production', 'madeIn']],
    [/care|clean|wash|stain|洗|清洁|清潔|护理|保养|お手入れ|手入れ|洗濯|cuidado|cuida|limpi|lav|entretenir|entretien|nettoy/i, ['care']],
    [/dimension|measure|size|length|width|height|尺寸|大小|多大|寸法|サイズ|tama[nñ]o|dimensi[oó]n|mesure|taille/i, ['dimensions']],
    [explicitCapacityQuestion, ['capacity']],
    [/dispatch|ship(?:ped|s)?\b|\bsent\b|\bhow long\b.{0,45}\b(?:before|until)\b.{0,25}\b(?:sent|shipped|dispatched|ship(?:s|ped)?)\b|\bhow long\b.{0,35}\b(?:shipping|delivery)\s+(?:take|takes|last|lasts)\b|\bhow soon\b.{0,40}\b(?:ship|send|dispatch)\b|\bprocessing\b.{0,25}\b(?:time|take|takes|days?)\b|shipping\s+(?:time|timeline|takes|in|within)\b|delivery\s+(?:time|timeline|takes|in|within)\b|send out|発|発送(?:時期|まで|日数)|配送(?:時間|予定|时|時期|まで)|发货|發貨|运送时间|運送時間|tiempo de env[ií]o|expedici[oó]n|tard(?:a|an|ar).{0,40}(?:env[ií]|exped)|d[eé]lai\s+(?:de\s+livraison|d[’']exp[eé]dition)|combien\s+de\s+temps.{0,45}(?:exp[eé]di|livr)|cu[aá]ndo.{0,45}(?:se\s+)?env[ií]a|quand.{0,45}(?:exp[eé]di|envoy)/i, ['dispatch']],
    [shippingPricePattern, ['shippingPrice']],
    [/arriv|deliver(?:ed|s)?|delivery\s+(?:date|estimate|guarantee)|guarantee|by (?:friday|monday|\w+day)|\bhere\b.{0,20}\b(?:by\s+)?(?:friday|monday|\w+day)\b|\bhow long\b.{0,30}\b(?:receive|get|reach)\b|\bwhat day\b.{0,25}\b(?:receive|get|reach|arrive)\b|\bwhen\b.{0,30}\b(?:receive|get|reach|expect)\b|到货|到貨|送达|送達|送到|到达|到達|(?:周|星期|礼拜)[一二三四五六日天]|什么时候到|何时到|保証|到着|届|lleg(?:ada|a|an|ará|aran)|entreg|garant(?:[ií]a|iz)|arriv[eé]e|garantie/i, ['arrivalDateGuarantee']],
    [/price|cost|how much|total|usd|价格|價格|多少钱|多少錢|金額|価格|いくら|precio|prix|cu[aá]nto|combien/i, ['price']],
    [/stock|available|availability|in stock|sold\s+out|\bany\s+left\b|\bhow\s+many\b.{0,30}\b(left|available|in stock)\b|库存|庫存|有货|有貨|在庫|stock|disponible/i, ['stock']],
    [optionsQuestion, ['options']]
  ];
  for (const [pattern, fields] of groups) if (pattern.test(q)) fields.forEach(key => {
    if (materialOnlyQuestion && ['production', 'madeIn'].includes(key)) return;
    if (key === 'price' && !explicitItemPriceQuestion.test(q) && (shippingPricePattern.test(q) || explicitDispatchTimingQuestion.test(q) || explicitArrivalQuestion.test(q))) return;
    if (key === 'dispatch' && shippingPricePattern.test(q) && !explicitDispatchTimingQuestion.test(q)) return;
    if (key === 'arrivalDateGuarantee' && shippingPricePattern.test(q) && !explicitArrivalQuestion.test(q)) return;
    if (key === 'stock' && optionsQuestion.test(q) && !explicitStockQuestion.test(q) && !(mentionedVariant && /\bavailable\b|\bin stock\b|\bsold out\b|在庫|有货|有貨/i.test(q))) return;
    keys.add(key);
  });
  if (ambiguousSizeQuestion.test(q) && localize(item.facts?.capacity)) keys.add('capacity');
  if (variantInquiry) keys.add('options');
  const evidence = [...keys].map(key => {
    if (key === 'price') return { key: 'price', source: 'listing', value: evidenceVariant ? `${evidenceLocalize(evidenceVariant.name)}: ${evidenceVariant.price} ${item.currency || 'USD'}` : item.variants?.length ? item.variants.map(option => `${evidenceLocalize(option.name)}: ${option.price} ${item.currency || 'USD'}`).join('; ') : `${item.price} ${item.currency || 'USD'}` };
    if (key === 'stock') return { key: 'stock', source: 'listing', value: evidenceVariant ? `${evidenceLocalize(evidenceVariant.name)}: ${evidenceVariant.stock}` : item.variants?.length ? item.variants.map(option => `${evidenceLocalize(option.name)}: ${option.stock}`).join('; ') : String(item.stock) };
    if (key === 'options') return item.variants?.length ? { key: 'options', source: 'listing', value: item.variants.map(option => `${evidenceLocalize(option.name)}${Number(option.stock) > 0 ? '' : ' · ' + evidenceT('soldOut')}`).join(', ') } : { key: 'options', source: 'listing', value: evidenceT('noOptionsListed'), none: true };
    return { key, source: 'seller', value: evidenceLocalize(item.facts?.[key]) || '' };
  });
  const careText = Object.values(item.facts?.care || {}).filter(value => typeof value === 'string').join(' ');
  const careUnknowns = [
    { key: 'machineWash', question: /machine.?wash|washing machine|\bwash(?:ed|ing)?\b.{0,18}\b(?:in|inside)\s+(?:the\s+)?(?:washing\s+)?machine\b|\bmachine\b.{0,18}\bwash(?:able|ed|ing)?\b|机洗|洗衣机|洗濯機|lavadora|lavar(?:se)?\b.{0,24}\ba\s+m[aá]quina\b|lavar(?:se)?\b.{0,24}\ben\s+(?:la\s+)?lavadora\b|lavado\s+a\s+m[aá]quina|machine à laver|\b(?:laver|lavé|lavable|lavage)\b.{0,15}\ben machine\b/i, fact: /machine.?wash|washing machine|\bwash(?:ed|ing)?\b.{0,18}\b(?:in|inside)\s+(?:the\s+)?(?:washing\s+)?machine\b|\bmachine\b.{0,18}\bwash(?:able|ed|ing)?\b|hand.?wash|hand washing|机洗|洗衣机|洗濯機|手洗|lavadora|lavar(?:se)?\b.{0,24}\ba\s+m[aá]quina\b|lavar(?:se)?\b.{0,24}\ben\s+(?:la\s+)?lavadora\b|lavado\s+a\s+m[aá]quina|machine à laver|\b(?:laver|lavé|lavable|lavage)\b.{0,15}\ben machine\b|lavage\s+(?:à|a)\s+la\s+main|laver\s+(?:à|a)\s+la\s+main|lavar\s+a\s+mano|lavado\s+a\s+mano/i },
    { key: 'dryerSafety', question: /dryer|tumble.?dry|烘干|烘乾|烘干机|烘乾機|乾燥機|secadora|sèche-linge/i, fact: /dryer|tumble.?dry|烘干|烘乾|烘干机|烘乾機|乾燥機|secadora|sèche-linge/i }
  ];
  for (const detail of careUnknowns) {
    if (detail.question.test(q) && !detail.fact.test(careText)) evidence.push({ key: detail.key, labelKey: 'evidence_' + detail.key, value: '' });
  }
  const policyGroups = [
    [/\b(?:shipping|delivery)\s+polic(?:y|ies)\b|\bwhere\s+(?:do|can)\s+you\s+ship\b|\bcan\s+you\s+(?:ship|deliver)\s+to\b|\bdo\s+you\s+(?:ship|deliver)\s+to\b|\b(?:international|worldwide)\s+shipping\b|\bshipping\s+methods?\b|(?:能|可以|支持)?(?:寄|寄送|发|發|发货|發貨|配送|送货|送貨)(?:到|至)(?:哪里|哪裡|哪儿|哪兒|什么地方|哪些地方)|(?:支持|可以|能否|能)\s*(?:寄|寄送|发货|發貨|配送|送货|送貨).{0,8}(?:到|至)|(?:发货|發貨|寄送|配送)(?:范围|範圍|地区|地區)|配送政策|配送方針|配送规则|運送方針|env[ií]an?\s+a\b|a\s+qu[eé]\s+(?:lugares?|pa[ií]ses?).{0,20}env[ií]an|env[ií]os?\s+internacionales?|pol[ií]tica\s+de\s+env[ií]o|exp[eé]diez-vous\s+(?:au|en|à|dans)\b|politique\s+de\s+livraison|livrez-vous|配送先|どこに配送|どこへ発送|(?:日本へ|海外へ)?発送できますか/i, 'shipping', 'shipping'],
    [/\breturns?\b|\brefunds?\b|\bexchanges?\b|返品|返金|退货|退貨|退款|退換|devoluci[oó]n|devolv\w*|reembolso|cambio|retour|remboursement|[eé]change/i, 'returns', 'returns'],
    [/\bprivacy\b|\bpersonal\s+(?:data|information)\b|\buse\s+my\s+(?:data|information)\b|隐私|隱私|个人信息|個人情報|プライバシー|privacidad|datos personales|confidentialit[eé]|donn[eé]es personnelles/i, 'privacy', 'privacy'],
    [/\bcontact\b|\bhow\s+can\s+i\s+reach\b|\breach\s+the\s+(?:seller|maker)\b|\bcontact\w*|\bjoindre\b|\bjoign(?:ez|ent|ant)\b|\bcontact\s+(?:details|information)\b|\be-?mail\b|联系|聯繫|聯絡|連絡|联系店主|連絡先|contacto|conta[cé]ctar|coordonn[eé]es/i, 'contact', 'contactInfo']
  ];
  for (const [pattern, key, labelKey] of policyGroups) if (pattern.test(q)) evidence.push({ key, labelKey, source: 'seller', value: evidenceLocalize(store?.shop?.policies?.[key]) || '' });
  return evidence;
}
async function ask(question) {
  if (aiBusy || !product || !question.trim()) return;
  const history = chatHistory().filter(m => !m.isError).slice(-10).map(m => ({ role: m.role, content: m.text.slice(0, 1800) }));
  const contextId = product.id, contextProduct = product, contextVariant = selectedVariant, optionId = selectedVariant?.id, answerLanguage = state.replyLanguage;
  const evidence = answerEvidence(question, contextProduct, contextVariant, answerLanguage);
  addMessage('user', question); aiBusy = true; aiStatus(t('readingFacts')); renderChat();
  try { const result = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ productId: contextId, variantId: optionId, question, language: answerLanguage, history }) }); addMessage('assistant', result.answer, false, contextId, { evidence, evidenceLanguage: answerLanguage }); state.answers++; persist(); }
  catch { addMessage('assistant', t('questionErrorSaved', { error: t('aiTemporaryError') }), true, contextId, { retryQuestion: question }); }
  finally { aiBusy = false; aiStatus(); renderChat(); if ($('#shop-chat').open) $('#shop-chat-input').focus(); }
}
$('#shop-ask').addEventListener('click', () => { renderChat(); aiStatus(); $('#shop-chat').showModal(); });
$('#shop-chat-close').addEventListener('click', () => $('#shop-chat').close());
$('#shop-conversation').addEventListener('click', event => {
  const button = event.target.closest('[data-retry-index]'); if (!button || aiBusy || !product) return;
  const failedAt = Number(button.dataset.retryIndex), history = chatHistory().slice(), failure = history[failedAt];
  if (!failure?.isError || !failure.retryQuestion) return;
  history.splice(failedAt, 1);
  for (let index = failedAt - 1; index >= 0; index--) if (history[index].role === 'user' && history[index].text === failure.retryQuestion) { history.splice(index, 1); break; }
  state.histories[product.id] = history; persist(); renderChat(); ask(failure.retryQuestion);
});
$('#shop-chat-form').addEventListener('submit', event => { event.preventDefault(); const question = $('#shop-chat-input').value.trim(); if (!question || aiBusy) return; $('#shop-chat-input').value = ''; ask(question); });
$$('[data-question]').forEach(button => button.addEventListener('click', () => ask(button.dataset.question)));
$('#shop-reply-language').addEventListener('change', event => { state.replyLanguage = event.target.value; state.replyLanguageTouched = true; persist(); });
$('#shop-new-chat').addEventListener('click', () => { if (aiBusy) return; if (product) state.histories[product.id] = []; persist(); renderChat(); });
$('#shop-read-facts').addEventListener('click', () => { $('#shop-chat').close(); if (location.hash !== '#product') { history.pushState(null, '', '#product'); showPage(); } $('#shop-facts-details').open = true; $('#shop-facts-details').scrollIntoView({ block: 'center', behavior: 'instant' }); $('#shop-facts-details summary').focus(); });

function renderOrders() {
  const root = $('#shop-orders'); root.replaceChildren();
  $('#shop-order-count').hidden = !state.orders.length; $('#shop-order-count').textContent = state.orders.length;
  if (!state.orders.length) {
    if (!ordersKnown) return;
    const empty = node('div', 'shop-order-empty'), link = node('a', 'primary-button', t('browseShop')); link.href = '#catalog'; link.dataset.shopPage = 'catalog';
    empty.append(node('h2', '', t('ordersEmptyTitle')), node('p', '', t('ordersEmpty')), link); root.append(empty); return;
  }
  state.orders.forEach(order => {
    const row = node('article', 'shop-order-row'), info = node('div');
    const firstItemName = order.items?.[0] ? localizedOrderItem(order.items[0]) : order.productName || t('product');
    info.append(node('strong', '', order.items?.length > 1 ? t('productsItems', { products: order.items.length, items: order.quantity }) : t('productQuantity', { quantity: order.quantity || 1, product: firstItemName })), node('small', '', t(order.paypalOrderId ? 'paypalRef' : 'shopRef', { id: order.orderId })), node('span', order.status === 'COMPLETED' ? 'fact-state supplied' : 'fact-state missing', statusLabel(order.status)));
    if (order.status === 'COMPLETED') info.append(node('small', '', t('fulfillment') + ' · ' + t(order.fulfillment === 'FULFILLED' ? 'fulfilled' : 'unfulfilled')));
    const button = node('button', 'quiet-button', t('viewDetails')); button.type = 'button'; button.addEventListener('click', () => receipt(order));
    const actions = node('div', 'shop-order-actions'); actions.append(button);
    if (order.checkoutToken && ['CREATING', 'CREATED', 'APPROVED', 'CAPTURE_PENDING', 'PENDING'].includes(order.status)) {
      const action = node('button', 'text-button', t(['CREATING', 'CREATED'].includes(order.status) ? 'resumeCheckout' : 'refreshPayment')); action.type = 'button';
      action.addEventListener('click', async () => {
        if (['CREATING', 'CREATED'].includes(order.status)) { resumeOrder(order); return; }
        action.disabled = true;
        try {
          if (activeCheckout && activeCheckout.id !== order.paypalOrderId) throw new Error(t('resolveCheckout'));
          const result = await api('/api/paypal/reconcile', { method: 'POST', body: JSON.stringify({ orderId: order.paypalOrderId, checkoutToken: order.checkoutToken }) });
          if (result.status === 'APPROVED' || result.status === 'CAPTURE_PENDING') { activeCheckout = { ...result, id: order.paypalOrderId }; state.cart = result.items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })); state.pendingCheckout = activeCheckout; state.openCheckout = null; persist(); lockCheckout(true); renderPending(); renderCart(); }
          await refreshOrders();
        }
        catch (error) { toast(error.message); } finally { action.disabled = false; }
      }); actions.append(action);
    }
    const amount = node('span', 'shop-order-amount'); renderBuyerPrice(amount, order.amount, order.currency);
    row.append(info, amount, actions); root.append(row);
  });
}
function receipt(order) {
  selectedOrder = order; const root = $('#shop-receipt-facts'); root.replaceChildren();
  for (const [label, value] of [[t('orderId'), order.orderId], [t('captureId'), order.captureId || t('notReturned')], [t('product'), order.items?.[0] ? localizedOrderItem(order.items[0]) : order.productName || t('product')], [t('quantity'), order.quantity || 1]]) root.append(node('dt', '', label), node('dd', '', value));
  root.append(node('dt', '', t('subtotal'))); const subtotal = node('dd'); renderBuyerPrice(subtotal, order.amount, order.currency); root.append(subtotal);
  root.append(node('dt', '', t('paymentStatus')), node('dd', '', statusLabel(order.status)));
  if (order.status === 'COMPLETED') root.append(node('dt', '', t('fulfillment')), node('dd', '', t(order.fulfillment === 'FULFILLED' ? 'fulfilled' : 'unfulfilled')));
  if (order.tracking) root.append(node('dt', '', t('tracking')), node('dd', '', order.tracking));
  if (order.shipping) root.append(node('dt', '', t('shipTo')), node('dd', '', [order.shipping.name, ...Object.values(order.shipping.address)].filter(Boolean).join(', ')));
  for (const item of order.items || []) { const amount = node('dd'); amount.append(document.createTextNode(item.quantity + ' × ')); appendPriceParts(amount, item.price, order.currency, currentLanguage().intl); root.append(node('dt', '', localizedOrderItem(item)), amount); }
  $('#shop-receipt').showModal();
}
$('#shop-receipt-close').addEventListener('click', () => $('#shop-receipt').close());
$('#shop-download-receipt').addEventListener('click', async () => {
  if (!selectedOrder) return;
  const orderId = selectedOrder.paypalOrderId || selectedOrder.localId || selectedOrder.orderId;
  $('#shop-download-receipt').disabled = true;
  try {
    const receipt = await api('/api/buyer/receipt?orderId=' + encodeURIComponent(orderId));
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tradeweave-order-' + receipt.orderId + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message); }
  finally { $('#shop-download-receipt').disabled = false; }
});
function lockCheckout(locked) { busy = locked; updateQuantity(quantity); renderCart(); }
function loadSdk() {
  if (window.paypal) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const failed = message => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error(message)); };
    const timer = setTimeout(() => failed(t('paypalLoadTimeout')), 20000);
    const locale = { en: 'en_US', 'zh-CN': 'zh_CN', ja: 'ja_JP', es: 'es_ES', fr: 'fr_FR' }[state.language] || 'en_US';
    script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(config.paypalClientId) + '&currency=USD&intent=capture&locale=' + locale;
    script.onload = () => { clearTimeout(timer); resolve(); }; script.onerror = () => failed(t('paypalLoadFailed')); document.head.append(script);
  });
  return sdkPromise;
}
async function capture(orderId) {
  if (!activeCheckout || activeCheckout.id !== orderId) throw new Error(t('checkoutRecover'));
  state.pendingCheckout = activeCheckout; state.openCheckout = null; persist(); renderPending(); lockCheckout(true);
  $('#shop-retry-capture').disabled = true;
  try {
    const result = await api('/api/paypal/capture', { method: 'POST', body: JSON.stringify({ orderId, checkoutToken: activeCheckout.checkoutToken }) });
    if (!captureResponseStatuses.has(result.status)) throw new Error(t('checkoutRecover'));
    state.pendingCheckout = null; state.openCheckout = null; activeCheckout = null;
    if (['COMPLETED', 'PENDING'].includes(result.status)) state.cart = [];
    state.requestKey = null; cartQuote = null; quoteApproved = false; persist();
    const ordersRefreshed = await refreshOrders(); lockCheckout(false); renderPending(); renderCart();
    history.pushState(null, '', '#orders'); showPage(true);
    setOrdersStatus('paymentReturned', { status: result.status, detailKey: ordersRefreshed ? '' : 'orderRefreshError' });
  } catch (error) {
    $('#shop-checkout-note').textContent = error.message;
    renderPending();
    const recoveryButton = $('#shop-retry-capture');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      $('#shop-pending').scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      recoveryButton.focus({ preventScroll: true });
    });
    throw error;
  }
  finally { $('#shop-retry-capture').disabled = false; }
}
$('#shop-retry-capture').addEventListener('click', async () => { if (activeCheckout) try { await capture(activeCheckout.id); } catch (error) { toast(error.message); } });
async function beginCheckout() {
  if (busy || !config.paypalReady) return;
  cartNotice = null;
  history.replaceState(null, '', '#cart'); showPage(); lockCheckout(true); $('#shop-buy').setAttribute('aria-busy', 'true');
  try {
    if (!state.openCheckout && !recoveringCreation) {
      const displayed = cartItems(), displayedTotal = cartTotal(), quote = await api('/api/cart/quote', { method: 'POST', body: JSON.stringify({ items: state.cart }) });
      const quoteLinesValid = Array.isArray(quote.items) && quote.items.every(line => line && typeof line === 'object');
      const quoteItems = quoteLinesValid ? quote.items : [];
      const lineDetailsChanged = !quoteLinesValid || quoteItems.length !== displayed.length || displayed.some(item => {
        const quoted = quoteItems.find(line => line.productId === item.productId && (line.variantId || null) === (item.variantId || null));
        return !quoted || quoted.quantity !== item.quantity;
      });
      const quoteValueChanged = quote.currency !== 'USD' || displayedTotal !== quote.amount || displayed.some(item => {
        const quoted = quoteItems.find(line => line.productId === item.productId && (line.variantId || null) === (item.variantId || null));
        return !quoted || quoted.price !== item.price;
      });
      cartQuote = quoteLinesValid ? quote : null; renderCart();
      if (lineDetailsChanged || quoteValueChanged) { quoteApproved = false; cartNotice = 'priceChanged'; lockCheckout(false); return; }
    }
    quoteApproved = true;
    await loadSdk();
    if (!paypalMounted) {
      const buttons = window.paypal.Buttons({ style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 48 },
        createOrder: async () => {
          if (state.openCheckout) return state.openCheckout.id;
          if (!state.cart.length) throw new Error(t('emptyCart'));
          lockCheckout(true); state.requestKey ||= crypto.randomUUID(); persist();
          try {
            const expected = cartQuote?.amount || cartTotal();
            activeCheckout = await api('/api/paypal/order', { method: 'POST', body: JSON.stringify({ items: state.cart, requestKey: state.requestKey }) });
            state.openCheckout = activeCheckout; persist(); renderPending();
            const expectedItems = cartQuote?.items;
            const sameItems = expectedItems && Array.isArray(activeCheckout.items) && expectedItems.length === activeCheckout.items.length && expectedItems.every((item, index) => {
              const saved = activeCheckout.items[index];
              return saved.productId === item.productId && (saved.variantId || null) === (item.variantId || null) && saved.quantity === item.quantity && saved.price === item.price;
            });
            if (activeCheckout.amount !== expected || activeCheckout.currency !== 'USD' || !sameItems) {
              quoteApproved = false;
              throw new Error(t('checkoutSaved'));
            }
            state.checkouts++; persist(); return activeCheckout.id;
          } catch (error) { await refreshOrders(); lockCheckout(Boolean(state.pendingCheckout)); throw error; }
        },
        onApprove: async data => { try { await capture(data.orderID); } catch (error) { toast(error.message); } },
        onCancel: async () => { await cancelCheckout(); },
        onError: error => { lockCheckout(Boolean(state.pendingCheckout)); renderPending(); $('#shop-checkout-note').textContent = error.message || t('checkoutTryAgain'); toast($('#shop-checkout-note').textContent); }
      });
      if (!buttons.isEligible()) throw new Error(t('paypalUnavailable'));
      await buttons.render('#shop-paypal'); paypalMounted = true;
    }
    $('#shop-checkout-note').textContent = checkoutInstruction();
    $('#shop-checkout-note').focus();
    lockCheckout(false);
  } catch (error) { lockCheckout(Boolean(state.pendingCheckout)); $('#shop-checkout-note').textContent = error.message; toast(error.message); }
  finally { $('#shop-buy').setAttribute('aria-busy', 'false'); updateCartControls(); }
}
$('#shop-buy').addEventListener('click', beginCheckout);
$('#shop-resume-checkout').addEventListener('click', beginCheckout);
$('#shop-cancel-checkout').addEventListener('click', cancelCheckout);
async function cancelCheckout() {
  if (!activeCheckout) return;
  try {
    const result = await api('/api/paypal/cancel', { method: 'POST', body: JSON.stringify({ orderId: activeCheckout.id, checkoutToken: activeCheckout.checkoutToken }) });
    if (['APPROVED', 'CAPTURE_PENDING'].includes(result.status)) {
      activeCheckout = { ...result, id: result.paypalOrderId || result.orderId };
      state.openCheckout = null; state.pendingCheckout = activeCheckout; state.requestKey = result.requestKey || state.requestKey;
      persist(); lockCheckout(true); renderPending(); renderCart(); await refreshOrders(); toast(t('checkoutPending')); return;
    }
    if (['COMPLETED', 'PENDING'].includes(result.status)) state.cart = [];
    activeCheckout = null; state.openCheckout = null; state.pendingCheckout = null; state.requestKey = null; cartQuote = null; quoteApproved = false;
    persist(); lockCheckout(false); renderPending(); renderCart(); $('#shop-checkout-note').textContent = checkoutInstruction(); await refreshOrders();
    toast(result.status === 'COMPLETED' || result.status === 'PENDING' ? t('paymentReturned', { status: statusLabel(result.status) }) : t('checkoutCancel'));
  }
  catch (error) { toast(error.message); renderPending(); }
}
async function initialize() {
  if (loading || busy && !state.pendingCheckout) return;
  loading = true; $('#shop-loading').hidden = Boolean(product); $('#shop-load-error').hidden = true;
  try {
    const [source, connection] = await Promise.allSettled([api('/api/store'), api('/api/shop/config')]);
    if (source.status !== 'fulfilled') throw source.reason;
    store = source.value; config = connection.status === 'fulfilled' ? connection.value : {};
    syncProduct(); renderShopCatalog(); void refreshFx();
    $('#shop-preview').hidden = !(config.workspaceReady && new URLSearchParams(location.search).get('preview') === '1');
    translateStatic(); $('#shop-checkout-note').textContent = checkoutInstruction();
    await refreshOrders(); renderPending(); renderProduct(); renderCart(); aiStatus();
  } catch (error) { console.error(error); $('#shop-load-error').hidden = false; $('#shop-load-message').textContent = error.message; }
  finally { loading = false; $('#shop-loading').hidden = true; showPage(); }
}
async function refreshFx() {
  try { const result = await api('/api/fx/usd-cny'); fxRate = result.rate > 0 ? result : null; }
  catch { fxRate = null; }
  renderProduct(); renderShopCatalog(); renderCart(); renderOrders(); renderPending();
  if (selectedOrder && $('#shop-receipt').open) receipt(selectedOrder);
}
$('#shop-retry').addEventListener('click', initialize);
setupLanguageSelect(); persist(); translateStatic(); renderPending(); renderOrders(); renderChat(); aiStatus(); showPage(); initialize();

function syncProduct() {
  if (!store) return;
  const id = new URLSearchParams(location.search).get('item');
  const next = id ? store.products.find(p => p.id === id) : store.products[0];
  if (product?.id === next?.id && product === next) return;
  product = next || null; selectedVariant = product?.variants.find(v => v.stock > 0) || product?.variants[0] || null; quantity = 1; addedToCart = false;
  $('#shop-confirmation').hidden = true;
  if (product) renderProduct(); renderChat(); aiStatus();
}
function renderShopCatalog() {
  if (!store) return;
  $('#shop-name').textContent = store.shop.name;
  renderCatalogTagOptions();
  const search = $('#shop-catalog-search').value.trim().toLowerCase();
  const minimum = $('#shop-price-min').value === '' ? null : Number($('#shop-price-min').value);
  const maximum = $('#shop-price-max').value === '' ? null : Number($('#shop-price-max').value);
  const tag = $('#shop-catalog-tag').value;
  const items = store.products.filter(p => {
    const searchable = [p.name, p.subtitle, p.description, ...p.tags, ...p.variants.flatMap(v => [v.name, { en: v.sku }]), ...Object.values(p.facts)].flatMap(value => value && typeof value === 'object' ? Object.values(value) : []).join(' ').toLowerCase();
    const price = Number(p.price);
    const matchesPrice = Number.isFinite(price) && (minimum === null || price >= minimum) && (maximum === null || price <= maximum);
    const matchesTag = tag === 'all' || p.tags.some(item => item.en.trim() === tag);
    return searchable.includes(search) && ($('#shop-catalog-availability').value !== 'available' || p.stock > 0) && matchesPrice && matchesTag;
  });
  const sort = $('#shop-catalog-sort').value;
  if (sort === 'price-low') items.sort((a,b) => Number(a.price) - Number(b.price));
  if (sort === 'price-high') items.sort((a,b) => Number(b.price) - Number(a.price));
  if (sort === 'name') items.sort((a,b) => localize(a.name).localeCompare(localize(b.name), currentLanguage().intl));
  $('#shop-catalog-count').textContent = t('productsCount', { shown: items.length, total: store.products.length });
  const root = $('#shop-catalog-list'); root.replaceChildren();
  for (const item of items) {
    const link = node('a', 'shop-product-card'); const url = new URL(location.href); url.searchParams.set('item', item.id); url.hash = 'product'; link.href = url.href; link.dataset.item = item.id;
    const picture = node('div', 'shop-card-image');
    if (item.images.length) { const image = node('img'); image.src = item.images[0]; image.alt = ''; image.loading = 'lazy'; picture.append(image); }
    else if (item.id === 'coast-tote') { const illustration = $('.shop-art .tote').cloneNode(true); illustration.removeAttribute('hidden'); picture.append(illustration); }
    else picture.append(node('span', '', t('noProductImage')));
    const price = node('strong'); if (item.variants.length) price.append(document.createTextNode(t('from') + ' ')); renderBuyerPrice(price, item.price, item.currency);
    link.append(picture, node('h2', '', localize(item.name)), node('p', '', localize(item.subtitle)), price, node('small', '', item.stock ? t('viewProduct') : t('soldOut'))); root.append(link);
  }
  if (!items.length) {
    const empty = node('div', 'shop-catalog-empty'); empty.append(node('p', '', t(store.products.length ? 'noMatch' : 'noSale')));
    if (store.products.length) { const clear = node('button', 'quiet-button', t('clearFilters')); clear.type = 'button'; clear.addEventListener('click', () => { $('#shop-catalog-search').value = ''; $('#shop-catalog-availability').value = 'all'; $('#shop-price-min').value = ''; $('#shop-price-max').value = ''; $('#shop-catalog-tag').value = 'all'; renderShopCatalog(); $('#shop-catalog-search').focus(); }); empty.append(clear); }
    root.append(empty);
  }
}
function renderCatalogTagOptions() {
  const select = $('#shop-catalog-tag');
  if (!store || !select) return;
  const current = select.value || 'all', tags = new Map();
  for (const product of store.products) for (const tag of product.tags) {
    const key = typeof tag.en === 'string' ? tag.en.trim() : '';
    if (key && !tags.has(key)) tags.set(key, tag);
  }
  if (select.dataset.tagKeys !== [...tags.keys()].sort().join('\u0000')) {
    select.replaceChildren();
    const all = node('option', '', t('allTags')); all.value = 'all'; select.append(all);
    for (const [key] of [...tags.entries()].sort((a,b) => localize(a[1]).localeCompare(localize(b[1]), currentLanguage().intl))) {
      const option = node('option', '', ''); option.value = key; select.append(option);
    }
    select.dataset.tagKeys = [...tags.keys()].sort().join('\u0000');
  }
  select.options[0].textContent = t('allTags');
  for (const option of [...select.options].slice(1)) option.textContent = localize(tags.get(option.value));
  select.value = tags.has(current) ? current : 'all';
}
$('#shop-catalog-search').addEventListener('input', renderShopCatalog);
$('#shop-catalog-availability').addEventListener('change', renderShopCatalog); $('#shop-catalog-sort').addEventListener('change', renderShopCatalog);
$('#shop-price-min').addEventListener('input', renderShopCatalog); $('#shop-price-max').addEventListener('input', renderShopCatalog); $('#shop-catalog-tag').addEventListener('change', renderShopCatalog);
function renderGallery() {
  const image = $('#shop-product-image'), art = $('.shop-art');
  if (galleryProductId !== product.id || !product.images.includes(galleryImagePath)) galleryImagePath = product.images[0] || null;
  galleryProductId = product.id;
  art.setAttribute('aria-label', product.id === 'coast-tote' ? t('illustration') : t('noImage'));
  image.hidden = !product.images.length; art.hidden = Boolean(product.images.length);
  $('.shop-art .tote').toggleAttribute('hidden', product.id !== 'coast-tote'); $('#shop-no-image').hidden = product.id === 'coast-tote'; $('.shop-art>span').hidden = product.id !== 'coast-tote';
  if (product.images.length) { image.src = galleryImagePath; image.alt = localize(product.name); }
  const root = $('#shop-image-thumbs'); root.replaceChildren();
  if (product.images.length > 1) product.images.forEach((path, index) => {
    const button = node('button'); button.type = 'button'; button.setAttribute('aria-label', t('viewImage', { index: index + 1 })); button.setAttribute('aria-pressed', String(path === galleryImagePath));
    const thumbnail = node('img'); thumbnail.src = path; thumbnail.alt = ''; button.append(thumbnail);
    button.addEventListener('click', () => { galleryImagePath = path; image.src = path; $$('#shop-image-thumbs button').forEach(item => item.setAttribute('aria-pressed', String(item === button))); }); root.append(button);
  });
}
function renderVariants() {
  $('#shop-variant-label').hidden = !product.variants.length;
  const select = $('#shop-variant'); select.replaceChildren();
  product.variants.forEach(variant => { const option = node('option', '', localize(variant.name) + ' · ' + priceLabel(variant.price) + (variant.stock ? '' : ' · ' + t('soldOut'))); option.value = variant.id; select.append(option); });
  select.value = selectedVariant?.id || '';
}
$('#shop-variant').addEventListener('change', event => { if (busy) return; selectedVariant = product.variants.find(v => v.id === event.target.value); quantity = 1; renderProduct(); });
function renderPending() {
  const order = state.pendingCheckout || state.openCheckout;
  $('#shop-pending').hidden = !order; $('#shop-resume-checkout').hidden = !state.openCheckout; $('#shop-cancel-checkout').hidden = !state.openCheckout; $('#shop-retry-capture').hidden = !state.pendingCheckout;
  $('#shop-resume-checkout').textContent = t('resumePayPal'); $('#shop-cancel-checkout').textContent = t('cancelCheckoutAction'); $('#shop-retry-capture').textContent = t('retryCapture');
  if (order) {
    const summary = (order.items || []).map(item => item.quantity + ' × ' + (localizedOrderItem(item) || t('unavailable')) + ' · ' + priceLabel(item.price, order.currency) + ' ' + t('each')).join(' · ') || order.productName || t('savedCheckout');
    $('#shop-pending-copy').textContent = t(state.pendingCheckout ? 'checkoutPending' : 'checkoutAwaiting') + ' · ' + summary + ' · ' + priceLabel(order.amount, order.currency) + '. ' + t('savedSnapshot');
  }
}

function cartItems() {
  if (activeCheckout?.items && (state.openCheckout || state.pendingCheckout)) return activeCheckout.items.map(item => ({ ...item, name: localizedOrderItem(item) || item.name || t('unavailable') }));
  return state.cart.map(item => {
    const product = store?.products.find(p => p.id === item.productId), variant = product?.variants.find(v => v.id === item.variantId);
    const current = cartQuote?.items.find(i => i.productId === item.productId && (i.variantId || null) === (item.variantId || null));
    const available = product && (item.variantId ? variant : !product.variants.length);
    return { ...item, name: product ? localize(product.name) + (variant ? ' · ' + localize(variant.name) : '') : t('unavailable'), price: current?.price || variant?.price || product?.price || '0.00', stock: available ? variant ? variant.stock : product.stock : 0, unavailable: !available, image: product?.images[0] };
  });
}
function cartTotal() { return (cartItems().reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0) / 100).toFixed(2); }
function updateCartControls() {
  const items = cartItems(), invalid = !activeCheckout && items.some(i => i.unavailable || i.quantity > i.stock);
  $('#shop-language').disabled = busy || Boolean(activeCheckout);
  $('#shop-language').title = $('#shop-language').disabled ? ({ en: 'Finish or cancel checkout to change language.', 'zh-CN': '完成或取消结账后可切换语言。', ja: '言語を変更するには決済を完了またはキャンセルしてください。', es: 'Finaliza o cancela el pago para cambiar el idioma.', fr: 'Terminez ou annulez le paiement pour changer de langue.' }[state.language] || '') : '';
  $('#shop-buy').disabled = busy || !items.length || invalid || !config.paypalReady;
  $('#shop-buy').textContent = busy ? t('checkoutProgress') : !config.paypalReady ? t('checkoutUnavailable') : state.openCheckout ? t('resumePayPal') : t('continuePayPal');
  const paymentReady = paypalMounted && quoteApproved && Boolean(items.length) && !invalid && config.paypalReady && !state.pendingCheckout;
  $('#shop-buy').hidden = paymentReady;
  $('#shop-paypal').hidden = !paymentReady;
  $('#shop-paypal').style.pointerEvents = busy ? 'none' : '';
  $('#shop-cart-count').textContent = state.cart.reduce((sum, i) => sum + i.quantity, 0); $('#shop-cart-count').hidden = !state.cart.length;
}
function changeCart(index, difference) {
  if (busy || activeCheckout) return;
  state.cart[index].quantity += difference; state.requestKey = null; cartQuote = null; cartNotice = null; quoteApproved = false; recoveringCreation = null; persist(); renderCart(); $('#shop-checkout-note').textContent = checkoutInstruction();
}
function renderCart() {
  const root = $('#shop-cart-list'), items = cartItems(); root.replaceChildren(); $('#shop-cart-message').textContent = cartNotice ? t(cartNotice) : '';
  if (!items.length) root.append(node('p', 'shop-order-empty', t('emptyCart')));
  items.forEach((item, index) => {
    const row = node('article', 'shop-cart-row'), details = node('div', 'shop-cart-item-info');
    details.append(node('strong', '', item.name), node('span', '', priceLabel(item.price) + ' · ' + t('each')));
    if (item.unavailable || !activeCheckout && item.quantity > item.stock) details.append(node('p', 'cart-item-error', item.unavailable ? t('unavailableItem') : t('stockShort', { stock: item.stock })));
    const controls = node('div', 'cart-item-controls'), stepper = node('div', 'qty-stepper'); stepper.setAttribute('aria-label', t('quantityFor', { product: item.name }));
    const minus = node('button', '', '−'), plus = node('button', '', '+'); minus.type = plus.type = 'button'; minus.setAttribute('aria-label', t('decreaseProduct', { product: item.name })); plus.setAttribute('aria-label', t('increaseProduct', { product: item.name }));
    minus.disabled = busy || Boolean(activeCheckout) || item.quantity <= 1; plus.disabled = busy || Boolean(activeCheckout) || item.quantity >= Math.min(5, item.stock || 0);
    minus.addEventListener('click', () => changeCart(index, -1)); plus.addEventListener('click', () => changeCart(index, 1)); stepper.append(minus, node('span', '', item.quantity), plus);
    const remove = node('button', 'text-button', t('remove')); remove.type = 'button'; remove.setAttribute('aria-label', t('remove') + ' ' + item.name); remove.disabled = busy || Boolean(activeCheckout); remove.addEventListener('click', () => { state.cart.splice(index, 1); state.requestKey = null; cartQuote = null; cartNotice = null; quoteApproved = false; persist(); renderCart(); $('#shop-checkout-note').textContent = checkoutInstruction(); }); controls.append(stepper, remove);
    const itemTotal = node('strong', 'cart-item-total'); renderBuyerPrice(itemTotal, Number(item.price) * item.quantity); row.append(details, controls, itemTotal); root.append(row);
  });
  renderBuyerPrice($('#shop-cart-total'), activeCheckout?.amount || cartTotal()); updateCartControls(); updateFxNotes();
}
$('#shop-add-cart').addEventListener('click', () => {
  if (!product || !quantity || busy || activeCheckout) return;
  const found = state.cart.find(i => i.productId === product.id && (i.variantId || null) === (selectedVariant?.id || null));
  if (found && found.quantity + quantity > Math.min(5, selectedVariant ? selectedVariant.stock : product.stock)) { toast(t('maxCartQty')); return; }
  if (!found && state.cart.length >= 20) { toast(t('cartLimit')); return; }
  if (found) found.quantity += quantity; else state.cart.push({ productId: product.id, variantId: selectedVariant?.id || null, quantity });
  state.requestKey = null; cartQuote = null; cartNotice = null; quoteApproved = false; persist(); renderCart(); $('#shop-checkout-note').textContent = checkoutInstruction(); addedToCart = true;
  $('#shop-product-note').textContent = t('toastAdded'); $('#shop-add-confirmation').hidden = false;
});
async function refreshOrders() {
  $('#shop-refresh-orders').disabled = true;
  ordersKnown = false; ordersStatus = null; $('#shop-orders-status').textContent = ''; renderOrders();
  try {
    const result = await api('/api/buyer/orders'); state.orders = result.orders; ordersKnown = true; persist(); renderOrders();
    if (!activeCheckout && state.requestKey) { const attempt = result.orders.find(o => o.requestKey === state.requestKey); if (attempt && terminalCheckoutStatuses.has(attempt.status)) { state.requestKey = null; persist(); } }
    setOrdersStatus('ordersLoaded');
    if (activeCheckout) {
      const saved = result.orders.find(o => o.paypalOrderId === activeCheckout.id);
      if (saved && terminalCheckoutStatuses.has(saved.status)) { if (saved.status === 'COMPLETED') state.cart = []; activeCheckout = null; state.pendingCheckout = null; state.openCheckout = null; state.requestKey = null; cartQuote = null; quoteApproved = false; lockCheckout(false); persist(); renderCart(); }
    }
    return true;
  } catch (error) { renderOrders(); setOrdersStatus('orderRefreshError', { detail: error.message }); return false; }
  finally { $('#shop-refresh-orders').disabled = false; renderPending(); }
}
$('#shop-refresh-orders').addEventListener('click', refreshOrders);
function resumeOrder(order) {
  if ((busy || activeCheckout) && activeCheckout?.id !== order.paypalOrderId) { toast(t('resolveCheckout')); return; }
  quoteApproved = false;
  state.cart = order.items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })); cartQuote = { amount: order.amount, items: order.items }; state.requestKey = order.requestKey || state.requestKey;
  if (order.paypalOrderId) { activeCheckout = { ...order, id: order.paypalOrderId }; state.openCheckout = activeCheckout; state.pendingCheckout = null; recoveringCreation = null; }
  else { activeCheckout = null; state.openCheckout = null; recoveringCreation = order; }
  lockCheckout(false); persist(); renderPending(); renderCart(); history.pushState(null, '', '#cart'); showPage(true);
}

function openMakerQuestions(fromChat = false) {
  if ($('#shop-chat').open) $('#shop-chat').close();
  const select = $('#shop-contact-order'); select.replaceChildren(node('option', '', t('generalQuestion'))); select.options[0].value = '';
  state.orders.filter(o => o.paypalOrderId).forEach(order => { const option = node('option', '', order.paypalOrderId); option.value = order.paypalOrderId; select.append(option); });
  $('#shop-contact-history').checked = false; $('#shop-contact-history').disabled = !chatHistory().some(m => !m.isError); $('#shop-contact').showModal(); refreshQuestions();
}
$('#shop-open-contact').addEventListener('click', () => openMakerQuestions()); $('#shop-chat-handover').addEventListener('click', () => { const last = chatHistory().filter(m => m.role === 'user').at(-1); if (last) $('#shop-contact-question').value = last.text; openMakerQuestions(true); });
$('#shop-contact-close').addEventListener('click', () => $('#shop-contact').close());
let questionRequestKey = null, questionPayloadStamp = null, sendingQuestion = false;
$('#shop-contact-form').addEventListener('submit', async event => {
  event.preventDefault(); if (sendingQuestion) return;
  const payload = { question: $('#shop-contact-question').value.trim(), productId: product?.id || null, orderId: $('#shop-contact-order').value || null, history: $('#shop-contact-history').checked ? chatHistory().filter(m => !m.isError).slice(-6).map(m => ({ role: m.role, content: m.text.slice(0, 1800) })) : [] };
  const stamp = JSON.stringify(payload); if (stamp !== questionPayloadStamp) { questionRequestKey = crypto.randomUUID(); questionPayloadStamp = stamp; }
  sendingQuestion = true; $('#shop-contact-send').disabled = true; $('#shop-contact-question').readOnly = true; $('#shop-contact-order').disabled = true; $('#shop-contact-history').disabled = true; $('#shop-contact-status').textContent = t('savingQuestion');
  try { await api('/api/buyer/ticket', { method: 'POST', body: JSON.stringify({ requestKey: questionRequestKey, ...payload }) }); questionRequestKey = null; questionPayloadStamp = null; $('#shop-contact-question').value = ''; $('#shop-contact-status').textContent = t('questionSaved'); await refreshQuestions(); }
  catch (error) { $('#shop-contact-status').textContent = error.message; }
  finally { sendingQuestion = false; $('#shop-contact-send').disabled = false; $('#shop-contact-question').readOnly = false; $('#shop-contact-order').disabled = false; $('#shop-contact-history').disabled = !chatHistory().some(m => !m.isError); }
});
async function refreshQuestions() {
  $('#shop-refresh-questions').disabled = true;
  try { const { tickets } = await api('/api/buyer/tickets'); const root = $('#shop-my-questions'); root.replaceChildren(); if (!tickets.length) root.append(node('p', 'muted', t('noQuestions')));
    for (const ticket of tickets) { const row = node('article', 'shop-question-row'); row.append(node('strong', '', ticket.productName || t('makerQuestion')), node('p', '', ticket.question), node('small', '', t(({ OPEN: 'ticketOpen', ANSWERED: 'ticketAnswered', CLOSED: 'ticketClosed' })[ticket.status] || 'ticketOpen'))); if (ticket.reply) row.append(node('p', 'maker-reply', ticket.reply)); else row.append(node('p', 'muted', t('waitingReply'))); root.append(row); }
  } catch (error) { $('#shop-contact-status').textContent = error.message; }
  finally { $('#shop-refresh-questions').disabled = false; }
}
$('#shop-refresh-questions').addEventListener('click', refreshQuestions);
$('#shop-open-policies').addEventListener('click', () => {
  const root = $('#shop-policy-copy'); root.replaceChildren();
  for (const [key, label] of [['shipping', 'shipping'], ['returns', 'returns'], ['privacy', 'privacy'], ['contact', 'contactInfo']]) { root.append(node('h3', '', t(label)), node('p', '', localize(store?.shop.policies?.[key]) || t('notProvided'))); }
  $('#shop-policies').showModal();
});
$('#shop-policies-close').addEventListener('click', () => $('#shop-policies').close());
