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
  const isDeliveryQuestion = /shipping|delivery|arriv|friday|运费|送达|到货|周五|配送|送料|到着|envío|llegada|entrega|livraison|arrivée/i.test(buyerQuestion);
  const isMaterialsQuestion = /material|mati[eè]re|made|fabric|cotton|handwoven|制作|材质|材料|棉|织|面料|素材|材質|algodón|tejido|coton|tissé/i.test(buyerQuestion);
  const isCareQuestion = /care|clean|wash|stain|洗|清洁|护理|保养|手入れ|洗濯|cuidado|cuida|limpiar|lav|entretien|entretenir|nettoy/i.test(buyerQuestion);
  const answerType = isDeliveryQuestion ? 'delivery' : isMaterialsQuestion ? 'materials' : isCareQuestion ? 'care' : 'unknown';
  let content = answers[answerType][language] || answers.unknown.en;
  const supplied = key => typeof sellerFacts[key] === 'string' && sellerFacts[key] && !/not supplied|未提供|n.?a.?提供/i.test(sellerFacts[key]) ? sellerFacts[key] : '';
  const cleanFact = key => supplied(key).replace(/[。.!?]+$/u, '');
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
  if (answerType === 'care' && supplied('care')) {
    const care = cleanFact('care');
    content = ({
      en: `[Simulated response] Care: ${care}.`,
      'zh-CN': `【模拟回复】保养方式：${care}。`,
      ja: `【模擬回答】お手入れ方法：${care}。`,
      es: `[Respuesta simulada] Cuidado: ${care}.`,
      fr: `[Réponse simulée] Entretien : ${care}.`
    })[language];
  }
  return { choices: [{ message: { content } }] };
}
