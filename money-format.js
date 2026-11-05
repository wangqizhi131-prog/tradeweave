(() => {
  function parts(value, currency = 'USD', locale = 'en-US', extraOptions = {}) {
    const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency, ...extraOptions }).formatToParts(Number(value));
    if (currency !== 'USD') return formatted;
    return [
      ...formatted.map(part => part.type === 'currency' ? { ...part, value: '$' } : part),
      { type: 'literal', value: ' ' },
      { type: 'currency', value: 'USD' }
    ];
  }

  function format(value, currency = 'USD', locale = 'en-US', extraOptions = {}) {
    return parts(value, currency, locale, extraOptions).map(part => part.value).join('');
  }

  function render(target, value, currency = 'USD', locale = 'en-US', extraOptions = {}, append = false) {
    if (!append) target.replaceChildren();
    let amount = null;
    for (const part of parts(value, currency, locale, extraOptions)) {
      if (part.type === 'currency') {
        amount = null;
        const symbol = document.createElement('span');
        symbol.className = part.value === 'USD' ? 'price-currency-code' : 'price-currency-symbol';
        symbol.textContent = part.value;
        target.append(symbol);
      } else if (part.type === 'literal') {
        amount = null;
        target.append(document.createTextNode(part.value));
      } else {
        if (!amount) {
          amount = document.createElement('span');
          amount.className = 'price-amount';
          target.append(amount);
        }
        amount.append(document.createTextNode(part.value));
      }
    }
  }

  window.TradeWeaveMoney = Object.freeze({ parts, format, render });
})();
