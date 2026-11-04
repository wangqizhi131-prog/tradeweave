const $ = (selector, root = document) => root.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'tradeweave-workspace-v2';
const pageTitles = { overview: 'Overview', products: 'Products', assistant: 'AI assistant', orders: 'Orders', insights: 'Insights' };
const factFields = [
  ['material', 'Material', '材质'], ['production', 'Production', '制作方式'],
  ['madeIn', 'Made in', '产地'], ['dimensions', 'Dimensions', '尺寸'],
  ['care', 'Care', '保养'], ['dispatch', 'Dispatch', '发货时间'],
  ['shippingPrice', 'Shipping price', '运费'], ['arrivalDateGuarantee', 'Arrival guarantee', '送达日期承诺']
];
const productLanguages = [['en', 'English', 'en'], ['zh', '中文', 'zh-CN'], ['ja', '日本語', 'ja'], ['es', 'Español', 'es'], ['fr', 'Français', 'fr']];
let saved = {};
try { saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}') || {}; } catch {}
const state = {
  selectedProductId: typeof saved.selectedProductId === 'string' ? saved.selectedProductId : null,
  language: saved.language === 'Chinese' ? 'Chinese' : 'English',
  replyLanguage: saved.replyLanguage === 'Chinese' ? 'Chinese' : 'English',
  history: Array.isArray(saved.history) ? saved.history.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string').slice(-30) : [],
  orders: [],
  metrics: { answers: 0, checkouts: 0, completed: 0 },
  activity: Array.isArray(saved.activity) ? saved.activity.filter(a => a && typeof a.text === 'string' && typeof a.at === 'string').slice(0, 25) : [],
  answers: Number.isInteger(saved.answers) && saved.answers >= 0 ? saved.answers : 0,
  checkouts: Number.isInteger(saved.checkouts) && saved.checkouts >= 0 ? saved.checkouts : 0,
  pendingCheckout: saved.pendingCheckout?.checkoutToken ? saved.pendingCheckout : null
};
let config = { paypalClientId: '', paypalReady: false, aiReady: false };
let aiProviderState = 'unchecked';
let store = null, product = null, assistantBusy = false, catalogDetail = false, editorUploading = false;
let selectedOrder = null, toastTimer;
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function persist() { try { sessionStorage.setItem(storageKey, JSON.stringify({ ...state, orders: [] })); } catch {} }
function showToast(text) {
  $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4200);
}
function logActivity(text, kind = 'info') {
  state.activity.unshift({ text, kind, at: new Date().toISOString() });
  state.activity = state.activity.slice(0, 25); persist(); renderActivity();
}
function money(value, currency = product?.currency || 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value));
}
function localized(value, language = state.language) { return value?.[language === 'Chinese' ? 'zh' : 'en'] || ''; }
function factValue(key, language = 'English') { return localized(product?.facts[key], language) || (language === 'Chinese' ? '卖家尚未提供' : 'Not supplied by the seller'); }
function suppliedFacts() { return factFields.filter(([key]) => product?.facts[key]?.en).length; }
function timeLabel(at) {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}
function statusLabel(status) { return ({ CREATING: 'Creating checkout', CREATED: 'Awaiting approval', APPROVED: 'Approved', CAPTURE_PENDING: 'Confirmation needed', COMPLETED: 'Completed', PENDING: 'Pending', DECLINED: 'Declined', DENIED: 'Denied', CANCELLED: 'Cancelled', FAILED: 'Failed', PARTIALLY_REFUNDED: 'Partially refunded', REFUNDED: 'Refunded' })[status] || status || 'Unconfirmed'; }
function openDialog(id) { $$('dialog[open]').forEach(dialog => dialog.close()); const dialog = $('#' + id); dialog.showModal(); const body = dialog.querySelector('.editor-body'); if (body) body.scrollTop = 0; const orderContent = dialog.querySelector('.order-dialog-content'); if (orderContent) orderContent.scrollTop = 0; }
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { ...options, signal: AbortSignal.timeout(35000), cache: 'no-store', headers: { 'content-type': 'application/json', ...options.headers } });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'This took too long. Check your connection and try again.' : 'Could not reach the service. Check your connection and try again.');
  }
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'The request could not be completed.'); error.status = response.status; throw error; }
  return data;
}
function positionNavIndicator(animate = false) {
  const active = $('.side-nav .nav-item.active'); if (!active) return;
  const indicator = $('.nav-indicator');
  indicator.style.transition = animate && !reducedMotion.matches ? '' : 'none';
  indicator.style.width = active.offsetWidth + 'px'; indicator.style.height = active.offsetHeight + 'px';
  indicator.style.transform = 'translate3d(' + active.offsetLeft + 'px,' + active.offsetTop + 'px,0)';
}
function showPage(page, scroll = true, animate = false) {
  const target = Object.hasOwn(pageTitles, page) ? page : 'overview';
  $$('[data-view]').forEach(view => {
    const active = view.dataset.view === target, arriving = active && view.hidden;
    view.getAnimations().forEach(animation => animation.cancel()); view.hidden = !active; view.classList.toggle('active', active);
    if (arriving && animate && !reducedMotion.matches) view.animate([{ opacity: .7, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  $$('.nav-item[data-page-link]').forEach(link => {
    const active = link.dataset.pageLink === target; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#breadcrumb-page').textContent = pageTitles[target]; document.title = pageTitles[target] + ' · TradeWeave'; positionNavIndicator(animate);
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
}
document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open]');
  if (opener) { openDialog(opener.dataset.open); return; }
  if (event.target.closest('[data-close]')) { event.target.closest('dialog').close(); return; }
  if (event.target.closest('.skip-link')) { event.preventDefault(); $('#main-content').focus(); return; }
  const link = event.target.closest('[data-page-link]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); $$('dialog[open]').forEach(dialog => dialog.close()); if ($('#activity-popover').matches(':popover-open')) $('#activity-popover').hidePopover();
  const page = link.dataset.pageLink;
  if (location.hash !== '#' + page) history.pushState(null, '', '#' + page);
  showPage(page, true, event.detail !== 0);
});
addEventListener('popstate', () => showPage(location.hash.slice(1), false));
addEventListener('hashchange', () => showPage(location.hash.slice(1), false));
document.addEventListener('keydown', event => {
  if (event.key === '?' && !event.target.closest('input,textarea,select,[contenteditable]') && !$('dialog[open]')) openDialog('help-dialog');
});
new ResizeObserver(() => positionNavIndicator()).observe($('.side-nav'));
document.fonts.ready.then(() => positionNavIndicator());
showPage(location.hash.slice(1) || 'overview', false);
$('#workspace-date').textContent = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date());
function updateOnlineState() { $('#connection-banner').hidden = navigator.onLine; }
addEventListener('online', updateOnlineState); addEventListener('offline', updateOnlineState); updateOnlineState();
function renderActivity() {
  for (const [selector, limit] of [['#overview-activity', 3], ['#all-activity', 15]]) {
    const root = $(selector); root.replaceChildren();
    if (!state.activity.length) { root.append(element('p', 'quiet-empty', 'A fresh start. Your assistant and checkout activity will appear here.')); continue; }
    state.activity.slice(0, limit).forEach(item => {
      const row = element('div', 'activity-entry');
      row.append(element('span', 'activity-dot ' + (item.kind || '')), element('p', '', item.text), element('time', '', timeLabel(item.at))); root.append(row);
    });
  }
}
function renderReadiness() {
  const root = $('#readiness-list'); root.replaceChildren();
  const aiStatusCopy = aiProviderState === 'responded' ? 'A live request responded in this session' : aiProviderState === 'failed' ? 'The last request failed · check the connection and retry' : 'Credentials set · live service not checked';
  const items = [
    ['Product story', product ? suppliedFacts() + ' facts supplied · ' + (factFields.length - suppliedFacts()) + ' still to confirm' : 'Product facts could not be loaded', Boolean(product), 'facts', Boolean(product)],
    ['Product assistant', config.aiReady ? aiStatusCopy : 'Connect a model to answer buyer questions', config.aiReady, 'assistant', config.aiReady && aiProviderState === 'responded'],
    ['PayPal checkout', config.paypalReady ? 'Sandbox credentials set · checkout not tested this session' : 'Add sandbox credentials to try checkout', config.paypalReady, 'checkout', false]
  ];
  items.forEach(([title, copy, configured, action, confirmed]) => {
    const ready = confirmed;
    const row = element('div', 'readiness-row'), mark = element('span', ready ? 'readiness-mark ready' : 'readiness-mark');
    mark.innerHTML = ready ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg>' : '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="M10 7v4m0 2h.01"/></svg>';
    mark.setAttribute('aria-label', ready ? action === 'assistant' ? 'Live response received this session' : 'Configured' : configured ? action === 'assistant' ? 'Credentials configured, live response not verified' : 'Sandbox credentials configured, live checkout not verified' : 'Setup needed');
    const words = element('div'); words.append(element('strong', '', title), element('p', '', copy));
    const button = element('button', 'text-button', action === 'facts' ? 'Review' : configured ? 'Open' : 'Set up'); button.type = 'button';
    button.addEventListener('click', () => {
      if (action === 'facts' && product) openDialog('edit-dialog');
      else if (!configured) openDialog('help-dialog');
      else if (action === 'checkout') location.href = '/shop?preview=1#catalog';
      else location.hash = 'assistant';
    });
    row.append(mark, words, button); root.append(row);
  });
  const completed = state.metrics.completed;
  for (const [id, value] of [['overview-answers', state.metrics.answers], ['overview-orders', completed], ['overview-facts', product ? suppliedFacts() + '/' + factFields.length : '—'], ['insight-answers', state.metrics.answers], ['insight-checkouts', state.metrics.checkouts], ['insight-orders', completed]]) $('#' + id).textContent = value;
  $('#help-connections').replaceChildren();
  const aiSetup = config.aiReady ? aiProviderState === 'responded' ? 'Responded this session' : aiProviderState === 'failed' ? 'Last request failed' : 'Credentials set · not tested' : 'Not configured';
  for (const [label, status, confirmed] of [['AI model', aiSetup, aiProviderState === 'responded'], ['PayPal sandbox', config.paypalReady ? 'Credentials set · checkout not tested' : 'Not configured', false]]) {
    const row = element('div'); row.append(element('span', '', label), element('strong', confirmed ? 'status-good' : 'status-pending', status)); $('#help-connections').append(row);
  }
}
function renderProduct() {
  if (!product) return;
  const chinese = state.language === 'Chinese';
  $('.product-details').lang = chinese ? 'zh-CN' : 'en'; $('#listing-language').textContent = chinese ? '中文 / EN' : 'English / 中文';
  $('#product-name').textContent = localized(product.name); $('#product-subtitle').textContent = localized(product.subtitle); $('#product-description').textContent = localized(product.description);
  $('#product-price').textContent = money(product.price, product.currency, chinese ? 'zh-CN' : 'en-US'); $('#product-currency').textContent = chinese ? '' : product.currency;
  $('#tag-one').textContent = localized(product.tags[0]); $('#tag-two').textContent = localized(product.tags[1]); $('#product-dimensions').textContent = localized(product.facts.dimensions);
  $('#product-stock').textContent = product.stock; $('#stock-label').textContent = product.isFictionalSample ? (chinese ? '示例库存' : 'sample stock') : (chinese ? '件有货' : 'in stock');
  const availability = $('.product-status'); availability.replaceChildren(element('span', 'product-status-dot'), document.createTextNode(product.status !== 'active' ? ' ' + product.status : product.stock ? (chinese ? ' 店铺在售' : ' Available to buyers') : (chinese ? ' 暂时售罄' : ' Sold out')), element('span', 'tiny-divider', '/'), element('span', '', 'EN · 中文'));
  availability.classList.toggle('sold-out', !product.stock);
  $('#facts-dialog-title').textContent = chinese ? '商品资料' : 'Product facts';
  $('#facts-dialog-copy').textContent = chinese ? '商品页、AI 助手和 PayPal 订单读取同一份资料。当前商品为虚构示例。' : 'The listing, AI assistant and PayPal order share these seller facts. This product is a fictional example.';
  const factsRoot = $('#edit-dialog .fact-list'); factsRoot.replaceChildren();
  factFields.forEach(([key, en, zh]) => factsRoot.append(element('span', '', chinese ? zh : en), element('b', product.facts[key] ? '' : 'fact-missing', factValue(key, state.language))));
  factsRoot.append(element('span', '', chinese ? '价格' : 'Price'), element('b', '', money(product.price, product.currency, chinese ? 'zh-CN' : 'en-US')));
  $('#edit-dialog .primary-button').textContent = chinese ? '完成' : 'Done';
  $('#chat-product-name').textContent = product.name.en;
  const art = $('.product-art'), image = art.querySelector('img'); if (image) image.remove();
  art.setAttribute('aria-label', product.images.length ? 'Product photo of ' + product.name.en : product.id === 'coast-tote' ? 'Illustration of a woven market tote' : 'No product image supplied');
  $$('.product-art .tote, .product-art .art-stamp, .product-art .art-label').forEach(item => item.toggleAttribute('hidden', Boolean(product.images.length) || product.id !== 'coast-tote'));
  let missingImage = art.querySelector('.catalog-no-image'); if (!missingImage) { missingImage = element('p', 'catalog-no-image', 'No product image supplied'); art.append(missingImage); }
  missingImage.hidden = Boolean(product.images.length) || product.id === 'coast-tote';
  if (product.images.length) { const photo = element('img', 'merchant-product-image'); photo.src = product.images[0]; photo.alt = product.name.en; art.append(photo); }
  $$('a[href^="/shop?preview=1"]').forEach(link => { if (link.closest('.merchant-product-actions')) { link.textContent = product.status === 'active' ? 'Preview buyer storefront' : 'Set active to preview storefront'; if (product.status === 'active') { link.href = '/shop?preview=1&item=' + encodeURIComponent(product.id) + '#product'; link.removeAttribute('aria-disabled'); } else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); } } });
  $('#assistant-facts').replaceChildren();
  factFields.filter(([key]) => product.facts[key]).forEach(([key, en]) => $('#assistant-facts').append(element('dt', '', en), element('dd', '', factValue(key))));
  const missing = factFields.filter(([key]) => !product.facts[key]).map(([, en]) => en.toLowerCase());
  $('#assistant-unknown').textContent = missing.length ? missing.join(' and ') + ' still need seller confirmation.' : 'All listed facts have been supplied.';
  $('#facts-count').textContent = suppliedFacts() + ' of ' + factFields.length + ' supplied';
  $('#coverage-list').replaceChildren();
  factFields.forEach(([key, en]) => {
    const row = element('div', 'coverage-row'), text = element('div'); text.append(element('strong', '', en), element('p', '', factValue(key)));
    row.append(text, element('span', product.facts[key] ? 'fact-state supplied' : 'fact-state missing', product.facts[key] ? 'Supplied' : 'To confirm')); $('#coverage-list').append(row);
  });

}
function renderStore(data) {
  store = data;
  const next = data.savedProductId || state.selectedProductId;
  product = data.products.find(p => p.id === next) || data.products[0] || null;
  if (product && state.selectedProductId !== product.id) { state.history = []; state.selectedProductId = product.id; persist(); }
  renderCatalog();
  $('#store-location').textContent = data.shop.location; $('#store-region-label').textContent = data.shop.regionLabel; $('#store-name').textContent = data.shop.name;
  $('#store-avatar').textContent = data.shop.name.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  $('#store-account-label').textContent = data.shop.isFictionalSample ? 'Maker account · sample' : 'Maker account';
  $('.art-label').textContent = data.shop.name.toUpperCase() + ' / MAKER STUDIO';
  if (!$('#overview-art .tote')) { const art = $('.tote').cloneNode(true); art.removeAttribute('hidden'); $('#overview-art').prepend(art); }
  $('#store-dialog-copy').textContent = data.shop.isFictionalSample ? 'A fictional maker shop for exploring the TradeWeave buyer journey.' : 'Your maker workspace.';
  $('#store-summary').replaceChildren(element('dt', '', 'Shop'), element('dd', '', data.shop.name), element('dt', '', 'Location'), element('dd', '', data.shop.location), element('dt', '', 'Checkout'), element('dd', '', 'PayPal sandbox'));
  renderProduct();
}
$('#listing-language').addEventListener('click', () => { state.language = state.language === 'English' ? 'Chinese' : 'English'; persist(); renderProduct(); });
$('#insights-facts').addEventListener('click', () => openDialog('edit-dialog'));

// Local merchant editing uses the same server facts as every buyer-facing view.
let editorDraft = null, editorOriginal = '', editorRevision = '', editorSection = 'story', editorSaving = false;
const storyFields = [['name', 'Product name', 100], ['subtitle', 'Subtitle', 160], ['description', 'Description', 1200], ['tags.0', 'First tag', 40], ['tags.1', 'Second tag', 40]];
function editorValue(path) { return path.split('.').reduce((value, key) => value?.[key], editorDraft); }
function setEditorValue(path, value) {
  const parts = path.split('.'), key = parts.pop();
  const parent = parts.reduce((value, part) => value[part], editorDraft); parent[key] = value;
}
function editorDirty() { return editorDraft && JSON.stringify(editorDraft) !== editorOriginal; }
function updateEditorStatus() {
  $('#editor-save').disabled = editorSaving || editorUploading || !editorDirty();
  $('#editor-status').textContent = editorUploading ? 'Uploading product images…' : editorSaving ? 'Saving product details…' : editorDirty() ? 'Unsaved changes · translations are saved together.' : editorDraft?.id ? 'Saved locally · fictional sample product.' : 'New draft · not saved or visible to buyers.';
}
function renderEditorFields() {
  const language = $('#editor-language').value, root = $('#editor-fields'); root.replaceChildren();
  $('#editor-media').hidden = editorSection !== 'media'; root.hidden = editorSection === 'media';
  if (editorSection === 'media') { $('#editor-section-copy').textContent = 'Use your own product images and define the options buyers can choose.'; renderEditorMedia(); }
  $$('[data-editor-section]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.editorSection === editorSection)));
  if (editorSection === 'media') return;
  $('#editor-section-copy').textContent = editorSection === 'story' ? (editorDraft.status === 'draft' ? 'Drafts can be incomplete. Add an English name to save; English and Chinese are required before publishing. Other translations are optional.' : 'Write a clear story in English and Chinese, then add Japanese, Spanish or French where available.') : 'Only add details you can support. Blank facts stay unknown; optional language fields fall back to English or Chinese.';
  $$('[data-editor-section]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.editorSection === editorSection)));
  const fields = editorSection === 'story' ? storyFields : factFields.map(([key, en, zh]) => ['facts.' + key, language === 'zh' ? zh : en, 300]);
  fields.forEach(([path, title, max]) => {
    const label = element('label', path === 'description' ? 'editor-wide' : '', title);
    const input = element(path === 'description' || ['facts.care', 'facts.dispatch', 'facts.arrivalDateGuarantee'].includes(path) ? 'textarea' : 'input');
    input.id = 'editor-field-' + path.replaceAll('.', '-'); label.htmlFor = input.id; input.name = path + '.' + language;
    input.lang = productLanguages.find(item => item[0] === language)?.[2] || 'en'; input.maxLength = max; input.value = editorValue(input.name) || '';
    if (input.tagName === 'TEXTAREA') input.rows = path === 'description' ? 3 : 2;
    if (editorSection === 'story') input.required = ['en', 'zh'].includes(language) && (editorDraft.status === 'active' && !path.startsWith('tags.') || path === 'name' && language === 'en');
    else input.placeholder = language === 'zh' ? '尚未提供' : ['en', 'zh'].includes(language) ? 'Not supplied' : 'Optional translation';
    input.addEventListener('input', () => { setEditorValue(input.name, input.value); updateEditorStatus(); });
    label.append(input); root.append(label);
  });
}
function resetEditor(candidate = product) {
  editorDraft = structuredClone(candidate);
  for (const [key] of factFields) editorDraft.facts[key] ||= Object.fromEntries(productLanguages.map(([language]) => [language, '']));
  editorOriginal = JSON.stringify(editorDraft); editorRevision = store.revision;
  $('#editor-price').value = editorDraft.price; $('#editor-stock').value = editorDraft.stock; $('#editor-sale-status').value = editorDraft.status; updateEditorCommerce();
  $('#editor-error').hidden = true; $('#editor-reload').hidden = true; $('#editor-discard').hidden = true;
  renderEditorFields(); updateEditorStatus();
}
$('#edit-product').addEventListener('click', () => {
  if (!product) { showToast('Product details are not available yet. Refresh setup status.'); return; }
  if (!config.editorReady) { openDialog('edit-dialog'); return; }
  if (assistantBusy) { showToast('Finish the active answer before editing the product.'); return; }
  editorSection = 'story'; $('#editor-language').value = state.language === 'Chinese' ? 'zh' : 'en'; resetEditor(); openDialog('product-editor');
});
$('#editor-language').addEventListener('change', renderEditorFields);
$$('[data-editor-section]').forEach(button => button.addEventListener('click', () => { editorSection = button.dataset.editorSection; renderEditorFields(); }));
for (const key of ['price', 'stock']) $('#editor-' + key).addEventListener('input', event => {
  editorDraft[key] = key === 'stock' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value; updateEditorStatus();
});
function closeEditor() {
  if (editorSaving || editorUploading) return;
  if (editorDirty()) { $('#editor-discard').hidden = false; $('#editor-discard-confirm').focus(); }
  else $('#product-editor').close();
}
$('#editor-close').addEventListener('click', closeEditor); $('#editor-cancel').addEventListener('click', closeEditor);
$('#product-editor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('#editor-discard-confirm').addEventListener('click', () => { if (!editorSaving && !editorUploading) $('#product-editor').close(); });
$('#editor-keep').addEventListener('click', () => { $('#editor-discard').hidden = true; $('#editor-save').focus(); });
$('#editor-reload').addEventListener('click', async () => {
  const button = $('#editor-reload'); button.disabled = true;
  try { renderStore(await api('/api/workspace/store')); renderReadiness(); resetEditor(); }
  catch (error) { $('#editor-error').textContent = error.message; $('#editor-error').hidden = false; }
  finally { button.disabled = false; }
});
function validateEditor() {
  if (editorDraft.status === 'active' && !editorDraft.variants.length && Number(editorDraft.price) < .01) { $('#editor-error').textContent = 'Set a unit price of at least US$0.01 before making this product available to buyers.'; $('#editor-error').hidden = false; $('#editor-price').focus(); return false; }
  for (const key of ['price', 'stock']) if (!$('#editor-' + key).reportValidity()) return false;
  const fields = [...storyFields, ...factFields.map(([key, en]) => ['facts.' + key, en, 300])];
  for (const [path, title, max] of fields) {
    const value = editorValue(path), required = !path.startsWith('facts.') && !path.startsWith('tags.');
    if (editorDraft.status !== 'active') { if (path === 'name' && !value.en.trim()) { editorSection = 'story'; $('#editor-language').value = 'en'; renderEditorFields(); $('#editor-field-name').focus(); $('#editor-error').textContent = 'Give the draft an English product name.'; $('#editor-error').hidden = false; return false; } continue; }
    if (!required && !value.en.trim() && !value.zh.trim()) continue;
    for (const language of ['en', 'zh']) if (!value[language].trim() || value[language].trim().length > max) {
      editorSection = required ? 'story' : 'facts'; $('#editor-language').value = language; renderEditorFields();
      const input = $('#editor-field-' + path.replaceAll('.', '-'));
      $('#editor-error').textContent = title + ' needs text in both English and Chinese (up to ' + max + ' characters each).'; $('#editor-error').hidden = false;
      input.focus(); input.setCustomValidity('Complete this language before saving.'); input.reportValidity();
      input.addEventListener('input', () => input.setCustomValidity(''), { once: true }); return false;
    }
  }
  if (editorDraft.variants.length) { for (const v of editorDraft.variants) if (!v.name.en.trim() || editorDraft.status === 'active' && !v.name.zh.trim() || !Number.isInteger(v.stock) || v.stock < 0 || v.stock > 9999 || !/^\d{1,6}(\.\d{1,2})?$/.test(v.price) || Number(v.price) < (editorDraft.status === 'active' ? .01 : 0)) { editorSection = 'media'; renderEditorFields(); $('#editor-error').textContent = 'Complete variant names, prices and whole-number stock before saving.'; $('#editor-error').hidden = false; return false; } }
  return true;
}
$('#product-form').addEventListener('submit', async event => {
  event.preventDefault(); if (editorSaving || editorUploading || !editorDirty()) return;
  $('#editor-error').hidden = true; $('#editor-discard').hidden = true;
  if (!validateEditor()) return;
  editorSaving = true; updateEditorStatus(); $('#product-form').setAttribute('aria-busy', 'true');
  // Freeze the form while the exact draft is being persisted.
  $$('#product-form input, #product-form textarea, #product-form select, #product-form button').forEach(control => control.disabled = true);
  try {
    const data = await api('/api/store/product', { method: 'POST', headers: { 'x-editor-token': config.editorToken }, body: JSON.stringify({ revision: editorRevision, product: editorDraft, create: !editorDraft.id }) });
    catalogDetail = true; renderStore(data); renderReadiness(); editorOriginal = JSON.stringify(editorDraft); $('#product-editor').close();
    logActivity('Product details saved. Listing, assistant facts and checkout are up to date.', 'success');
    showToast('Product saved. New questions and checkouts use the updated details.');
  } catch (error) {
    $('#editor-error').textContent = error.message; $('#editor-error').hidden = false; $('#editor-reload').hidden = error.status !== 409;
  } finally {
    editorSaving = false; $('#product-form').setAttribute('aria-busy', 'false');
    $$('#product-form input, #product-form textarea, #product-form select, #product-form button').forEach(control => control.disabled = false); updateEditorStatus();
  }
});
function renderConversation() {
  const root = $('#conversation'); root.replaceChildren();
  if (!state.history.length) {
    const welcome = element('div', 'conversation-welcome');
    welcome.append(element('span', 'welcome-monogram', 'tw.'), element('h3', '', 'The story behind the things you love.'), element('p', '', 'Ask about how it is made, everyday care, or the details to confirm before checkout.'));
    root.append(welcome);
  }
  state.history.forEach(message => {
    const row = element('div', message.role === 'user' ? 'user-message' : 'assistant-message');
    if (message.isError) row.classList.add('is-error');
    const content = element('div', 'message-content');
    content.append(element('span', 'message-author', message.role === 'user' ? 'You' : message.isError ? 'Connection notice' : 'TradeWeave assistant'), element('p', '', message.text));
    row.append(content); root.append(row);
  });
  root.scrollTop = root.scrollHeight;
  $('#clear-chat').disabled = assistantBusy || !state.history.length;
}
function addMessage(role, text, isError = false) {
  state.history.push({ role, text, isError }); state.history = state.history.slice(-30); persist(); renderConversation();
}
function renderAssistantStatus(text) {
  $('#assistant-status').classList.toggle('connected', config.aiReady && aiProviderState === 'responded' && !assistantBusy);
  $('#assistant-status').classList.toggle('unavailable', config.aiReady && aiProviderState === 'failed' && !assistantBusy);
  $('#assistant-status').classList.toggle('loading', assistantBusy);
  $('#assistant-status-text').textContent = text || (!config.aiReady ? 'AI setup needed · open the setup guide to connect a model' : aiProviderState === 'responded' ? 'Provider responded · seller facts supplied with each question' : aiProviderState === 'failed' ? 'Last request failed · your question is saved; retry when available' : 'Credentials set · live provider not checked');
}
async function askAssistant(question) {
  if (assistantBusy || !question.trim()) return;
  if (!product) { showToast('Product facts have not loaded. Refresh setup status to try again.'); return; }
  const history = state.history.filter(m => !m.isError).slice(-10).map(m => ({ role: m.role, content: m.text.slice(0, 1800) }));
  const replyLanguage = state.replyLanguage;
  addMessage('user', question);
  if (!config.aiReady) {
    addMessage('assistant', 'The live assistant is not connected yet. Open Setup guide to connect an AI model, then try your question again.', true);
    renderAssistantStatus(); return;
  }
  assistantBusy = true; $('#chat-form').classList.add('loading'); $('#chat-form').setAttribute('aria-busy', 'true');
  $$('#chat-form button, .suggestion-chip, #clear-chat, #reply-language').forEach(button => button.disabled = true);
  renderAssistantStatus('Reading the product facts…');
  try {
    const data = await api('/api/assistant', { method: 'POST', headers: { 'x-editor-token': config.editorToken }, body: JSON.stringify({ productId: product.id, question, language: replyLanguage, history }) });
    aiProviderState = 'responded'; addMessage('assistant', data.answer); persist(); logActivity('The assistant answered a product question.', 'success'); renderReadiness();
  } catch (error) {
    aiProviderState = 'failed'; addMessage('assistant', error.message + ' Your question is saved here; you can try it again.', true);
    logActivity('An assistant request needs another try.', 'warning'); renderReadiness();
  } finally {
    assistantBusy = false; $('#chat-form').classList.remove('loading'); $('#chat-form').setAttribute('aria-busy', 'false');
    $$('#chat-form button, .suggestion-chip, #clear-chat, #reply-language').forEach(button => button.disabled = false);
    renderAssistantStatus(); $('#chat-input').focus();
  }
}
$('#chat-form').addEventListener('submit', event => {
  event.preventDefault(); const question = $('#chat-input').value.trim(); if (!question || assistantBusy) return;
  $('#chat-input').value = ''; askAssistant(question);
});
$$('.suggestion-chip').forEach(button => button.addEventListener('click', () => askAssistant(button.dataset.prompt)));
$('#clear-chat').addEventListener('click', () => { state.history = []; persist(); renderConversation(); $('#chat-input').focus(); showToast('A fresh conversation is ready.'); });
$('#reply-language').value = state.replyLanguage;
$('#reply-language').addEventListener('change', event => { state.replyLanguage = event.target.value; persist(); });

function renderOrders() {
  const query = $('#order-search').value.trim().toLowerCase(), filter = $('#order-filter').value;
  const visible = state.orders.filter(order => order.orderId.toLowerCase().includes(query) && (filter === 'all' || order.status === filter));
  const root = $('#orders-list'); root.replaceChildren();
  $('#orders-total').textContent = state.orders.length;
  $('#nav-order-count').textContent = state.orders.length; $('#nav-order-count').hidden = !state.orders.length;
  if (!visible.length) {
    const empty = element('div', 'orders-empty');
    const icon = element('span', 'empty-receipt'); icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14l-3-1-4 1-3-1-3 1V3Z"/><path d="M14 3v5h5M9 12h6M9 16h4"/></svg>';
    empty.append(icon, element('h3', '', state.orders.length ? 'No matching orders' : 'Your first order starts with a story.'), element('p', '', state.orders.length ? 'Try another order ID or choose All statuses.' : 'Complete a PayPal sandbox checkout and its confirmation will appear here.'));
    if (!state.orders.length) {
      const link = element('a', 'primary-button', 'Preview storefront'); link.href = '/shop?preview=1#catalog'; empty.append(link);
    } else {
      const reset = element('button', 'quiet-button', 'Clear filters'); reset.type = 'button';
      reset.addEventListener('click', () => { $('#order-search').value = ''; $('#order-filter').value = 'all'; renderOrders(); }); empty.append(reset);
    }
    root.append(empty); return;
  }
  visible.forEach(order => {
    const row = element('div', 'sandbox-order-row'), info = element('div', 'order-info');
    info.append(element('strong', '', order.items?.length > 1 ? order.items.length + ' products · ' + order.quantity + ' items' : (order.quantity || 1) + ' × ' + (order.productName || product?.name.en || 'Product')), element('span', '', order.orderId));
    if (order.status === 'COMPLETED') info.append(element('span', '', 'Fulfillment · ' + (order.fulfillment === 'FULFILLED' ? 'fulfilled' : 'unfulfilled')));
    const detail = element('button', 'text-button', 'Details'); detail.type = 'button'; detail.addEventListener('click', () => showOrderDetails(order));
    row.append(element('span', 'order-initials', 'TW'), info, element('time', 'order-time', timeLabel(order.createdAt)), element('span', 'order-total', money(order.amount, order.currency)), element('span', order.status === 'COMPLETED' ? 'fact-state supplied' : 'fact-state missing', statusLabel(order.status)), detail);
    root.append(row);
  });
}
function showOrderDetails(order) {
  selectedOrder = order;
  $('#order-dialog-copy').textContent = order.status === 'COMPLETED' ? 'PayPal returned a completed sandbox capture. No real money moved.' : 'PayPal has not returned a completed capture. This order is not shown as paid.';
  const root = $('#order-receipt'); root.replaceChildren();
  for (const [label, value] of [['Order ID', order.orderId], ['Capture ID', order.captureId || 'Not returned'], ['Product', order.productName], ['Quantity', order.quantity], ['Amount', money(order.amount, order.currency) + ' ' + order.currency], ['Status', statusLabel(order.status)]]) root.append(element('dt', '', label), element('dd', '', value));
  $('#merchant-tracking').value = order.tracking || ''; $('#merchant-fulfill').disabled = order.status !== 'COMPLETED'; $('#merchant-reconcile').disabled = !order.paypalOrderId || ['COMPLETED','FAILED','DECLINED','DENIED','REFUNDED'].includes(order.status); $('#merchant-order-message').textContent = '';
  if (order.status === 'COMPLETED') root.append(element('dt', '', 'Fulfillment'), element('dd', '', order.fulfillment || 'UNFULFILLED'));
  root.append(element('dt', '', 'Ship to · sandbox'), element('dd', '', order.shipping ? [order.shipping.name, ...Object.values(order.shipping.address)].filter(Boolean).join(', ') : 'Not returned by PayPal. Confirm before dispatch.'));
  for (const item of order.items || []) root.append(element('dt', '', item.name), element('dd', '', item.quantity + ' × ' + money(item.price)));
  openDialog('order-dialog');
}
$('#order-search').addEventListener('input', renderOrders); $('#order-filter').addEventListener('change', renderOrders);
$('#download-receipt').addEventListener('click', () => {
  if (!selectedOrder) return;
  const blob = new Blob([JSON.stringify({ environment: 'PayPal sandbox', ...selectedOrder }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'tradeweave-sandbox-' + selectedOrder.orderId + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#share-button').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(new URL('/shop#catalog', location.origin).href); $('#copy-link-label').textContent = 'Link copied';
    showToast(location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? 'Local preview link copied. It opens on this computer.' : 'Preview link copied.');
    setTimeout(() => $('#copy-link-label').textContent = 'Copy preview link', 2200);
  } catch { showToast('Copy this page address from your browser to share the preview.'); }
});
function syncBuyerPreview() {
  try {
    const preview = JSON.parse(sessionStorage.getItem('tradeweave-buyer-v1') || 'null');
    if (!preview) return;
    if (preview.legacyMigrated) state.pendingCheckout = null;
    for (const key of ['answers', 'checkouts']) if (Number.isInteger(preview[key]) && preview[key] >= 0) state[key] = preview[key];
    persist(); renderOrders(); renderReadiness();
  } catch {}
}
addEventListener('pageshow', () => { if (product) { syncBuyerPreview(); loadMerchantOrders(); } });
async function initialize() {
  const button = $('#refresh-connections'); button.disabled = true;
  const [configResult, storeResult] = await Promise.allSettled([api('/api/config'), api('/api/workspace/store')]);
  if (configResult.status === 'fulfilled') config = configResult.value;
  else config = { paypalClientId: '', paypalReady: false, aiReady: false };
  if (storeResult.status === 'fulfilled') renderStore(storeResult.value);
  $('#edit-product-label').textContent = config.editorReady ? 'Edit product details' : 'View product facts';
  $('#catalog-add').disabled = !config.editorReady;
  const count = Number(config.aiReady) + Number(config.paypalReady);
  $('#integration-status').textContent = configResult.status === 'rejected' ? 'App unavailable' : count === 2 ? 'Credentials set · not live checked' : 'Setup needed';
  $('.live-dot').classList.add('pending');
  await Promise.allSettled([loadMerchantOrders(), loadInbox()]); syncBuyerPreview(); renderReadiness(); renderAssistantStatus(); renderConversation(); renderOrders(); renderActivity();
  if (!product) renderAssistantStatus('Product facts are unavailable. Refresh setup status to try again.');
  button.disabled = false;
}
$('#refresh-connections').addEventListener('click', async () => { await initialize(); showToast('Setup status refreshed.'); });
renderConversation(); renderOrders(); renderActivity(); initialize();

const sourceLayout = matchMedia('(min-width:1251px)');
function adaptSourcePanel() { $('#source-details').open = sourceLayout.matches; }
sourceLayout.addEventListener('change', adaptSourcePanel);
adaptSourcePanel();

function selectProduct(id, detail = false) {
  if (assistantBusy) { showToast('Wait for the current answer before switching products.'); return; }
  const next = store.products.find(p => p.id === id); if (!next) return;
  if (product?.id !== id) { state.history = []; state.selectedProductId = id; persist(); renderConversation(); }
  product = next; catalogDetail = detail; renderCatalog(); renderProduct(); renderReadiness();
}
function renderCatalog() {
  if (!store) return;
  $('#catalog-list-panel').hidden = catalogDetail; $('#listing').hidden = !catalogDetail || !product;
  const search = $('#catalog-search').value.trim().toLowerCase(), filter = $('#catalog-filter').value;
  const items = store.products.filter(p => (filter === 'all' || p.status === filter) && [p.name.en, p.name.zh, ...p.variants.map(v => v.sku)].join(' ').toLowerCase().includes(search));
  $('#catalog-count').textContent = items.length + ' of ' + store.products.length + ' products · only active products appear in the storefront';
  const root = $('#catalog-list'); root.replaceChildren();
  for (const item of items) {
    const row = element('article', 'catalog-row'), thumb = element('div', 'catalog-thumb');
    if (item.images.length) { const image = element('img'); image.src = item.images[0]; image.alt = ''; image.loading = 'lazy'; thumb.append(image); }
    else thumb.append(element('span', '', 'No photo'));
    const info = element('div', 'catalog-info'), title = element('strong', '', item.name.en); title.title = item.name.en; info.append(title, element('small', '', item.variants.length ? item.variants.length + ' variants · ' + item.stock + ' in stock' : item.stock + ' in stock'));
    const button = element('button', 'quiet-button', 'Manage'); button.type = 'button'; button.setAttribute('aria-label', 'Manage ' + item.name.en); button.addEventListener('click', () => selectProduct(item.id, true));
    row.append(thumb, info, element('span', 'catalog-status ' + item.status, item.status), element('span', 'catalog-price', (item.variants.length ? 'From ' : '') + money(item.price)), button); root.append(row);
  }
  if (!items.length) root.append(element('p', 'catalog-empty', store.products.length ? 'No matching products. Try a different search or status.' : 'Add your first draft product. It stays private until you set it active.'));
  $$('.workspace-product-select').forEach(select => { select.replaceChildren(); store.products.forEach(item => { const option = element('option', '', item.name.en + ' · ' + item.status); option.value = item.id; select.append(option); }); select.value = product?.id || ''; });
}
$('#catalog-search').addEventListener('input', renderCatalog); $('#catalog-filter').addEventListener('change', renderCatalog);
$('#catalog-back').addEventListener('click', () => { catalogDetail = false; renderCatalog(); });
$$('.workspace-product-select').forEach(select => select.addEventListener('change', () => selectProduct(select.value)));
$('#catalog-add').addEventListener('click', () => {
  if (!config.editorReady || !store || assistantBusy || editorUploading) return;
  const blank = () => Object.fromEntries(productLanguages.map(([language]) => [language, '']));
  const draft = { id: null, status: 'draft', name: blank(), subtitle: blank(), description: blank(), tags: [blank(), blank()], price: '0.00', currency: 'USD', stock: 0, images: [], variants: [], facts: Object.fromEntries(factFields.map(([key]) => [key, null])), isFictionalSample: true };
  editorSection = 'story'; $('#editor-language').value = 'en'; resetEditor(draft); openDialog('product-editor');
});
function updateEditorCommerce() {
  const derived = editorDraft.variants.length > 0;
  if (derived) { editorDraft.price = Math.min(...editorDraft.variants.map(v => Number(v.price) || 0)).toFixed(2); editorDraft.stock = editorDraft.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0); }
  $('#editor-price').readOnly = derived; $('#editor-stock').readOnly = derived; $('#editor-price').min = editorDraft.status === 'active' ? '.01' : '0';
  $('#editor-price').title = $('#editor-stock').title = derived ? 'Calculated from the variants below. Edit prices and stock in Media & options.' : '';
  $('#editor-price').value = editorDraft.price; $('#editor-stock').value = editorDraft.stock;
  $('#editor-save').textContent = editorDraft.id ? 'Save product' : editorDraft.status === 'draft' ? 'Create draft' : 'Create product';
}
$('#editor-sale-status').addEventListener('change', event => { editorDraft.status = event.target.value; updateEditorCommerce(); renderEditorFields(); updateEditorStatus(); });
function renderEditorMedia() {
  const images = $('#editor-images'); images.replaceChildren();
  editorDraft.images.forEach((path, index) => {
    const item = element('div', 'editor-image'), image = element('img'); image.src = path; image.alt = 'Product image ' + (index + 1);
    const remove = element('button', 'text-button', 'Remove'); remove.type = 'button'; remove.addEventListener('click', () => { editorDraft.images.splice(index, 1); renderEditorMedia(); updateEditorStatus(); });
    const cover = element('button', 'text-button', index === 0 ? 'Cover image' : 'Make cover'); cover.type = 'button'; cover.disabled = index === 0; cover.addEventListener('click', () => { editorDraft.images.unshift(...editorDraft.images.splice(index, 1)); renderEditorMedia(); updateEditorStatus(); });
    item.append(image, cover, remove); images.append(item);
  });
  const root = $('#editor-variants'); root.replaceChildren();
  if (!editorDraft.variants.length) root.append(element('p', 'muted', 'No variants. The product uses the unit price and stock above.'));
  editorDraft.variants.forEach((variant, index) => {
    const row = element('fieldset', 'editor-variant'); row.append(element('legend', '', 'Option ' + (index + 1)));
    const selectedLanguage = $('#editor-language').value;
    const selectedLabel = productLanguages.find(([language]) => language === selectedLanguage)?.[1] || 'English';
    for (const [path, label, type] of [['name.' + selectedLanguage, selectedLabel + ' option name', 'text'], ['sku', 'SKU (optional)', 'text'], ['price', 'Price · USD', 'number'], ['stock', 'Stock', 'number']]) {
      const wrapper = element('label', '', label), input = element('input'); input.type = type;
      input.value = path.startsWith('name.') ? (variant.name[path.split('.')[1]] ?? '') : variant[path]; input.setAttribute('aria-label', label + ' ' + (index + 1));
      if (type === 'number') { input.min = path === 'price' && editorDraft.status === 'active' ? '.01' : '0'; input.max = path === 'price' ? '999999.99' : '9999'; input.step = path === 'price' ? '.01' : '1'; input.required = true; }
      else { input.maxLength = 60; if (path === 'name.en') input.required = true; }
      input.addEventListener('input', () => { if (path.startsWith('name.')) variant.name[path.split('.')[1]] = input.value; else variant[path] = path === 'stock' ? input.value === '' ? null : Number(input.value) : input.value; updateEditorCommerce(); updateEditorStatus(); });
      wrapper.append(input); row.append(wrapper);
    }
    const remove = element('button', 'text-button', 'Remove option'); remove.type = 'button'; remove.addEventListener('click', () => { editorDraft.variants.splice(index, 1); updateEditorCommerce(); renderEditorMedia(); updateEditorStatus(); }); row.append(remove); root.append(row);
  });
  $('#editor-add-variant').disabled = editorDraft.variants.length >= 12;
}
$('#editor-add-variant').addEventListener('click', () => { if (editorDraft.variants.length >= 12) return; editorDraft.variants.push({ id: 'new-' + crypto.randomUUID(), name: Object.fromEntries(productLanguages.map(([language]) => [language, ''])), sku: '', price: editorDraft.price, stock: 0 }); updateEditorCommerce(); renderEditorMedia(); updateEditorStatus(); });
$('#editor-image-upload').addEventListener('change', async event => {
  const files = [...event.target.files]; if (!files.length) return;
  editorUploading = true; event.target.disabled = true; updateEditorStatus(); $('#editor-error').hidden = true;
  try {
    if (editorDraft.images.length + files.length > 6) throw new Error('Choose up to six product images.');
    for (const file of files) {
      if (file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use JPEG, PNG or WebP images under 3 MB each.');
      const bitmap = await createImageBitmap(file); const oversized = bitmap.width > 6000 || bitmap.height > 6000; bitmap.close(); if (oversized) throw new Error('Use an image no larger than 6,000 pixels per side.');
      const result = await api('/api/workspace/image', { method: 'POST', headers: { 'x-editor-token': config.editorToken, 'content-type': file.type }, body: file });
      if (!editorDraft.images.includes(result.path)) editorDraft.images.push(result.path);
    }
  } catch (error) { $('#editor-error').textContent = error.message; $('#editor-error').hidden = false; }
  finally { editorUploading = false; event.target.disabled = false; event.target.value = ''; if (editorSection === 'media') renderEditorMedia(); updateEditorStatus(); }
});

async function loadMerchantOrders() {
  $('#refresh-orders').disabled = true;
  try { const data = await api('/api/workspace/orders'); state.orders = data.orders; state.metrics = data.metrics; renderOrders(); renderReadiness(); $('#merchant-orders-status').textContent = 'Latest 500 stored orders. Counts include all recorded shop orders.'; }
  catch (error) { $('#merchant-orders-status').textContent = error.message; }
  finally { $('#refresh-orders').disabled = false; }
}
$('#refresh-orders').addEventListener('click', loadMerchantOrders);
async function updateMerchantOrder(action) {
  if (!selectedOrder) return;
  $('#merchant-reconcile').disabled = true; $('#merchant-fulfill').disabled = true;
  $('#merchant-tracking').disabled = true;
  try { const order = await api('/api/workspace/order', { method: 'POST', headers: { 'x-editor-token': config.editorToken }, body: JSON.stringify({ orderId: selectedOrder.paypalOrderId || selectedOrder.localId, action, tracking: $('#merchant-tracking').value.trim() }) }); await loadMerchantOrders(); showOrderDetails(order); $('#merchant-order-message').textContent = action === 'fulfill' ? 'Fulfillment recorded in this sandbox shop. No shipment service was contacted.' : 'PayPal payment status refreshed.'; }
  catch (error) { $('#merchant-order-message').textContent = error.message; $('#merchant-reconcile').disabled = !selectedOrder.paypalOrderId || ['COMPLETED','FAILED','DECLINED','DENIED','REFUNDED'].includes(selectedOrder.status); $('#merchant-fulfill').disabled = selectedOrder.status !== 'COMPLETED'; }
  finally { $('#merchant-tracking').disabled = false; }
}
$('#merchant-reconcile').addEventListener('click', () => updateMerchantOrder('reconcile'));
$('#merchant-fulfill').addEventListener('click', () => updateMerchantOrder('fulfill'));

const policyFields = [['shipping', 'Shipping & dispatch'], ['returns', 'Returns & exchanges'], ['privacy', 'Privacy'], ['contact', 'Contact information']];
let settingsOriginal = '', settingsRevision = '', settingsSaving = false, selectedTicket = null, originalReply = '', replySaving = false;
function settingsValue() {
  const policies = {};
  for (const [key] of policyFields) policies[key] = { en: $('#settings-' + key + '-en').value, zh: $('#settings-' + key + '-zh').value };
  return { name: $('#settings-name').value, location: $('#settings-location').value, regionLabel: $('#settings-region').value, policies };
}
$('#open-shop-settings').addEventListener('click', () => {
  if (!store) return;
  $('#settings-name').value = store.shop.name; $('#settings-location').value = store.shop.location; $('#settings-region').value = store.shop.regionLabel;
  const root = $('#settings-policies'); root.replaceChildren();
  for (const [key, title] of policyFields) {
    const group = element('fieldset', 'settings-policy-group'); group.append(element('legend', '', title));
    for (const language of ['en', 'zh']) { const label = element('label', '', language === 'en' ? 'English' : '中文'), input = element('textarea'); input.rows = 3; input.maxLength = 1200; input.id = 'settings-' + key + '-' + language; label.htmlFor = input.id; input.value = store.shop.policies?.[key]?.[language] || ''; label.append(input); group.append(label); }
    root.append(group);
  }
  settingsRevision = store.revision; settingsOriginal = JSON.stringify(settingsValue()); $('#settings-status').textContent = 'Blank policies are shown as not supplied. Both translations are needed for a published policy.'; openDialog('shop-settings');
});
function closeSettings() { if (settingsSaving) return; if (settingsOriginal !== JSON.stringify(settingsValue()) && !confirm('Discard unsaved shop settings?')) return; $('#shop-settings').close(); }
$('#settings-close').addEventListener('click', closeSettings); $('#shop-settings').addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if (settingsSaving) return;
  settingsSaving = true; $$('#settings-form input, #settings-form textarea, #settings-form button').forEach(control => { control.disabled = true; }); $('#settings-status').textContent = 'Saving shop details…';
  try { const data = await api('/api/workspace/settings', { method: 'POST', headers: { 'x-editor-token': config.editorToken }, body: JSON.stringify({ revision: settingsRevision, shop: settingsValue() }) }); renderStore(data); renderReadiness(); $('#shop-settings').close(); showToast('Shop details and policies saved. New answers use the updated information.'); }
  catch (error) { $('#settings-status').textContent = error.message; }
  finally { settingsSaving = false; $$('#settings-form input, #settings-form textarea, #settings-form button').forEach(control => { control.disabled = false; }); }
});
function assistantMode(inbox) {
  $('#assistant-preview-panel').hidden = inbox; $('.workspace-product-picker').hidden = inbox; $('#merchant-inbox-panel').hidden = !inbox;
  $('#assistant-preview-mode').setAttribute('aria-pressed', String(!inbox)); $('#assistant-inbox-mode').setAttribute('aria-pressed', String(inbox));
  if (inbox) loadInbox();
}
$('#assistant-preview-mode').addEventListener('click', () => assistantMode(false)); $('#assistant-inbox-mode').addEventListener('click', () => assistantMode(true));
async function loadInbox() {
  $('#refresh-inbox').disabled = true;
  try {
    const { tickets } = await api('/api/workspace/tickets'); const root = $('#inbox-list'); root.replaceChildren();
    $('#inbox-open-count').textContent = tickets.filter(t => t.status === 'OPEN').length;
    if (!tickets.length) root.append(element('p', 'catalog-empty', 'Buyer questions appear here when someone asks the maker to confirm a detail.'));
    for (const ticket of tickets) {
      const row = element('article', 'inbox-row'), words = element('div'); words.append(element('strong', '', ticket.productName || 'Shop question'), element('p', '', ticket.question), element('small', '', ticket.status + (ticket.orderId ? ' · Order ' + ticket.orderId : '')));
      const button = element('button', 'quiet-button', ticket.reply ? 'View reply' : 'Reply'); button.type = 'button'; button.addEventListener('click', () => openTicket(ticket)); row.append(words, button); root.append(row);
    }
    $('#inbox-status').textContent = 'Latest 500 questions. Replies stay in the shop; no email or external message is sent.';
  } catch (error) { $('#inbox-status').textContent = error.message; }
  finally { $('#refresh-inbox').disabled = false; }
}
$('#refresh-inbox').addEventListener('click', loadInbox);
function openTicket(ticket) {
  selectedTicket = ticket; $('#ticket-question').textContent = ticket.question; $('#ticket-reply-context').textContent = ticket.productName || 'Shop question'; $('#ticket-reply').value = ticket.reply; $('#ticket-state').value = ticket.status === 'CLOSED' ? 'CLOSED' : 'ANSWERED'; originalReply = JSON.stringify([$('#ticket-reply').value, $('#ticket-state').value]); $('#ticket-reply-status').textContent = '';
  $('#ticket-context').hidden = !ticket.history?.length; $('#ticket-context').open = false; const root = $('#ticket-context-messages'); root.replaceChildren();
  for (const message of ticket.history || []) { const row = element('div'); row.append(element('strong', '', message.role === 'user' ? 'Buyer' : 'Assistant · reference only'), element('p', '', message.content)); root.append(row); }
  openDialog('ticket-reply-dialog');
}
function closeTicket() { if (replySaving) return; if (JSON.stringify([$('#ticket-reply').value, $('#ticket-state').value]) !== originalReply && !confirm('Discard the unsaved reply?')) return; $('#ticket-reply-dialog').close(); }
$('#ticket-reply-close').addEventListener('click', closeTicket); $('#ticket-reply-dialog').addEventListener('cancel', event => { event.preventDefault(); closeTicket(); });
$('#ticket-reply-form').addEventListener('submit', async event => {
  event.preventDefault(); if (replySaving || !selectedTicket) return;
  replySaving = true; $$('#ticket-reply-form textarea, #ticket-reply-form select, #ticket-reply-form button').forEach(control => { control.disabled = true; });
  try { await api('/api/workspace/ticket', { method: 'POST', headers: { 'x-editor-token': config.editorToken }, body: JSON.stringify({ id: selectedTicket.id, reply: $('#ticket-reply').value, status: $('#ticket-state').value }) }); $('#ticket-reply-dialog').close(); await loadInbox(); showToast('Reply saved. The buyer can read it in their maker questions.'); }
  catch (error) { $('#ticket-reply-status').textContent = error.message; }
  finally { replySaving = false; $$('#ticket-reply-form textarea, #ticket-reply-form select, #ticket-reply-form button').forEach(control => { control.disabled = false; }); }
});
