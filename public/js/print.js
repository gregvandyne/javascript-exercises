// "Print or save as PDF" on /plans/schools/print (routes/plans.js): the browser's own print dialog.
for (const b of document.querySelectorAll('[data-print]')) b.addEventListener('click', () => window.print());
