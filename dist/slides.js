const titles = ['A fixed USDC invoice on Solana', 'The payer receives a fixed quote', 'The finalized Solana credit', 'A partial refund on a paid invoice', 'Recheck the funded receipt'];
const slide = document.getElementById('slide');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
let page = 1;
function showPage(value) {
  page = Math.min(titles.length, Math.max(1, value));
  slide.src = 'media/slide-' + page + '.png';
  slide.alt = titles[page - 1];
  document.getElementById('caption').textContent = page + ' of ' + titles.length + ' · ' + slide.alt;
  previous.disabled = page === 1;
  next.disabled = page === titles.length;
}
previous.onclick = () => showPage(page - 1);
next.onclick = () => showPage(page + 1);
document.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') showPage(page - 1);
  if (event.key === 'ArrowRight') showPage(page + 1);
});
