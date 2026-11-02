import { randomUUID } from 'node:crypto';

export function normalizeStore(source) {
  const { product, products, ...rest } = source;
  return { ...rest, products: (products || (product ? [product] : [])).map(item => ({ ...item, status: item.status || 'active', images: item.images || [], variants: item.variants || [] })) };
}
export function validateProduct(input, existing) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Send product details to save.');
  if (!['draft', 'active', 'archived'].includes(input.status)) fail('Choose draft, active or archived.');
  const active = input.status === 'active';
  const bilingual = (value, label, max, required = false) => {
    if (!value || typeof value.en !== 'string' || typeof value.zh !== 'string') fail(label + ' needs English and Chinese fields.');
    const text = { en: value.en.trim(), zh: value.zh.trim() };
    if (Object.values(text).some(v => v.length > max)) fail(label + ' must be under ' + max + ' characters per language.');
    if (active && (required || text.en || text.zh) && (!text.en || !text.zh)) fail('Complete both languages for ' + label.toLowerCase() + ' before setting this product active.');
    return text;
  };
  const price = (value, label) => {
    if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(value) || Number(value) < (active ? .01 : 0) || Number(value) > 999999.99) fail(label + ' must be ' + (active ? 'at least 0.01' : 'zero or more') + ' USD, with at most two decimals.');
    return Number(value).toFixed(2);
  };
  const stock = value => { if (!Number.isInteger(value) || value < 0 || value > 9999) fail('Stock must be a whole number between 0 and 9,999.'); return value; };
  const name = bilingual(input.name, 'Product name', 100, true);
  if (!name.en) fail('Give the product an English name to save a draft.');
  if (!Array.isArray(input.tags) || input.tags.length !== 2) fail('Supply two tag fields.');
  const facts = {};
  for (const key of ['material', 'production', 'madeIn', 'dimensions', 'care', 'dispatch', 'shippingPrice', 'arrivalDateGuarantee']) {
    const value = input.facts?.[key] === null ? { en: '', zh: '' } : bilingual(input.facts?.[key], key, 300);
    facts[key] = value.en || value.zh ? value : null;
  }
  if (!Array.isArray(input.images) || input.images.length > 6 || input.images.some(path => typeof path !== 'string' || !/^\/media\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(path)) || new Set(input.images).size !== input.images.length) fail('Choose up to six uploaded product images.');
  if (!Array.isArray(input.variants) || input.variants.length > 12) fail('Use up to twelve product variants.');
  const seenIds = new Set(), seenSkus = new Set();
  const variants = input.variants.map((variant, index) => {
    if (!variant || typeof variant !== 'object') fail('Complete each variant.');
    const old = existing?.variants?.find(v => v.id === variant.id);
    const id = old?.id || randomUUID();
    if (seenIds.has(id)) fail('Each variant must have a separate identity.'); seenIds.add(id);
    const label = bilingual(variant.name, 'Variant ' + (index + 1), 60, true);
    if (!label.en) fail('Give each variant an English name.');
    if (typeof variant.sku !== 'string' || variant.sku.trim().length > 60) fail('SKU must be under 60 characters.');
    const sku = variant.sku.trim();
    if (sku && seenSkus.has(sku.toLowerCase())) fail('Variant SKUs must be unique within this product.');
    if (sku) seenSkus.add(sku.toLowerCase());
    return { id, name: label, sku, price: price(variant.price, 'Variant price'), stock: stock(variant.stock) };
  });
  const unitPrice = variants.length ? Math.min(...variants.map(v => Number(v.price))).toFixed(2) : price(input.price, 'Price');
  const totalStock = variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : stock(input.stock);
  return { id: existing?.id || 'item-' + randomUUID(), name, subtitle: bilingual(input.subtitle, 'Subtitle', 160, true),
    description: bilingual(input.description, 'Description', 1200, true), tags: input.tags.map(t => bilingual(t, 'Tag', 40)),
    currency: 'USD', price: unitPrice, stock: totalStock, status: input.status, images: input.images, variants, facts,
    isFictionalSample: existing?.isFictionalSample ?? true, updatedAt: new Date().toISOString() };
}
