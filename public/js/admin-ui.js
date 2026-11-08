// Admin pages (server/views/admin-ui.js): long notes and extra filters fold away on phones but start open on wide screens.
if (matchMedia('(min-width: 901px)').matches) document.querySelectorAll('details[data-open-wide]').forEach(d => { d.open = true; });
