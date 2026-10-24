// Stats charts: hovering or tapping a bar shows that day's numbers above the chart (tooltips don't work on phones).
document.addEventListener('pointerover', show);
document.addEventListener('click', show);
function show(e) {
  const bar = e.target.closest && e.target.closest('.bar'); if (!bar) return;
  const chart = bar.closest('.chart');
  chart.querySelectorAll('.bar.on').forEach(b => b.classList.remove('on'));
  bar.classList.add('on');
  chart.querySelector('.chart-read').textContent = bar.dataset.tip;
}
