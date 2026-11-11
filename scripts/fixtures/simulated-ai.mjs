const answers = {
  materials: {
    en: '[Simulated response] It is handwoven cotton, made in small batches in the Nanjing studio.',
    'zh-CN': '【模拟回复】采用手工编织棉布，在南京工作室小批量制作。',
    ja: '【模擬回答】手織りコットンを使い、南京の工房で少量生産しています。',
    es: '[Respuesta simulada] Es algodón tejido a mano y se fabrica en pequeñas tandas en el estudio de Nanjing.',
    fr: '[Réponse simulée] C’est du coton tissé à la main, fabriqué en petites séries dans l’atelier de Nankin.'
  },
  care: {
    en: '[Simulated response] Spot clean with a damp cloth.',
    'zh-CN': '【模拟回复】请用湿布局部清洁。',
    ja: '【模擬回答】湿らせた布で部分的に拭いてください。',
    es: '[Respuesta simulada] Limpia las manchas con un paño húmedo.',
    fr: '[Réponse simulée] Nettoyez les taches avec un chiffon humide.'
  },
  delivery: {
    en: '[Simulated response] The seller has not supplied a shipping price or guaranteed an arrival date. Please ask the maker to confirm the delivery details.',
    'zh-CN': '【模拟回复】卖家尚未提供运费金额，也未承诺具体到货日期。请向店主确认配送信息。',
    ja: '【模擬回答】販売者から送料は提示されておらず、到着日も保証されていません。配送情報を販売者にご確認ください。',
    es: '[Respuesta simulada] El vendedor no ha indicado el coste del envío ni garantizado una fecha de llegada. Confirma los detalles con el vendedor.',
    fr: '[Réponse simulée] Le vendeur n’a pas indiqué le prix de livraison ni garanti de date d’arrivée. Demandez-lui de confirmer les détails.'
  },
  dispatch: {
    en: '[Simulated response] The seller has not supplied dispatch timing. Please ask the maker to confirm.',
    'zh-CN': '【模拟回复】卖家尚未提供发货时间，请向店主确认。',
    ja: '【模擬回答】販売者から発送時期は提示されていません。店主にご確認ください。',
    es: '[Respuesta simulada] El vendedor no ha indicado cuándo enviará el pedido. Pide confirmación.',
    fr: '[Réponse simulée] Le vendeur n’a pas indiqué le délai d’expédition. Demandez confirmation.'
  },
  price: {
    en: '[Simulated response] The listed price is {price}.',
    'zh-CN': '【模拟回复】商品标价为 {price}。',
    ja: '【模擬回答】表示価格は{price}です。',
    es: '[Respuesta simulada] El precio indicado es {price}.',
    fr: '[Réponse simulée] Le prix affiché est de {price}.'
  },
  specs: {
    en: '[Simulated response] The seller lists these product options: {options}.',
    'zh-CN': '【模拟回复】卖家列出的商品规格为：{options}。',
    ja: '【模擬回答】販売者が掲載している商品オプションは{options}です。',
    es: '[Respuesta simulada] El vendedor ofrece estas opciones: {options}.',
    fr: '[Réponse simulée] Le vendeur propose ces options : {options}.'
  },
  capacity: {
    en: '[Simulated response] The listed capacity is {capacity}.',
    'zh-CN': '【模拟回复】标注的容量为 {capacity}。',
    ja: '【模擬回答】記載されている容量は{capacity}です。',
    es: '[Respuesta simulada] La capacidad indicada es {capacity}.',
    fr: '[Réponse simulée] La capacité indiquée est de {capacity}.'
  },
  genericSize: {
    en: '[Simulated response] The listed capacity is {capacity}. The seller has not provided the cup’s physical dimensions.',
    'zh-CN': '【模拟回复】标注的容量为 {capacity}。卖家尚未提供杯子的物理尺寸。',
    ja: '【模擬回答】記載されている容量は{capacity}です。カップの物理的な寸法は販売者から提供されていません。',
    es: '[Respuesta simulada] La capacidad indicada es {capacity}. El vendedor no ha proporcionado las dimensiones físicas de la taza.',
    fr: '[Réponse simulée] La capacité indiquée est de {capacity}. Le vendeur n’a pas fourni les dimensions physiques de la tasse.'
  },
  genericSizeWithDimensions: {
    en: '[Simulated response] The listed dimensions are {dimensions}; the listed capacity is {capacity}.',
    'zh-CN': '【模拟回复】标注尺寸为 {dimensions}；标注容量为 {capacity}。',
    ja: '【模擬回答】記載されている寸法は{dimensions}、容量は{capacity}です。',
    es: '[Respuesta simulada] Las dimensiones indicadas son {dimensions}; la capacidad indicada es {capacity}.',
    fr: '[Réponse simulée] Les dimensions indiquées sont {dimensions} ; la capacité indiquée est de {capacity}.'
  },
  genericSizeDimensionsOnly: {
    en: '[Simulated response] The listed dimensions are {dimensions}.',
    'zh-CN': '【模拟回复】标注尺寸为 {dimensions}。',
    ja: '【模擬回答】記載されている寸法は{dimensions}です。',
    es: '[Respuesta simulada] Las dimensiones indicadas son {dimensions}.',
    fr: '[Réponse simulée] Les dimensions indiquées sont {dimensions}.'
  },
  noOptions: {
    en: '[Simulated response] No product options are listed for this item.',
    'zh-CN': '【模拟回复】此商品没有列出可选规格。',
    ja: '【模擬回答】この商品には選択できるオプションが掲載されていません。',
    es: '[Respuesta simulada] No hay opciones de producto en el anuncio.',
    fr: '[Réponse simulée] Aucune option de produit n’est indiquée dans l’annonce.'
  },
  unknown: {
    en: '[Simulated response] The seller has not provided that detail. Please ask the maker to confirm.',
    'zh-CN': '【模拟回复】卖家尚未提供这项信息，请向店主确认。',
    ja: '【模擬回答】販売者からその情報は提供されていません。店主にご確認ください。',
    es: '[Respuesta simulada] El vendedor no ha proporcionado ese dato. Pídele confirmación.',
    fr: '[Réponse simulée] Le vendeur n’a pas fourni ce détail. Demandez confirmation au vendeur.'
  }
};

