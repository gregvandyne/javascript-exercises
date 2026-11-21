// Figures, the printable worksheet (routes/figures.js GET /figures/worksheets/:id/print): the Print button.
for (const b of document.querySelectorAll('[data-print]')) b.addEventListener('click', () => window.print());
