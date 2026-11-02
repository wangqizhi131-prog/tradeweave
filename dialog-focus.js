// Keep boundary Tab navigation inside native dialogs, including embedded browsers.
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const dialog = document.querySelector('dialog[open]');
  if (!dialog) return;
  const controls = [...dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')]
    .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
  const first = controls[0], last = controls.at(-1), active = document.activeElement;
  if (!first) { event.preventDefault(); dialog.focus(); return; }
  if (event.shiftKey && (active === first || !dialog.contains(active))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (active === last || !dialog.contains(active))) { event.preventDefault(); first.focus(); }
});
