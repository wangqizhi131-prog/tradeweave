const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const storageKey = 'tradeweave-buyer-v1';
const i18n = window.TradeWeaveI18n;
const factFields = [['material', 'Material', '材质'], ['production', 'Production', '制作方式'], ['madeIn', 'Made in', '产地'], ['dimensions', 'Dimensions', '尺寸'], ['care', 'Care', '保养'], ['dispatch', 'Dispatch', '发货时间'], ['shippingPrice', 'Shipping price', '运费'], ['arrivalDateGuarantee', 'Arrival guarantee', '送达日期承诺']];
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
let selectedVariant = null;
let addedToCart = false;
let galleryProductId = null, galleryImagePath = null;
let store = null, product = null, config = {}, quantity = 1, busy = false, aiBusy = false, loading = false;
let cartQuote = null, recoveringCreation = null;
let activeCheckout = state.pendingCheckout || state.openCheckout, sdkPromise = null, paypalMounted = false, selectedOrder = null, toastTimer;
let fxRate = null;
busy = Boolean(state.pendingCheckout);
const t = (key, values) => i18n.get(state.language, key, values);
const currentLanguage = () => i18n.language(state.language);
const localize = value => value?.[currentLanguage().product] || value?.en || value?.zh || '';
const needsFallback = value => Boolean(value && Object.values(value).some(text => typeof text === 'string' && text.trim()) && !value[currentLanguage().product]?.trim());
function productNeedsFallback(item) {
  if (!item) return false;
  return [item.name, item.subtitle, item.description, ...item.tags, ...item.variants.map(variant => variant.name), ...Object.values(item.facts)].some(needsFallback);
}
function usd(value) {
  const options = { style: 'currency', currency: 'USD', ...( ['es', 'fr'].includes(state.language) ? { currencyDisplay: 'code' } : {}) };
  const formatted = new Intl.NumberFormat(currentLanguage().intl, options).format(Number(value));
  return ['es', 'fr'].includes(state.language) || formatted.includes('US$') ? formatted : formatted + ' USD';
}
function priceLabel(value, currency = 'USD') {
  if (currency === 'USD' && state.language === 'zh-CN' && fxRate?.rate) return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(Number(value) * fxRate.rate) + ' CNY (' + usd(value) + ')';
  return usd(value);
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
function persist() { try { sessionStorage.setItem(storageKey, JSON.stringify(state)); return true; } catch { return false; } }
function toast(text) { $('#shop-toast').textContent = text; $('#shop-toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#shop-toast').classList.remove('show'), 4500); }
function statusLabel(status) { const key = ({ CREATING: 'statusCreating', CREATED: 'statusCreated', APPROVED: 'statusApproved', CAPTURE_PENDING: 'statusCapturePending', COMPLETED: 'completed', PENDING: 'statusPending', DECLINED: 'statusDeclined', DENIED: 'statusDenied', CANCELLED: 'statusCancelled', FAILED: 'statusFailed', PARTIALLY_REFUNDED: 'statusPartiallyRefunded', REFUNDED: 'statusRefunded' })[status] || 'statusUnconfirmed'; return t(key); }
function localizedOrderItem(item) {
  const source = store?.products.find(entry => entry.id === item.productId);
  const variant = source?.variants.find(entry => entry.id === item.variantId);
  return source ? localize(source.name) + (variant ? ' · ' + localize(variant.name) : '') : item.name || t('product');
}
function translateStatic() {
  const text = (selector, key) => { const element = $(selector); if (element) element.textContent = t(key); };
  const attr = (selector, name, key) => { const element = $(selector); if (element) element.setAttribute(name, t(key)); };
  document.documentElement.lang = currentLanguage().intl;
  text('.skip-link', 'skip'); text('.shop-demo', 'sandbox'); text('#shop-preview>span', 'preview');
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
  $('#shop-checkout-note').textContent = activeCheckout ? t('checkoutReview') : config.paypalReady ? t('sandboxBuyer') : t('checkoutUnavailable');
  if ($('#shop-orders-status').textContent.trim()) $('#shop-orders-status').textContent = t('ordersLoaded');
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
addEventListener('hashchange', () => { syncProduct(); showPage(); }); addEventListener('popstate', () => { syncProduct(); showPage(); });
function renderProduct() {
  if (!product) return;
  const chinese = state.language === 'zh-CN';
  $('.shop-product-copy').lang = currentLanguage().intl;
  $('#shop-name').textContent = store.shop.name; $('#shop-monogram').textContent = store.shop.name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  $('#shop-product-name').textContent = localize(product.name); $('#shop-subtitle').textContent = localize(product.subtitle); $('#shop-description').textContent = localize(product.description);
  const amount = selectedVariant?.price || product.price;
  $('#shop-price').textContent = priceLabel(amount, product.currency); $('#shop-currency').textContent = '';
  updateFxNotes();
  const location = chinese && store.shop.location === 'Nanjing, China' ? '中国南京' : store.shop.location;
  $('#shop-origin').textContent = location + ' · ' + t('sampleStudio');
  const stock = selectedVariant ? selectedVariant.stock : product.stock;
  $('#shop-stock').textContent = stock ? `${t(selectedVariant ? 'optionStock' : 'sampleStock')} ${stock} ${t('itemsAvailable')}` : t('soldOut');
  $('#shop-tags').replaceChildren(...product.tags.map(tag => node('span', '', localize(tag))));
  $('#shop-facts-label').textContent = t('facts'); $('#shop-facts-note').textContent = t('factsNote');
  $('#shop-facts').replaceChildren();
  factFields.forEach(([key, en, zh]) => $('#shop-facts').append(node('dt', '', t('fact_' + key)), node('dd', '', localize(product.facts[key]) || t('notProvided'))));
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
  $('#shop-total').textContent = sameCheckout && busy ? priceLabel(activeCheckout.amount, activeCheckout.currency) : product ? priceLabel(Math.round(Number(selectedVariant?.price || product.price) * 100) * quantity / 100, product.currency) : '—';
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
  if (!chatHistory().length) root.append(node('p', 'shop-chat-welcome', t('chatWelcome')));
  chatHistory().forEach(message => {
    const item = node('div', 'shop-message ' + (message.isError ? 'notice' : message.role));
    item.append(node('span', '', message.role === 'user' ? t('you') : message.isError ? t('connectionNotice') : t('assistant')), node('p', '', message.text));
    if (message.retryQuestion) { const retry = node('button', 'quiet-button shop-retry-question', t('retry')); retry.type = 'button'; retry.dataset.retryIndex = chatHistory().indexOf(message); item.append(retry); }
    root.append(item);
  });
  root.scrollTop = root.scrollHeight;
  $('#shop-new-chat').disabled = aiBusy || !chatHistory().length;
}
function aiStatus(text) {
  $('#shop-ai-status').textContent = text || t(config.aiReady ? 'aiSellerFacts' : 'aiUnavailable');
  $$('#shop-chat-form input, #shop-chat-form button, .shop-prompts button').forEach(control => control.disabled = aiBusy || !config.aiReady || !product);
  $('#shop-reply-language').disabled = aiBusy; $('#shop-chat-form').setAttribute('aria-busy', String(aiBusy));
}
function chatHistory(id = product?.id) { return state.histories[id] || []; }
function addMessage(role, text, isError = false, id = product?.id, metadata = {}) { state.histories[id] = [...chatHistory(id), { role, text, isError, ...metadata }].slice(-30); persist(); if (product?.id === id) renderChat(); }
async function ask(question) {
  if (aiBusy || !product || !config.aiReady || !question.trim()) return;
  const history = chatHistory().filter(m => !m.isError).slice(-10).map(m => ({ role: m.role, content: m.text.slice(0, 1800) }));
  const contextId = product.id, optionId = selectedVariant?.id;
  addMessage('user', question); aiBusy = true; aiStatus(t('readingFacts')); renderChat();
  try { const result = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ productId: contextId, variantId: optionId, question, language: state.replyLanguage, history }) }); addMessage('assistant', result.answer, false, contextId); state.answers++; persist(); }
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
    const empty = node('div', 'shop-order-empty'), link = node('a', 'primary-button', t('browseShop')); link.href = '#catalog'; link.dataset.shopPage = 'catalog';
    empty.append(node('h2', '', t('ordersEmptyTitle')), node('p', '', t('ordersEmpty')), link); root.append(empty); return;
  }
  state.orders.forEach(order => {
    const row = node('article', 'shop-order-row'), info = node('div');
    const firstItemName = order.items?.[0] ? localizedOrderItem(order.items[0]) : localize(store?.products.find(item => item.name.en === order.productName)?.name) || order.productName || t('product');
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
    row.append(info, node('span', 'shop-order-amount', priceLabel(order.amount, order.currency)), actions); root.append(row);
  });
}
function receipt(order) {
  selectedOrder = order; const root = $('#shop-receipt-facts'); root.replaceChildren();
  for (const [label, value] of [[t('orderId'), order.orderId], [t('captureId'), order.captureId || t('notReturned')], [t('product'), order.items?.[0] ? localizedOrderItem(order.items[0]) : order.productName || t('product')], [t('quantity'), order.quantity || 1], [t('subtotal'), priceLabel(order.amount, order.currency)], [t('paymentStatus'), statusLabel(order.status)]]) root.append(node('dt', '', label), node('dd', '', value));
  if (order.status === 'COMPLETED') root.append(node('dt', '', t('fulfillment')), node('dd', '', t(order.fulfillment === 'FULFILLED' ? 'fulfilled' : 'unfulfilled')));
  if (order.tracking) root.append(node('dt', '', t('tracking')), node('dd', '', order.tracking));
  if (order.shipping) root.append(node('dt', '', t('shipTo')), node('dd', '', [order.shipping.name, ...Object.values(order.shipping.address)].filter(Boolean).join(', ')));
  for (const item of order.items || []) root.append(node('dt', '', localizedOrderItem(item)), node('dd', '', item.quantity + ' × ' + priceLabel(item.price)));
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
    const link = document.createElement('a'); link.href = url; link.download = 'tradeweave-sandbox-' + receipt.orderId + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    state.requestKey = null; cartQuote = null; persist();
    await refreshOrders(); lockCheckout(false); renderPending(); renderCart();
    history.pushState(null, '', '#orders'); showPage(true);
    toast(t('paymentReturned', { status: statusLabel(result.status) }));
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
  history.replaceState(null, '', '#cart'); showPage(); lockCheckout(true); $('#shop-buy').setAttribute('aria-busy', 'true');
  try {
    if (!state.openCheckout && !recoveringCreation) {
      const displayed = cartTotal(), quote = await api('/api/cart/quote', { method: 'POST', body: JSON.stringify({ items: state.cart }) }); cartQuote = quote; renderCart();
      if (displayed !== quote.amount) { $('#shop-cart-message').textContent = t('priceChanged'); lockCheckout(false); return; }
    }
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
            if (activeCheckout.amount !== expected || activeCheckout.currency !== 'USD') throw new Error(t('checkoutSaved'));
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
    $('#shop-checkout-note').textContent = t(state.openCheckout ? 'checkoutResumeNote' : 'checkoutReview');
    lockCheckout(false);
  } catch (error) { lockCheckout(Boolean(state.pendingCheckout)); $('#shop-checkout-note').textContent = error.message; toast(error.message); }
  finally { $('#shop-buy').setAttribute('aria-busy', 'false'); updateCartControls(); }
}
$('#shop-buy').addEventListener('click', beginCheckout);
$('#shop-resume-checkout').addEventListener('click', beginCheckout);
$('#shop-cancel-checkout').addEventListener('click', cancelCheckout);
async function cancelCheckout() {
  if (!activeCheckout) return;
  try { await api('/api/paypal/cancel', { method: 'POST', body: JSON.stringify({ orderId: activeCheckout.id, checkoutToken: activeCheckout.checkoutToken }) }); activeCheckout = null; state.openCheckout = null; state.pendingCheckout = null; state.requestKey = null; cartQuote = null; persist(); lockCheckout(false); renderPending(); renderCart(); await refreshOrders(); toast(t('checkoutCancel')); }
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
    translateStatic(); $('#shop-checkout-note').textContent = activeCheckout ? t('checkoutReview') : config.paypalReady ? t('sandboxBuyer') : t('checkoutUnavailable');
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
    link.append(picture, node('h2', '', localize(item.name)), node('p', '', localize(item.subtitle)), node('strong', '', (item.variants.length ? t('from') + ' ' : '') + priceLabel(item.price, item.currency)), node('small', '', item.stock ? t('viewProduct') : t('soldOut'))); root.append(link);
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
  const imageNote = $('#shop-image-note');
  imageNote.hidden = !product.isFictionalSample || !product.images.length;
  imageNote.textContent = imageNote.hidden ? '' : t('generatedSampleImages');
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
    const summary = (order.items || []).map(item => item.quantity + ' × ' + (localizedOrderItem(item) || t('unavailable'))).join(' · ') || order.productName || t('savedCheckout');
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
  $('#shop-buy').hidden = paypalMounted && Boolean(items.length) && !invalid && config.paypalReady && !state.pendingCheckout;
  $('#shop-paypal').hidden = !paypalMounted || !items.length || invalid || !config.paypalReady || Boolean(state.pendingCheckout);
  $('#shop-paypal').style.pointerEvents = busy ? 'none' : '';
  $('#shop-cart-count').textContent = state.cart.reduce((sum, i) => sum + i.quantity, 0); $('#shop-cart-count').hidden = !state.cart.length;
}
function changeCart(index, difference) {
  if (busy || activeCheckout) return;
  state.cart[index].quantity += difference; state.requestKey = null; cartQuote = null; recoveringCreation = null; persist(); renderCart();
}
function renderCart() {
  const root = $('#shop-cart-list'), items = cartItems(); root.replaceChildren(); $('#shop-cart-message').textContent = '';
  if (!items.length) root.append(node('p', 'shop-order-empty', t('emptyCart')));
  items.forEach((item, index) => {
    const row = node('article', 'shop-cart-row'), details = node('div', 'shop-cart-item-info');
    details.append(node('strong', '', item.name), node('span', '', priceLabel(item.price) + ' · ' + t('each')));
    if (item.unavailable || !activeCheckout && item.quantity > item.stock) details.append(node('p', 'cart-item-error', item.unavailable ? t('unavailableItem') : t('stockShort', { stock: item.stock })));
    const controls = node('div', 'cart-item-controls'), stepper = node('div', 'qty-stepper'); stepper.setAttribute('aria-label', t('quantityFor', { product: item.name }));
    const minus = node('button', '', '−'), plus = node('button', '', '+'); minus.type = plus.type = 'button'; minus.setAttribute('aria-label', t('decreaseProduct', { product: item.name })); plus.setAttribute('aria-label', t('increaseProduct', { product: item.name }));
    minus.disabled = busy || Boolean(activeCheckout) || item.quantity <= 1; plus.disabled = busy || Boolean(activeCheckout) || item.quantity >= Math.min(5, item.stock || 0);
    minus.addEventListener('click', () => changeCart(index, -1)); plus.addEventListener('click', () => changeCart(index, 1)); stepper.append(minus, node('span', '', item.quantity), plus);
    const remove = node('button', 'text-button', t('remove')); remove.type = 'button'; remove.setAttribute('aria-label', t('remove') + ' ' + item.name); remove.disabled = busy || Boolean(activeCheckout); remove.addEventListener('click', () => { state.cart.splice(index, 1); state.requestKey = null; cartQuote = null; persist(); renderCart(); }); controls.append(stepper, remove);
    row.append(details, controls, node('strong', 'cart-item-total', priceLabel(Number(item.price) * item.quantity))); root.append(row);
  });
  $('#shop-cart-total').textContent = priceLabel(activeCheckout?.amount || cartTotal()); updateCartControls(); updateFxNotes();
}
$('#shop-add-cart').addEventListener('click', () => {
  if (!product || !quantity || busy || activeCheckout) return;
  const found = state.cart.find(i => i.productId === product.id && (i.variantId || null) === (selectedVariant?.id || null));
  if (found && found.quantity + quantity > Math.min(5, selectedVariant ? selectedVariant.stock : product.stock)) { toast(t('maxCartQty')); return; }
  if (!found && state.cart.length >= 20) { toast(t('cartLimit')); return; }
  if (found) found.quantity += quantity; else state.cart.push({ productId: product.id, variantId: selectedVariant?.id || null, quantity });
  state.requestKey = null; cartQuote = null; persist(); renderCart(); addedToCart = true;
  $('#shop-product-note').textContent = t('toastAdded'); $('#shop-add-confirmation').hidden = false;
});
async function refreshOrders() {
  $('#shop-refresh-orders').disabled = true;
  try {
    const result = await api('/api/buyer/orders'); state.orders = result.orders; persist(); renderOrders();
    if (!activeCheckout && state.requestKey) { const attempt = result.orders.find(o => o.requestKey === state.requestKey); if (attempt && terminalCheckoutStatuses.has(attempt.status)) { state.requestKey = null; persist(); } }
    $('#shop-orders-status').textContent = t('ordersLoaded');
    if (activeCheckout) {
      const saved = result.orders.find(o => o.paypalOrderId === activeCheckout.id);
      if (saved && terminalCheckoutStatuses.has(saved.status)) { if (saved.status === 'COMPLETED') state.cart = []; activeCheckout = null; state.pendingCheckout = null; state.openCheckout = null; state.requestKey = null; cartQuote = null; lockCheckout(false); persist(); renderCart(); }
    }
  } catch (error) { $('#shop-orders-status').textContent = t('orderRefreshError') + ' ' + error.message; }
  finally { $('#shop-refresh-orders').disabled = false; renderPending(); }
}
$('#shop-refresh-orders').addEventListener('click', refreshOrders);
function resumeOrder(order) {
  if ((busy || activeCheckout) && activeCheckout?.id !== order.paypalOrderId) { toast(t('resolveCheckout')); return; }
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
