import { enc } from './utils.js';

const Calendar = (() => {
  const now = new Date();
  let _year = now.getFullYear();
  let _month = now.getMonth();

  const MONTH_NAMES = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function render() {
    const container = document.getElementById('calendar-view');
    if (!container) return;

    const notes = window._notes || [];

    const notesByDate = {};
    notes.forEach(n => {
      const d = n.createdAt ? n.createdAt.slice(0, 10) : null;
      if (!d) return;
      if (!notesByDate[d]) notesByDate[d] = [];
      notesByDate[d].push(n);
    });

    const firstDay = new Date(_year, _month, 1).getDay();
    const daysInMonth = new Date(_year, _month + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    const dayHeaders = DAY_NAMES.map(d => `<div class="cal-day-header">${d}</div>`).join('');

    const blanks = Array(firstDay).fill('<div class="cal-day cal-blank"></div>').join('');

    const dayCells = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${_year}-${String(_month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayNotes = notesByDate[dateStr] || [];
      const isToday = dateStr === todayStr;
      const badge = dayNotes.length ? `<span class="cal-dot"></span><span class="cal-count">${dayNotes.length}</span>` : '';
      dayCells.push(`<div class="cal-day${isToday ? ' cal-today' : ''}${dayNotes.length ? ' cal-has-notes' : ''}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>${badge}
      </div>`);
    }

    container.innerHTML = `
      <div class="cal-header">
        <button id="cal-prev" class="icon-btn">&laquo;</button>
        <span class="cal-title">${MONTH_NAMES[_month]} ${_year}</span>
        <button id="cal-next" class="icon-btn">&raquo;</button>
      </div>
      <div class="cal-grid">
        ${dayHeaders}
        ${blanks}
        ${dayCells.join('')}
      </div>
      <div id="cal-day-notes" class="cal-day-notes"></div>`;

    container.querySelector('#cal-prev').addEventListener('click', () => {
      _month--;
      if (_month < 0) { _month = 11; _year--; }
      render();
    });

    container.querySelector('#cal-next').addEventListener('click', () => {
      _month++;
      if (_month > 11) { _month = 0; _year++; }
      render();
    });

    container.querySelectorAll('.cal-day.cal-has-notes').forEach(cell => {
      cell.addEventListener('click', () => {
        const date = cell.dataset.date;
        const dayNotes = notesByDate[date] || [];
        const panel = document.getElementById('cal-day-notes');
        panel.innerHTML = `<h3>${date}</h3><ul>${dayNotes.map(n =>
          `<li><button class="cal-note-link" data-id="${enc(n.id)}">${enc(n.title || '(untitled)')}</button></li>`
        ).join('')}</ul>`;
        panel.querySelectorAll('.cal-note-link').forEach(btn => {
          btn.addEventListener('click', () => window._noteView?.open(btn.dataset.id));
        });
      });
    });
  }

  function init() {
    window._calendar = Calendar;
  }

  return { render, init };
})();

export default Calendar;
