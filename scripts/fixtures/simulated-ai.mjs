const answers = {
  care: {
    en: '[Simulated response] Spot clean with a damp cloth.',
    'zh-CN': '【模拟回复】请用湿布局部清洁。',
    ja: '【模擬回答】湿らせた布で部分的に拭いてください。',
    es: '[Respuesta simulada] Limpia las manchas con un paño húmedo.',
    fr: '[Réponse simulée] Nettoyez les taches avec un chiffon humide.'
  },
  delivery: {
    en: '[Simulated response] The seller has not supplied a shipping price or promised Friday delivery. Please ask the maker to confirm the delivery details.',
    'zh-CN': '【模拟回复】卖家尚未提供运费金额，也未承诺周五前送达。请向店主确认配送信息。',
    ja: '【模擬回答】販売者から送料は提示されておらず、金曜日までの配達も保証されていません。配送情報を販売者にご確認ください。',
    es: '[Respuesta simulada] El vendedor no ha indicado el coste del envío ni garantizado la entrega para el viernes. Confirma los detalles con el vendedor.',
    fr: '[Réponse simulée] Le vendeur n’a pas indiqué le prix de livraison ni garanti une arrivée vendredi. Demandez-lui de confirmer les détails.'
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
  const isDeliveryQuestion = /shipping|delivery|arriv|friday|运费|送达|到货|周五|配送/i.test(buyerQuestion);
  const content = answers[isDeliveryQuestion ? 'delivery' : 'care'][language] || answers.care.en;
  return { choices: [{ message: { content } }] };
}
