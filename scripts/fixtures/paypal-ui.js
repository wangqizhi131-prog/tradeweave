// Test-only adapter. Served exclusively by scripts/ui-fixture.mjs --payments.
window.paypal = {
  Buttons(options) {
    return {
      isEligible: () => true,
      async render(selector) {
        const root = document.querySelector(selector), launch = document.createElement('button');
        launch.type = 'button'; launch.className = 'shop-pay'; launch.textContent = 'Open simulated payment'; root.replaceChildren(launch);
        launch.addEventListener('click', async () => {
          launch.disabled = true;
          try {
            const id = await options.createOrder(), dialog = document.createElement('dialog'); dialog.className = 'buyer-dialog receipt-dialog';
            const heading = document.createElement('h2'); heading.textContent = 'Simulated approval';
            const explanation = document.createElement('p'); explanation.textContent = 'Browser test fixture. No PayPal SDK, external provider or money is involved. Test order: ' + id;
            dialog.append(heading, explanation);
            const close = () => { dialog.close(); dialog.remove(); launch.disabled = false; };
            for (const [mode, title] of [['COMPLETED', 'Approve test payment'], ['PENDING', 'Return test pending'], ['DECLINED', 'Return test declined'], ['LOST', 'Approve with lost response'], ['PARTIALLY_REFUNDED', 'Return partial-refund test state'], ['REFUNDED', 'Return refunded test state']]) {
              const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet-button'; button.textContent = title; button.style.marginBottom = '12px';
              button.addEventListener('click', async () => { close(); await fetch('/fixture/payment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, mode }) }); await options.onApprove({ orderID: id }); }); dialog.append(button);
            }
            const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = 'Cancel test approval'; cancel.addEventListener('click', async () => { close(); await options.onCancel(); }); dialog.append(cancel);
            dialog.addEventListener('cancel', event => { event.preventDefault(); close(); options.onCancel(); }); document.body.append(dialog); dialog.showModal();
          } catch (error) { launch.disabled = false; options.onError(error); }
        });
      }
    };
  }
};
addEventListener('DOMContentLoaded', () => {
  const banner = document.createElement('aside'); banner.className = 'shop-preview'; banner.setAttribute('aria-label', 'Isolated browser test controls');
  const words = document.createElement('strong'); words.textContent = 'TEST FIXTURE · SIMULATED AI & PAYMENTS';
  const complete = document.createElement('button'); complete.type = 'button'; complete.className = 'quiet-button'; complete.textContent = 'Complete pending test payments';
  complete.addEventListener('click', async () => { const response = await fetch('/fixture/payment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completePending: true }) }); const result = await response.json(); words.textContent = 'TEST FIXTURE · ' + result.orders + ' provider orders / ' + result.captureRequests + ' capture requests'; }); banner.append(words, complete); document.body.prepend(banner);
});