export function simulatedAssistantResponse(rawBody) {
  let messages = [];
  try { messages = JSON.parse(rawBody || '{}').messages || []; } catch {}
  const requested = messages.find(message => message.role === 'system')?.content?.match(/Answer in (English|Chinese|Japanese|Spanish|French)\./i)?.[1];
  const language = ({ English: 'en', Chinese: 'zh-CN', Japanese: 'ja', Spanish: 'es', French: 'fr' })[requested] || 'en';
  const lastUserContent = String([...messages].reverse().find(message => message.role === 'user')?.content || '');
  let buyerQuestion = lastUserContent;
  try {
    const request = JSON.parse(lastUserContent);
    buyerQuestion = typeof request.BUYER_QUESTION === 'string' ? request.BUYER_QUESTION : '';
  } catch {}
  let sellerFacts = {};
  try { sellerFacts = JSON.parse(lastUserContent).SELLER_REFERENCE_DATA || {}; } catch {}
  const isPriceQuestion = /price|cost|how much|usd|价格|價格|多少钱|多少錢|価格|いくら|precio|cu[aá]nto|combien/i.test(buyerQuestion);
  const isCapacityQuestion = /\b(?:capacity|volume|millilit(?:er|re)s?)\b|\b\d+\s*ml\b|容量|容積|内容量|何ミリリットル|capacidad|contenance|capacit[eé]|volume/i.test(buyerQuestion);
  const isSpecsQuestion = /option|variant|specification|specs|规格|規格|选项|選項|オプション|仕様|opci[oó]n|variante/i.test(buyerQuestion);
  const hasSizeFact = key => typeof sellerFacts[key] === 'string' && sellerFacts[key] && !/not supplied|未提供|n.?a.?提供/i.test(sellerFacts[key]);
  const isGenericSizeQuestion = /\bsize\b|尺寸|大小|多大|寸法|サイズ|tama[nñ]o|taille/i.test(buyerQuestion) && !isSpecsQuestion && (hasSizeFact('capacity') || hasSizeFact('dimensions'));
  const isDispatchQuestion = /dispatch|when.*ship|ship out|发货时间|什么时候发货|多久.{0,6}(?:发出|发货)|几天.{0,6}(?:发出|发货)|発送時期|いつ発送|cu[aá]ndo.*env[ií]a|d[eé]lai d.?exp[eé]dition/i.test(buyerQuestion);
  const isArrivalQuestion = /arriv|deliver(?:ed|s)?|delivery\s+(?:date|estimate|guarantee)|guarantee|by (?:friday|monday|\w+day)|\bhow long\b.{0,30}\b(?:receive|get|reach)\b|\bwhat day\b.{0,25}\b(?:receive|get|reach|arrive)\b|\bwhen\b.{0,30}\b(?:receive|get|reach|expect)\b|周五|星期五|送到|送达|到货|什么时候到|何时到|到着|保証|届|lleg(?:ada|a|an|ará|aran)|entreg|garant(?:[ií]a|iz)|arriv[eé]e/i.test(buyerQuestion);
  const isShippingCostQuestion = /\b(?:free|complimentary|included)\s+(?:shipping|delivery)\b|\b(?:shipping|delivery)\s+(?:is\s+)?(?:free|complimentary|included|extra|paid)\b|\b(?:is|are)\s+(?:shipping|delivery)\s+(?:free|included|extra|paid)\b|\b(?:ship|ships|deliver|delivers)\s+(?:for\s+)?(?:free|at no charge)\b|\b(?:shipping|delivery)\s+(?:price|cost|fee)|postage|送料|运费|運費|配送費|包邮|包郵|免运费|免運費|frais (?:de )?(?:livraison|port|envoi)|frais\s+d['’]envoi|prix (?:de )?(?:livraison|envoi)|co[uû]t (?:de )?(?:livraison|exp[eé]dition)|combien (?:co[uû]te|co[uû]tent).{0,20}(?:livraison|exp[eé]dition)|(?:livraison|exp[eé]dition).{0,20}(?:co[uû]t|prix)|(?:la\s+)?(?:livraison|exp[eé]dition)\s+(?:est(?:[- ]elle)?\s+)?(?:gratuite|offerte|incluse|payante)|(?:gratuita|gratuito|gratis)\s+(?:el\s+)?env[ií]o|env[ií]o\s+(?:es\s+)?(?:gratis|gratuito|gratuita|incluido|incluida)|(?:coste|precio) (?:del? )?env[ií]o|cu[aá]nto cuesta (?:el )?env[ií]o|送料無料|送料込み/i.test(buyerQuestion);
  const isDeliveryQuestion = /shipping|delivery|dispatch|arriv|deliver|friday|\bhow long\b.{0,30}\b(?:receive|get|reach)\b|\bwhat day\b.{0,25}\b(?:receive|get|reach|arrive)\b|\bwhen\b.{0,30}\b(?:receive|get|reach|expect)\b|运费|发货|发出|送达|到货|什么时候到|何时到|周五|星期五|包邮|包郵|免运费|免運費|配送|送料|発送|到着|届|envío|llegada|entrega|livraison|expédition/i.test(buyerQuestion);
  const isMaterialsQuestion = /material|mati[eè]re|made|fabric|cotton|handwoven|制作|材质|材料|棉|织|面料|素材|材質|algodón|tejido|coton|tissé/i.test(buyerQuestion);
  const isCareQuestion = /care|clean|wash|stain|洗|清洁|护理|保养|手入れ|洗濯|cuidado|cuida|limpiar|lav|entretien|entretenir|nettoy/i.test(buyerQuestion);
  const answerType = isDeliveryQuestion ? 'delivery' : isGenericSizeQuestion ? 'genericSize' : isPriceQuestion ? 'price' : isCapacityQuestion ? 'capacity' : isSpecsQuestion ? 'specs' : isMaterialsQuestion ? 'materials' : isCareQuestion ? 'care' : 'unknown';
  let content = answers[answerType][language] || answers.unknown.en;
  const supplied = key => typeof sellerFacts[key] === 'string' && sellerFacts[key] && !/not supplied|未提供|n.?a.?提供/i.test(sellerFacts[key]) ? sellerFacts[key] : '';
  const cleanFact = key => supplied(key).replace(/[。.!?]+$/u, '');
  if (answerType === 'capacity') {
    if (/dimensions?|physical size|dimensiones?|dimensi[oó]n|tamaño físico|taille|mesures?|尺寸|寸法|サイズ/i.test(buyerQuestion)) {
      if (supplied('dimensions') && supplied('capacity')) content = answers.genericSizeWithDimensions[language].replace('{dimensions}', cleanFact('dimensions')).replace('{capacity}', cleanFact('capacity'));
      else content = answers.genericSize[language].replace('{capacity}', cleanFact('capacity'));
    } else content = supplied('capacity') ? answers.capacity[language].replace('{capacity}', cleanFact('capacity')) : answers.unknown[language];
  }
  if (answerType === 'genericSize') {
    if (supplied('dimensions') && supplied('capacity')) content = answers.genericSizeWithDimensions[language].replace('{dimensions}', cleanFact('dimensions')).replace('{capacity}', cleanFact('capacity'));
    else if (supplied('dimensions')) content = answers.genericSizeDimensionsOnly[language].replace('{dimensions}', cleanFact('dimensions'));
    else content = answers.genericSize[language].replace('{capacity}', cleanFact('capacity'));
  }
  if (answerType === 'materials' && (!supplied('material') || !supplied('production'))) content = answers.unknown[language];
  if (answerType === 'care' && !supplied('care')) content = answers.unknown[language];
  if (answerType === 'materials' && supplied('material') && supplied('production')) {
    const material = cleanFact('material'), production = cleanFact('production');
    content = ({
      en: `[Simulated response] Material: ${material}. Production: ${production}.`,
      'zh-CN': `【模拟回复】材质：${material}；制作方式：${production}。`,
      ja: `【模擬回答】素材：${material}。製法：${production}。`,
      es: `[Respuesta simulada] Material: ${material}. Producción: ${production}.`,
      fr: `[Réponse simulée] Matière : ${material}. Fabrication : ${production}.`
    })[language];
  }
  if (answerType === 'materials' && isCareQuestion) {
    const careLead = supplied('care') ? ({
      en: ` Care: ${cleanFact('care')}.`,
      'zh-CN': `护理方式：${cleanFact('care')}。`,
      ja: `お手入れ方法：${cleanFact('care')}。`,
      es: ` Cuidado: ${cleanFact('care')}.`,
      fr: ` Entretien : ${cleanFact('care')}.`
    })[language] : ({
      en: ' The seller has not provided care instructions.',
      'zh-CN': '卖家尚未提供护理说明。',
      ja: '販売者からお手入れ方法は提示されていません。',
      es: ' El vendedor no ha proporcionado instrucciones de cuidado.',
      fr: ' Le vendeur n’a pas fourni de consignes d’entretien.'
    })[language];
    content += careLead;
  }
  if (answerType === 'care' && supplied('care')) {
    const care = cleanFact('care');
    content = ({
      en: `[Simulated response] Care: ${care}.`,
      'zh-CN': `【模拟回复】保养方式：${care}。`,
      ja: `【模擬回答】お手入れ方法：${care}。`,
      es: `[Respuesta simulada] Cuidado: ${care}.`,
      fr: `[Réponse simulée] Entretien : ${care}.`
    })[language];
    if (/machine[- ]wash|washing machine|dryer|烘干|烘乾|机洗|機洗|洗濯機|乾燥機|lavadora|secadora|laver en machine|sèche-linge/i.test(buyerQuestion)) {
      content += ({
        en: ' The seller has not provided machine-washing or dryer-safety guidance.',
        'zh-CN': '卖家没有说明是否可机洗或烘干。',
        ja: '洗濯機で洗えるか、乾燥機を使えるかは販売者から明示されていません。',
        es: 'El vendedor no ha indicado si se puede lavar a máquina o usar secadora.',
        fr: 'Le vendeur n’a pas précisé si le produit peut être lavé en machine ou séché au sèche-linge.'
      })[language];
    }
  }
  if (answerType === 'delivery') {
    if (isShippingCostQuestion && isArrivalQuestion) {
      const shipping = supplied('shippingPrice') ? cleanFact('shippingPrice') : '';
      const arrival = supplied('arrivalDateGuarantee') ? cleanFact('arrivalDateGuarantee') : '';
      const wording = {
        en: { start: '[Simulated response] ', shipping: value => `Shipping price: ${value}.`, shippingUnknown: 'The seller has not supplied a shipping price.', arrival: value => `Arrival guarantee: ${value}.`, arrivalUnknown: 'The seller has not guaranteed an arrival date.', end: ' Please ask the maker to confirm any missing delivery details.' },
        'zh-CN': { start: '【模拟回复】', shipping: value => `运费：${value}。`, shippingUnknown: '卖家尚未提供运费金额。', arrival: value => `到货承诺：${value}。`, arrivalUnknown: '卖家尚未承诺具体到货日期。', end: '如有缺失，请向店主确认配送信息。' },
        ja: { start: '【模擬回答】', shipping: value => `送料：${value}。`, shippingUnknown: '販売者から送料は提示されていません。', arrival: value => `到着日の保証：${value}。`, arrivalUnknown: '販売者から到着日の保証は提示されていません。', end: '不足している配送情報は店主にご確認ください。' },
        es: { start: '[Respuesta simulada] ', shipping: value => `Precio de envío: ${value}.`, shippingUnknown: 'El vendedor no ha indicado el coste del envío.', arrival: value => `Garantía de llegada: ${value}.`, arrivalUnknown: 'El vendedor no ha garantizado una fecha de llegada.', end: 'Confirma con el vendedor los detalles de entrega que falten.' },
        fr: { start: '[Réponse simulée] ', shipping: value => `Prix de livraison : ${value}.`, shippingUnknown: 'Le vendeur n’a pas indiqué le prix de livraison.', arrival: value => `Garantie d’arrivée : ${value}.`, arrivalUnknown: 'Le vendeur n’a garanti aucune date d’arrivée.', end: 'Demandez au vendeur de confirmer les détails de livraison manquants.' }
      }[language];
      content = wording.start + (shipping ? wording.shipping(shipping) : wording.shippingUnknown) + ' ' + (arrival ? wording.arrival(arrival) : wording.arrivalUnknown) + ' ' + wording.end;
    }
    else if (isDispatchQuestion) content = supplied('dispatch') ? ({ en: `[Simulated response] Dispatch: ${cleanFact('dispatch')}.`, 'zh-CN': `【模拟回复】发货时间：${cleanFact('dispatch')}。`, ja: `【模擬回答】発送時期：${cleanFact('dispatch')}。`, es: `[Respuesta simulada] Envío: ${cleanFact('dispatch')}.`, fr: `[Réponse simulée] Expédition : ${cleanFact('dispatch')}.` })[language] : answers.dispatch[language];
    else if (isShippingCostQuestion) content = supplied('shippingPrice') ? ({ en: `[Simulated response] Shipping price: ${cleanFact('shippingPrice')}.`, 'zh-CN': `【模拟回复】运费：${cleanFact('shippingPrice')}。`, ja: `【模擬回答】送料：${cleanFact('shippingPrice')}。`, es: `[Respuesta simulada] Envío: ${cleanFact('shippingPrice')}.`, fr: `[Réponse simulée] Livraison : ${cleanFact('shippingPrice')}.` })[language] : ({ en: '[Simulated response] The seller has not supplied a shipping price. Please ask the maker to confirm.', 'zh-CN': '【模拟回复】卖家尚未提供运费金额，请向店主确认。', ja: '【模擬回答】販売者から送料は提示されていません。店主にご確認ください。', es: '[Respuesta simulada] El vendedor no ha indicado el coste del envío. Pide confirmación.', fr: '[Réponse simulée] Le vendeur n’a pas indiqué les frais de livraison. Demandez confirmation.' })[language];
    else if (isArrivalQuestion) content = supplied('arrivalDateGuarantee') ? ({ en: `[Simulated response] Arrival: ${cleanFact('arrivalDateGuarantee')}.`, 'zh-CN': `【模拟回复】送达日期：${cleanFact('arrivalDateGuarantee')}。`, ja: `【模擬回答】到着日：${cleanFact('arrivalDateGuarantee')}。`, es: `[Respuesta simulada] Llegada: ${cleanFact('arrivalDateGuarantee')}.`, fr: `[Réponse simulée] Arrivée : ${cleanFact('arrivalDateGuarantee')}.` })[language] : ({ en: '[Simulated response] The seller has not guaranteed an arrival date. Please ask the maker to confirm.', 'zh-CN': '【模拟回复】卖家尚未承诺具体到货日期，请向店主确认。', ja: '【模擬回答】販売者から到着日の保証は提示されていません。店主にご確認ください。', es: '[Respuesta simulada] El vendedor no ha garantizado una fecha de llegada. Pide confirmación.', fr: '[Réponse simulée] Le vendeur n’a garanti aucune date d’arrivée. Demandez confirmation.' })[language];
    else if (!isDispatchQuestion && !isShippingCostQuestion && !isArrivalQuestion) content = answers.delivery[language];
  }
  if (answerType === 'delivery' && isMaterialsQuestion && supplied('material')) {
    const material = cleanFact('material');
    const materialLead = ({
      en: `Material: ${material}. `,
      'zh-CN': `材质：${material}。`,
      ja: `素材：${material}。`,
      es: `Material: ${material}. `,
      fr: `Matière : ${material}. `
    })[language];
    content = materialLead + content;
  }
  if (answerType === 'delivery' && isCareQuestion) {
    const careLead = supplied('care') ? ({
      en: `Care: ${cleanFact('care')}. `,
      'zh-CN': `护理：${cleanFact('care')}。`,
      ja: `お手入れ：${cleanFact('care')}。`,
      es: `Cuidado: ${cleanFact('care')}. `,
      fr: `Entretien : ${cleanFact('care')}. `
    })[language] : ({
      en: 'The seller has not provided care instructions. ',
      'zh-CN': '卖家尚未提供护理说明。',
      ja: '販売者からお手入れ方法は提示されていません。',
      es: 'El vendedor no ha proporcionado instrucciones de cuidado. ',
      fr: 'Le vendeur n’a pas fourni de consignes d’entretien. '
    })[language];
    content = careLead + content;
  }
  if (answerType === 'price') {
    const requestedSize = buyerQuestion.match(/\b\d+(?:\.\d+)?\s*ml\b/i)?.[0]?.replace(/\s+/g, '').toLowerCase();
    const variants = Array.isArray(sellerFacts.variants) ? sellerFacts.variants : [];
    const explicitVariant = requestedSize ? variants.find(option => String(option.name || '').replace(/\s+/g, '').toLowerCase().includes(requestedSize)) : null;
    const selectedVariant = sellerFacts.selectedVariant && typeof sellerFacts.selectedVariant === 'object' ? sellerFacts.selectedVariant : null;
    const answerVariant = explicitVariant || selectedVariant;
    const listedPrice = answerVariant?.price ? `${answerVariant.price} USD` : supplied('price');
    content = listedPrice ? answers.price[language].replace('{price}', listedPrice) : answers.unknown[language];
    if (answerVariant && /\b(?:stock|available|availability|inventory)\b/i.test(buyerQuestion)) {
      content = `[Simulated response] ${answerVariant.name}: ${listedPrice}; available stock: ${answerVariant.stock}.`;
    }
  }
  if (answerType === 'specs') {
    const listedOptions = Array.isArray(sellerFacts.variants) ? sellerFacts.variants.map(option => option.name).filter(Boolean).join(', ') : '';
    content = listedOptions ? answers.specs[language].replace('{options}', listedOptions) : Array.isArray(sellerFacts.variants) ? answers.noOptions[language] : answers.unknown[language];
    const asksDimensions = /dimensions?|physical size|dimensiones?|tama[nñ]o f[ií]sico|taille|mesures?|尺寸|寸法|サイズ/i.test(buyerQuestion);
    if (asksDimensions && supplied('dimensions')) {
      content += ({
        en: ` The listed dimensions are ${cleanFact('dimensions')}.`,
        'zh-CN': `标注尺寸为 ${cleanFact('dimensions')}。`,
        ja: `記載寸法は${cleanFact('dimensions')}です。`,
        es: ` Las dimensiones indicadas son ${cleanFact('dimensions')}.`,
        fr: ` Les dimensions indiquées sont ${cleanFact('dimensions')}.`
      })[language];
    }
  }
  return { choices: [{ message: { content } }] };
}
