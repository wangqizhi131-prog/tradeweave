(() => {
  function parts(value, currency = 'USD', locale = 'en-US', extraOptions = {}) {
    const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency, ...extraOptions }).formatToParts(Number(value));
    return formatted.map(part => part.type === 'currency' && currency === 'USD' ? { ...part, value: 'US$' } : part);
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
        symbol.className = 'price-currency-symbol';
        symbol.textContent = part.value;
        target.append(symbol);
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
