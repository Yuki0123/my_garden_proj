const _d         = JSON.parse(document.getElementById('appData').textContent);
const AREAS      = _d.areas;
const TODAY      = _d.today;
const TODAY_YEAR = _d.currentYear;
const CSRF       = _d.csrf;
const API_STATE  = id  => `/garden2/api/area/${id}/state/`;
const API_DATES  = id  => `/garden2/api/area/${id}/dates/`;
const API_DETAIL = id  => `/garden2/api/bed/${id}/detail/`;
const API_LOG     = id  => `/garden2/api/bed/${id}/log/`;
const API_HARVEST    = id => `/garden2/api/crop/${id}/harvest/`;
const API_BED_REMOVE = id => `/garden2/api/bed/${id}/remove/`;
const API_BED_ADJUST  = id => `/garden2/api/bed/${id}/adjust/`;
const API_CROP_ADJUST = id => `/garden2/api/crop/${id}/adjust/`;
const API_VEG_TYPES   = ()  => `/garden2/api/vegetable-types/`;
const API_BED_PLANT   = id => `/garden2/api/bed/${id}/plant/`;
const API_BED_ADD     = id => `/garden2/api/area/${id}/bed/add/`;
const API_BED_UPDATE  = id => `/garden2/api/bed/${id}/update/`;
const API_CROP_UPDATE = id => `/garden2/api/crop/${id}/update/`;
const API_DAY_ACTIONS = id => `/garden2/api/area/${id}/day-actions/`;

// ── Adjust panel open state ────────────────────────────
let _adjOpen        = false;
let _cropAdjOpen    = {};
let _currentGarden  = null;  // renderGarden に渡された最新データ
let _currentActions = null;  // 選択日付の日次アクション

// ── App state ──────────────────────────────────────────
let S = {
  tab:    'garden',
  year:   TODAY_YEAR,
  date:   TODAY,       // 畑タブ用の選択日付（YYYY-MM-DD）
  areaId: AREAS[0]?.id,
};

// ── Rotation level → colors ────────────────────────────
const ROT_COLOR = {
  high: {c:'#b3564a', bg:'#f2dfd9'},
  mid:  {c:'#c0883a', bg:'#f2e7cf'},
  low:  {c:'#9a8f5e', bg:'#ece7d2'},
  ok:   {c:'#5d8a55', bg:'#e3ecdc'},
  none: {c:'#a79e88', bg:'#f0ece0'},
};

// ── Init ───────────────────────────────────────────────
function init() {
  const todayD = new Date(TODAY + 'T00:00:00');
  document.getElementById('todayLabel').textContent =
    `${todayD.getFullYear()}.${todayD.getMonth()+1}.${todayD.getDate()}`;
  buildAreaTabs();
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );
  document.getElementById('overlay').addEventListener('click', closeDetail);
  loadGardenTab();
}

// ── Area tabs ──────────────────────────────────────────
function buildAreaTabs() {
  const wrap = document.getElementById('areaTabs');
  wrap.innerHTML = '';
  if (AREAS.length <= 1) { wrap.style.display = 'none'; return; }
  AREAS.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'area-tab' + (a.id === S.areaId ? ' active' : '');
    btn.textContent = a.name;
    btn.addEventListener('click', () => {
      closeDetail();
      markNav();
      S.areaId = a.id;
      document.querySelectorAll('.area-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (S.tab === 'garden') loadGardenTab();
      else if (S.tab === 'compare') loadCompare();
      else loadTimeline();
    });
    wrap.appendChild(btn);
  });
}

// ── Year chips ─────────────────────────────────────────
function buildYearChips(years) {
  const wrap = document.getElementById('yearChips');
  wrap.innerHTML = '';
  const activeYear = S.tab === 'compare' ? compareYear() : S.year;
  years.forEach(y => {
    const isNow = y === TODAY_YEAR;
    const active = y === activeYear;
    const btn = document.createElement('button');
    btn.className = 'year-chip' + (active ? (isNow ? ' active' : ' active-past') : '');
    btn.innerHTML = `<span class="year-chip-year">${y}</span><span class="year-chip-tag">${isNow ? '今' : '記録'}</span>`;
    btn.addEventListener('click', () => selectYear(y));
    wrap.appendChild(btn);
  });
}

function updateScrubCaption() {
  const captions = {garden:'記録を見る年', compare:'比較する過去の年', timeline:'注目する年'};
  document.getElementById('scrubCaption').textContent = captions[S.tab] || '';
  const d = new Date(TODAY + 'T00:00:00');
  document.getElementById('scrubSub').textContent = `${d.getMonth()+1}月`;
}

function selectYear(y) {
  closeDetail();
  markNav();
  S.year = y;
  if (S.tab === 'compare') {
    loadCompare();
  } else if (S.tab === 'timeline') {
    loadTimeline();
  } else {
    loadGardenTab();
  }
}

function compareYear() {
  return S.year === TODAY_YEAR ? TODAY_YEAR - 1 : S.year;
}

// ── Date chips (畑タブ専用) ───────────────────────────
async function loadDates(year) {
  const res  = await fetch(`${API_DATES(S.areaId)}?year=${year}`);
  const data = await res.json();
  S.date = data.default;  // デフォルト日付をセット
  buildDateChips(data.dates, data.default);
  return data.default;
}

function buildDateChips(dates, selected) {
  const wrap = document.getElementById('dateChips');
  wrap.innerHTML = '';
  if (!dates.length) {
    document.getElementById('dateChipsWrap').style.display = 'none';
    return;
  }
  document.getElementById('dateChipsWrap').style.display = 'flex';

  dates.forEach(entry => {
    const dateStr  = entry.date;
    const types    = entry.types || [];
    const isToday  = dateStr === TODAY;
    const isActive = dateStr === selected;
    const btn = document.createElement('button');
    btn.className = 'date-chip' + (isActive ? ' active' : '') + (isToday ? ' is-today' : '');
    btn.dataset.date = dateStr;

    const main = document.createElement('span');
    main.textContent = isToday ? '今日' : fmtDateChip(dateStr);
    btn.appendChild(main);

    if (types.length) {
      const LABELS = {bed:'畝', planted:'植付', harvested:'収穫'};
      const tags = document.createElement('span');
      tags.className = 'chip-tags';
      types.forEach(t => {
        if (!LABELS[t]) return;
        const tag = document.createElement('span');
        tag.className = `chip-tag ${t}`;
        tag.textContent = LABELS[t];
        tags.appendChild(tag);
      });
      if (tags.children.length) btn.appendChild(tags);
    }

    btn.addEventListener('click', () => selectDate(dateStr));
    wrap.appendChild(btn);
  });

  // 選択チップが見えるようにスクロール（block:'nearest'で縦スクロールを抑止）
  const activeChip = wrap.querySelector('.date-chip.active');
  if (activeChip) activeChip.scrollIntoView({block:'nearest', inline:'nearest', behavior:'instant'});
}

function fmtDateChip(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function selectDate(dateStr) {
  S.date = dateStr;
  // チップのアクティブ更新
  document.querySelectorAll('.date-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.date === dateStr);
  });
  // 畑マップを再描画
  loadGardenMap(dateStr);
}

// ── Tab switching ──────────────────────────────────────
function switchTab(tab) {
  closeDetail();
  markNav();
  S.tab = tab;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  updateScrubCaption();
  // 日付チップは畑タブのみ表示
  document.getElementById('dateChipsWrap').style.display = tab === 'garden' ? 'flex' : 'none';

  if (tab === 'compare') {
    if (S.year === TODAY_YEAR) S.year = TODAY_YEAR - 1;
    loadCompare().then(scrollTop);
  } else if (tab === 'timeline') {
    S.year = TODAY_YEAR;
    loadTimeline().then(scrollTop);
  } else {
    S.year = TODAY_YEAR;
    loadGardenTab().then(scrollTop);
  }
}

// ── Load: 畑タブ（年変更・エリア変更時） ──────────────
async function loadGardenTab() {
  // 日付チップを先に取得してデフォルト日付を決定し、それでマップを取得
  const defaultDate = await loadDates(S.year);
  await loadGardenMap(defaultDate);
}

// ── Load: 畑マップ（特定日付） ────────────────────────
async function loadGardenMap(dateStr) {
  closeDetail();
  const [res, actRes] = await Promise.all([
    fetch(`${API_STATE(S.areaId)}?date=${dateStr}`),
    fetch(`${API_DAY_ACTIONS(S.areaId)}?date=${dateStr}`),
  ]);
  const data    = await res.json();
  const actData = await actRes.json();
  _currentActions = actData.actions;
  buildYearChips(data.available_years);
  updateScrubCaption();
  renderGarden(data);
}

// ── Load compare ───────────────────────────────────────
async function loadCompare() {
  closeDetail();
  const [resNow, resPast] = await Promise.all([
    fetch(`${API_STATE(S.areaId)}?year=${TODAY_YEAR}`),
    fetch(`${API_STATE(S.areaId)}?year=${compareYear()}`),
  ]);
  const now  = await resNow.json();
  const past = await resPast.json();
  buildYearChips(now.available_years);
  updateScrubCaption();
  renderCompare(now, past);
}

// ── Load timeline ──────────────────────────────────────
async function loadTimeline() {
  closeDetail();
  const res   = await fetch(`${API_STATE(S.areaId)}?year=${TODAY_YEAR}`);
  const first = await res.json();
  const years = first.available_years;
  const allData = await Promise.all(
    years.map(y => fetch(`${API_STATE(S.areaId)}?year=${y}`).then(r => r.json()))
  );
  buildYearChips(years);
  updateScrubCaption();
  renderTimeline(years, allData);
}

function scrollTop() {
  requestAnimationFrame(() => {
    document.getElementById('tabBody').scrollTop = 0;
  });
}

// ══════════════════════════════════════════════════════
// ── Render: Day actions card ──────────────────────────
// ══════════════════════════════════════════════════════
function renderDayActions(actions, dateStr) {
  if (!actions || !actions.length) return null;

  const d = new Date(dateStr + 'T00:00:00');
  const isToday = dateStr === TODAY;
  const label = isToday ? '今日' : `${d.getMonth() + 1}/${d.getDate()}`;

  const wrap = el('div', 'day-actions-wrap');
  const lbl = el('span', 'day-actions-label');
  lbl.textContent = label + '：';
  wrap.appendChild(lbl);

  actions.forEach(({bed, events}) => {
    events.forEach(e => {
      if (e.type === 'bed_added' || e.type === 'bed_removed') {
        const chip = el('span', `day-actions-chip ${e.type === 'bed_added' ? 'bed-added' : 'bed-removed'}`);
        chip.textContent = `${bed} ${e.type === 'bed_added' ? '新設' : '撤去'}`;
        wrap.appendChild(chip);
      } else if (e.type === 'planted' || e.type === 'harvested') {
        const chip = el('span', `day-actions-chip ${e.type}`);
        const dot = el('span', 'day-actions-dot');
        dot.style.background = e.color;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(`${bed}・${e.name} ${e.type === 'planted' ? '植付' : '収穫'}`));
        wrap.appendChild(chip);
      }
    });
  });

  return wrap;
}

// ══════════════════════════════════════════════════════
// ── Render: Garden map ────────────────────────────────
// ══════════════════════════════════════════════════════
function renderGarden(data) {
  _currentGarden = data;
  const area = data.area;
  const content = document.getElementById('tabContent');
  content.innerHTML = '';

  // Banner if past year
  if (data.year !== TODAY_YEAR) {
    const banner = document.createElement('div');
    banner.className = 'banner';
    banner.innerHTML = `
      <span class="banner-text">${data.year}年ごろの記録を表示中</span>
      <button class="btn-now" id="bannerNowBtn">今にもどる</button>`;
    banner.style.marginBottom = '10px';
    content.appendChild(banner);
    banner.querySelector('#bannerNowBtn').addEventListener('click', () => {
      S.year = TODAY_YEAR;
      loadState();
    });
  }

  // Day actions card
  const actCard = renderDayActions(_currentActions, S.date);
  if (actCard) content.appendChild(actCard);

  // Title row
  const titleRow = el('div', 'map-title-row');
  const titleSpan = el('span', 'map-title'); titleSpan.textContent = area.name;
  titleRow.appendChild(titleSpan);
  const addBedBtn = el('button', 'btn-add-bed');
  addBedBtn.textContent = '+ 畝を追加';
  addBedBtn.addEventListener('click', () => openAddBedForm(_currentGarden));
  titleRow.appendChild(addBedBtn);
  content.appendChild(titleRow);

  // Map
  const map = el('div', 'garden-map');
  map.style.aspectRatio = `${area.cols} / ${area.rows}`;
  map.style.marginBottom = '8px';
  map.style.marginTop = '4px';

  // 3m(30マス)ごとに濃淡ストライプ
  const sp  = (60 / area.rows * 100).toFixed(4);   // 1ストライプの%（3m=60マス）
  const sp2 = (60 / area.rows * 200).toFixed(4);   // 繰り返し幅の%
  map.style.background =
    `repeating-linear-gradient(to bottom,` +
    `transparent 0%,transparent ${sp}%,` +
    `rgba(0,0,0,0.05) ${sp}%,rgba(0,0,0,0.05) ${sp2}%),` +
    `linear-gradient(to bottom,#d6cbb3,#cdc2a9)`;

  const woodV = 'repeating-linear-gradient(90deg,#cdb083 0,#cdb083 4px,#bb9e6c 4px,#bb9e6c 5px)';
  const woodH = 'repeating-linear-gradient(0deg,#cdb083 0,#cdb083 4px,#bb9e6c 4px,#bb9e6c 5px)';

  // SVGグリッド＋目盛り（畝ボタンの下に描画）
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${area.cols} ${area.rows}`);
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';

  const mkLine = (x1, y1, x2, y2, stroke, sw) => {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', sw);
    svg.appendChild(l);
  };

  // 縦グリッド（1mごと = 20マスごと）
  for (let c = 20; c < area.cols; c += 20) {
    mkLine(c, 0, c, area.rows, 'rgba(0,0,0,0.07)', '0.25');
  }
  // 横グリッド（1mごと = 20マスごと）
  for (let r = 20; r < area.rows; r += 20) {
    mkLine(0, r, area.cols, r, 'rgba(0,0,0,0.07)', '0.25');
  }

  // 3m目盛りラベル（左端）
  for (let r = 0; r <= area.rows; r += 60) {
    const isFirst = r === 0;
    const isLast  = r === area.rows;
    const labelY  = isFirst ? r + 0.8 : isLast ? r - 5.6 : r - 2.4;
    // 背景
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '0.8'); bg.setAttribute('y', String(labelY));
    bg.setAttribute('width', '11'); bg.setAttribute('height', '4.8');
    bg.setAttribute('rx', '1.4');
    bg.setAttribute('fill', 'rgba(246,242,232,0.82)');
    svg.appendChild(bg);
    // テキスト
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', '6.4');
    txt.setAttribute('y', String(labelY + 2.4));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', '3.8');
    txt.setAttribute('font-family', 'sans-serif');
    txt.setAttribute('font-weight', '700');
    txt.setAttribute('fill', 'rgba(80,58,28,0.65)');
    txt.textContent = `${r / 20}m`;
    svg.appendChild(txt);
  }

  map.appendChild(svg);

  data.beds.forEach(bed => {
    const btn = el('button', bed.crop ? 'bed-btn' : 'bed-btn empty');
    const left   = (bed.col_start / area.cols) * 100;
    const top    = (bed.row_start / area.rows) * 100;
    const width  = ((bed.col_end - bed.col_start + 1) / area.cols) * 100;
    const height = ((bed.row_end - bed.row_start + 1) / area.rows) * 100;
    btn.style.cssText = `left:${left}%;top:${top}%;width:${width}%;height:${height}%`;

    if (bed.crop) {
      const isV = (bed.row_end - bed.row_start) > (bed.col_end - bed.col_start);
      btn.style.background = isV ? woodV : woodH;

      const chip = el('span', 'bed-chip');
      const dot  = el('span', 'bed-dot');
      dot.style.background = bed.crop.family_color;
      const name = el('span', 'bed-name');
      name.textContent = bed.crop.name;
      chip.appendChild(dot); chip.appendChild(name);
      btn.appendChild(chip);

      if (bed.rotation.level === 'high' || bed.rotation.level === 'mid') {
        const wd = el('span', 'warn-dot');
        wd.style.background = bed.rotation.level === 'high' ? '#b3564a' : '#c0883a';
        btn.appendChild(wd);
      }
    } else {
      const chip = el('span', 'bed-empty-chip');
      const dot  = el('span', 'bed-empty-dot');
      const name = el('span', 'bed-empty-name');
      name.textContent = '空き';
      chip.appendChild(dot); chip.appendChild(name);
      btn.appendChild(chip);
    }

    btn.addEventListener('click', () => openDetail(bed.id, S.date));
    map.appendChild(btn);
  });

  content.appendChild(map);

  // Legend
  const families = [...new Set(
    data.beds.filter(b => b.crop).map(b => ({name: b.crop.family, color: b.crop.family_color}))
      .map(f => JSON.stringify(f))
  )].map(s => JSON.parse(s));

  if (families.length) {
    const legend = el('div', 'legend-wrap');
    families.forEach(f => {
      const item = el('div', 'legend-item');
      const dot  = el('span', 'legend-dot');
      dot.style.background = f.color;
      const name = el('span', 'legend-name');
      name.textContent = f.name;
      item.appendChild(dot); item.appendChild(name);
      legend.appendChild(item);
    });
    content.appendChild(legend);
  }

  const hint = el('div', 'map-hint');
  hint.textContent = '畝をタップで作物の記録・連作チェックを表示';
  content.appendChild(hint);
}

// ══════════════════════════════════════════════════════
// ── Render: Compare ───────────────────────────────────
// ══════════════════════════════════════════════════════
function renderCompare(now, past) {
  const content = document.getElementById('tabContent');
  content.innerHTML = '';

  const head = el('div', 'compare-head');
  head.innerHTML = `
    <div class="compare-col-head">
      <div class="compare-col-label">今</div>
      <div class="compare-col-sub">${TODAY_YEAR}年</div>
    </div>
    <div class="compare-col-head">
      <div class="compare-col-label past">過去の同時期</div>
      <div class="compare-col-sub">${compareYear()}年</div>
    </div>`;
  content.appendChild(head);

  // Build a map from bed id → crop for now and past
  const nowMap  = Object.fromEntries(now.beds.map(b => [b.id, b]));
  const pastMap = Object.fromEntries(past.beds.map(b => [b.id, b]));
  const allBedIds = [...new Set([...now.beds.map(b=>b.id), ...past.beds.map(b=>b.id)])];

  allBedIds.forEach(id => {
    const nb = nowMap[id];
    const pb = pastMap[id];
    const bedName = (nb || pb).name;
    const rot  = nb?.rotation || {level:'none'};
    const rc   = ROT_COLOR[rot.level] || ROT_COLOR.none;
    const flagLabels = {high:'連作注意', mid:'2年連続', low:'やや注意'};

    const row  = el('div', 'compare-row');
    const rowHead = el('div', 'compare-row-head');
    const lbl  = el('span', 'compare-row-label');
    lbl.textContent = bedName;
    rowHead.appendChild(lbl);
    if (rot.level === 'high' || rot.level === 'mid' || rot.level === 'low') {
      const flag = el('span', 'compare-flag');
      flag.textContent = flagLabels[rot.level];
      flag.style.cssText = `background:${rc.bg};color:${rc.c}`;
      rowHead.appendChild(flag);
    }
    row.appendChild(rowHead);

    const cols = el('div', 'compare-cols');
    [['now', nb?.crop], ['past', pb?.crop]].forEach(([side, crop]) => {
      const cell = el('div', 'compare-cell');
      if (crop) {
        cell.style.cssText = `background:${crop.family_tint};border:1px solid ${crop.family_color}40`;
        const name = el('span', 'compare-cell-name');
        name.style.color = crop.family_color;
        name.textContent = crop.name;
        const sub = el('span', 'compare-cell-sub');
        sub.textContent = crop.family;
        cell.appendChild(name); cell.appendChild(sub);
      } else {
        cell.style.cssText = 'background:#f1ecdd;border:1.5px dashed #cfc8b4';
        const name = el('span', 'compare-cell-name empty');
        name.textContent = '空き';
        const sub = el('span', 'compare-cell-sub');
        sub.textContent = side === 'past' ? '未記録' : '';
        cell.appendChild(name); cell.appendChild(sub);
      }
      cols.appendChild(cell);
    });
    row.appendChild(cols);
    content.appendChild(row);
  });

  const hint = el('div', 'compare-hint');
  hint.textContent = '上の年スクラバーで比較する年を切り替え';
  content.appendChild(hint);
}

// ══════════════════════════════════════════════════════
// ── Render: Timeline ──────────────────────────────────
// ══════════════════════════════════════════════════════
function renderTimeline(years, allData) {
  const content = document.getElementById('tabContent');
  content.innerHTML = '';

  const card = el('div', 'tl-card');
  const cols = years.length;

  // Head row
  const head = el('div', 'tl-head');
  head.style.gridTemplateColumns = `30px ${years.map(() => '1fr').join(' ')}`;
  const empty = el('div'); head.appendChild(empty);
  years.forEach((y, i) => {
    const cell = el('div', 'tl-head-cell' + (y === S.year ? ' active' : ''));
    cell.textContent = String(y);
    head.appendChild(cell);
  });
  card.appendChild(head);

  // Collect all bed ids in order (from first year's data or sorted)
  const bedOrder = allData[allData.length - 1]?.beds.map(b => b.id) || [];
  const bedNames = {};
  allData.forEach(d => d.beds.forEach(b => { bedNames[b.id] = b.name; }));
  // Merge any bed ids not in latest year
  allData.forEach(d => d.beds.forEach(b => {
    if (!bedOrder.includes(b.id)) bedOrder.push(b.id);
  }));

  // Build cropMap: bedId → year → crop
  const cropMap = {};
  allData.forEach((d, i) => {
    const y = years[i];
    d.beds.forEach(b => {
      if (!cropMap[b.id]) cropMap[b.id] = {};
      cropMap[b.id][y] = b.crop;
    });
  });

  bedOrder.forEach(bedId => {
    const row = el('div', 'tl-row-grid');
    row.style.gridTemplateColumns = `30px ${years.map(() => '1fr').join(' ')}`;
    const label = el('div', 'tl-row-label');
    label.textContent = bedNames[bedId] || '';
    row.appendChild(label);

    years.forEach((y, i) => {
      const crop = cropMap[bedId]?.[y];
      const isActiveYear = y === S.year;
      const btn = el('button', 'tl-cell' + (crop ? '' : ' empty'));
      btn.textContent = crop ? crop.name : '—';
      if (crop) {
        btn.style.cssText = `background:${crop.family_tint};color:${crop.family_color}`;
        if (isActiveYear) {
          btn.style.border = `2px solid var(--accent)`;
        } else {
          btn.style.border = `1px solid ${crop.family_color}40`;
        }
      } else if (isActiveYear) {
        btn.classList.add('active-border');
        btn.style.borderColor = 'var(--accent)';
      }
      btn.addEventListener('click', () => {
        S.year = y;
        const detailDate = (y === TODAY_YEAR) ? TODAY : `${y}-12-31`;
        openDetail(bedId, detailDate);
      });
      row.appendChild(btn);
    });
    card.appendChild(row);
  });

  content.appendChild(card);

  // Legend
  const famSet = {};
  allData.forEach(d => d.beds.forEach(b => {
    if (b.crop) famSet[b.crop.family] = b.crop.family_color;
  }));
  if (Object.keys(famSet).length) {
    const legend = el('div', 'tl-legend');
    Object.entries(famSet).slice(0, 8).forEach(([name, color]) => {
      const item = el('div', 'legend-item');
      const dot  = el('span', 'legend-dot');
      dot.style.background = color;
      const lbl  = el('span', 'legend-name');
      lbl.textContent = name;
      item.appendChild(dot); item.appendChild(lbl);
      legend.appendChild(item);
    });
    content.appendChild(legend);
  }
}

// ══════════════════════════════════════════════════════
// ── Detail sheet ──────────────────────────────────────
// ══════════════════════════════════════════════════════
// ナビ操作後のゴーストクリック対策
let _navTs = 0;
function markNav() { _navTs = Date.now(); }

// 「今にもどる」バナーボタン用
function loadState() {
  closeDetail();
  markNav();
  loadGardenTab();
}

async function openDetail(bedId, dateStr) {
  if (Date.now() - _navTs < 500) return;  // ナビ直後のゴーストクリックを無視
  const res  = await fetch(`${API_DETAIL(bedId)}?date=${dateStr}`);
  const data = await res.json();
  renderDetail(data);
  document.getElementById('overlay').classList.add('show');
  document.getElementById('detailSheet').classList.add('show');
}

function closeDetail() {
  _adjOpen     = false;
  _cropAdjOpen = {};
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('detailSheet').classList.remove('show');
}

// ══════════════════════════════════════════════════════
// ── Template mini-map ─────────────────────────────────
// ══════════════════════════════════════════════════════
function _buildTmplMap(area, beds, onSelect) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  // Landscape: row axis → X (18m), col axis → Y (7m)
  svg.setAttribute('viewBox', `0 0 ${area.rows} ${area.cols}`);
  svg.style.cssText = `width:100%;display:block;cursor:default;`;
  svg.style.aspectRatio = `${area.rows} / ${area.cols}`;

  // Background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('x','0'); bg.setAttribute('y','0');
  bg.setAttribute('width', area.rows); bg.setAttribute('height', area.cols);
  bg.setAttribute('fill', '#cdc2a9');
  svg.appendChild(bg);

  // 1m grid lines (every 10 grid units)
  for (let r = 10; r < area.rows; r += 10) {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', r); l.setAttribute('y1', 0);
    l.setAttribute('x2', r); l.setAttribute('y2', area.cols);
    l.setAttribute('stroke', 'rgba(0,0,0,0.07)'); l.setAttribute('stroke-width', '0.25');
    svg.appendChild(l);
  }

  beds.forEach(bed => {
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = 'pointer';

    // In landscape: x=row_start, y=col_start, w=rows span, h=cols span
    const bx = bed.row_start;
    const by = bed.col_start;
    const bw = bed.row_end - bed.row_start + 1;
    const bh = bed.col_end  - bed.col_start + 1;

    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', bx); r.setAttribute('y', by);
    r.setAttribute('width', bw); r.setAttribute('height', bh);
    r.setAttribute('fill', '#c8b68a');
    r.setAttribute('stroke', '#a98f63'); r.setAttribute('stroke-width', '0.4');
    r.setAttribute('rx', '1'); r.setAttribute('ry', '1');
    r.dataset.bedId = bed.id;

    const fs = Math.min(9, bh * 0.52, bw * 0.13).toFixed(1);
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', bx + bw / 2); txt.setAttribute('y', by + bh / 2);
    txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', fs); txt.setAttribute('font-family', 'sans-serif');
    txt.setAttribute('font-weight', '700'); txt.setAttribute('fill', '#5a4020');
    txt.setAttribute('pointer-events', 'none');
    txt.textContent = bed.name;

    g.appendChild(r); g.appendChild(txt);

    g.addEventListener('click', () => {
      svg.querySelectorAll('[data-bed-id]').forEach(el => {
        el.setAttribute('fill', '#c8b68a');
        el.setAttribute('stroke', '#a98f63'); el.setAttribute('stroke-width', '0.4');
      });
      r.setAttribute('fill', '#b8d4a8');
      r.setAttribute('stroke', '#5d8a55'); r.setAttribute('stroke-width', '1.5');
      onSelect(bed);
    });

    svg.appendChild(g);
  });

  return svg;
}

// ══════════════════════════════════════════════════════
// ── Add bed form ──────────────────────────────────────
// ══════════════════════════════════════════════════════
function openAddBedForm(gardenData) {
  const area    = gardenData.area;
  const lenCm   = area.rows * 5;
  const widCm   = area.cols * 5;
  const years   = gardenData.available_years || [];

  // デフォルト位置: 現在表示中の畝の最下端 + 40cm ギャップ
  const curBeds = gardenData.beds || [];
  let defRowStart = 0;
  if (curBeds.length > 0) {
    defRowStart = (Math.max(...curBeds.map(b => b.row_end)) + 1 + 8) * 5;  // +8 = 40cmギャップ
  }
  const defRowEnd = Math.min(lenCm - 5, defRowStart + 80);

  const c = document.getElementById('detailContent');
  c.innerHTML = '';
  document.getElementById('overlay').classList.add('show');
  document.getElementById('detailSheet').classList.add('show');

  const form = el('div', 'log-form');

  // ── ヘッダー ──────────────────────────────────────────
  const topRow = el('div', 'detail-top');
  const titleWrap = el('div');
  const title = el('div', 'log-form-title'); title.textContent = '畝を追加';
  titleWrap.appendChild(title);
  const closeBtn = el('button', 'btn-close'); closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDetail);
  topRow.appendChild(titleWrap); topRow.appendChild(closeBtn);
  form.appendChild(topRow);

  // ── 畝の名前 ─────────────────────────────────────────
  const nameSec = el('div');
  const nameLbl = el('div', 'form-label'); nameLbl.textContent = '畝の名前';
  const nameInp = el('input');
  nameInp.type = 'text'; nameInp.className = 'log-date-input';
  nameInp.placeholder = '例：1番畝、北側の畝…';
  nameSec.appendChild(nameLbl); nameSec.appendChild(nameInp);
  form.appendChild(nameSec);

  // ── 畝立て日 ─────────────────────────────────────────
  const dateSec = el('div');
  const dateLbl = el('div', 'form-label'); dateLbl.textContent = '畝立て日';
  const dateInp = el('input');
  dateInp.type = 'date'; dateInp.className = 'log-date-input';
  dateInp.value = TODAY; dateInp.max = TODAY;
  dateSec.appendChild(dateLbl); dateSec.appendChild(dateInp);
  form.appendChild(dateSec);

  // ── 位置・サイズ（inputs を先に定義してテンプレートと共有） ──
  const inputs = {};
  const posDefs = [
    {key:'rowStart', label:'上端（上から）', val: defRowStart, max: lenCm - 5},
    {key:'rowEnd',   label:'下端（上から）', val: defRowEnd,   max: lenCm - 5},
    {key:'colStart', label:'左端（左から）', val: 0,           max: widCm - 5},
    {key:'colEnd',   label:'右端（左から）', val: widCm - 5,   max: widCm - 5},
  ];

  // ── テンプレートを選ぶ ────────────────────────────────
  const tmplSec = el('div');
  const tmplLbl = el('div', 'form-label'); tmplLbl.textContent = 'テンプレートを選ぶ（任意）';
  tmplSec.appendChild(tmplLbl);

  // 年チップ
  const yearChips = el('div', 'add-bed-tmpl-year-chips');
  const mapWrap = el('div', 'add-bed-tmpl-map-wrap');
  mapWrap.style.display = 'none';
  const mapHint = el('div', 'add-bed-tmpl-hint');
  mapHint.textContent = '畝をタップして選択';
  mapHint.style.display = 'none';
  const tmplInfo = el('div', 'add-bed-tmpl-info');
  tmplInfo.style.display = 'none';

  years.forEach(y => {
    const chip = el('button', 'add-bed-tmpl-year-chip');
    chip.type = 'button'; chip.textContent = `${y}年`;
    chip.addEventListener('click', async () => {
      yearChips.querySelectorAll('.add-bed-tmpl-year-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      tmplInfo.style.display = 'none';
      mapWrap.innerHTML = '<div style="padding:12px;font-size:11px;color:#a79e88;text-align:center">読み込み中…</div>';
      mapWrap.style.display = '';
      mapHint.style.display = 'none';

      const data = await fetch(`${API_STATE(S.areaId)}?year=${y}`).then(r => r.json());
      mapWrap.innerHTML = '';

      if (!data.beds || !data.beds.length) {
        mapWrap.innerHTML = '<div style="padding:10px;font-size:11px;color:#a79e88;text-align:center">その年の畝はありません</div>';
        return;
      }

      const svg = _buildTmplMap(area, data.beds, bed => {
        const h = (bed.row_end - bed.row_start + 1) * 5;  // 縦（row方向）cm
        const w = (bed.col_end - bed.col_start + 1) * 5;  // 横（col方向）cm
        inputs.rowStart.value = bed.row_start * 5;
        inputs.rowEnd.value   = bed.row_end   * 5;
        inputs.colStart.value = bed.col_start * 5;
        inputs.colEnd.value   = bed.col_end   * 5;
        const nameEl = tmplInfo.querySelector('.tmpl-sel-name');
        const subEl  = tmplInfo.querySelector('.add-bed-tmpl-info-sub');
        nameEl.textContent = `「${bed.name}」を選択中`;
        subEl.textContent  = `縦 ${h}cm × 横 ${w}cm`;
        tmplInfo.style.display = 'flex';
        setTimeout(() => posSec.scrollIntoView({block:'nearest', behavior:'smooth'}), 80);
      });
      mapWrap.appendChild(svg);
      mapHint.style.display = '';
    });
    yearChips.appendChild(chip);
  });

  const nameEl = el('span', 'tmpl-sel-name');
  const subEl  = el('span', 'add-bed-tmpl-info-sub');
  tmplInfo.appendChild(nameEl); tmplInfo.appendChild(subEl);

  tmplSec.appendChild(yearChips);
  tmplSec.appendChild(mapWrap);
  tmplSec.appendChild(mapHint);
  tmplSec.appendChild(tmplInfo);
  form.appendChild(tmplSec);

  // ── 位置・サイズ入力 ─────────────────────────────────
  const posSec = el('div');
  const posLbl = el('div', 'form-label'); posLbl.textContent = '位置とサイズ（cm）';
  const posHint = el('div', 'add-bed-pos-hint');
  posHint.textContent = `畑全体: 縦${lenCm}cm × 横${widCm}cm　上・左が 0cm`;
  const posGrid = el('div', 'add-bed-pos-grid');
  posSec.appendChild(posLbl); posSec.appendChild(posHint); posSec.appendChild(posGrid);

  posDefs.forEach(({key, label, val, max}) => {
    const row = el('div', 'plant-range-row');
    const lbl = el('span', 'plant-range-label'); lbl.textContent = label;
    const inp = el('input');
    inp.type = 'number'; inp.className = 'plant-range-input';
    inp.min = 0; inp.max = max; inp.step = 5; inp.value = val;
    const unit = el('span', 'plant-range-unit'); unit.textContent = 'cm';
    row.appendChild(lbl); row.appendChild(inp); row.appendChild(unit);
    posGrid.appendChild(row);
    inputs[key] = inp;
  });
  form.appendChild(posSec);

  // ── 追加ボタン ────────────────────────────────────────
  const submitBtn = el('button', 'log-submit');
  submitBtn.textContent = '追加する';
  submitBtn.addEventListener('click', async () => {
    const name = nameInp.value.trim();
    if (!name) { nameInp.focus(); return; }
    submitBtn.disabled = true;
    try {
      const res = await fetch(API_BED_ADD(area.id), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
        body: JSON.stringify({
          name,
          created_at:   dateInp.value,
          row_start_cm: parseInt(inputs.rowStart.value) || 0,
          row_end_cm:   parseInt(inputs.rowEnd.value)   || 80,
          col_start_cm: parseInt(inputs.colStart.value) || 0,
          col_end_cm:   parseInt(inputs.colEnd.value)   || widCm - 10,
        }),
      });
      if (!res.ok) throw new Error();
      closeDetail();
      await loadGardenTab();
    } catch {
      submitBtn.disabled = false;
      alert('保存に失敗しました。');
    }
  });
  form.appendChild(submitBtn);

  c.appendChild(form);
}

// ══════════════════════════════════════════════════════
// ── Plant form ────────────────────────────────────────
// ══════════════════════════════════════════════════════
let _ps = {};  // plant state

async function openPlantForm(bed, dateStr) {
  _ps = {bed, dateStr, vt: null, plantedAt: TODAY, variety: '', positions: [], rsOff: 0, reOff: 0, plantCount: 1};

  const c = document.getElementById('detailContent');
  c.innerHTML = '<div style="text-align:center;padding:24px;color:#a79e88;font-size:13px">読み込み中…</div>';

  const {families} = await fetch(API_VEG_TYPES()).then(r => r.json());
  c.innerHTML = '';

  const form = el('div', 'log-form');

  // 戻る
  const back = el('button', 'log-form-back');
  back.innerHTML = '&#8592; 詳細に戻る';
  back.addEventListener('click', () => openDetail(bed.id, dateStr));
  form.appendChild(back);

  const title = el('div', 'log-form-title');
  title.textContent = 'この畝に植える';
  form.appendChild(title);

  // 畝サイズ表示
  const bedLen = (bed.row_end - bed.row_start + 1) * 5;
  const bedWid = (bed.col_end - bed.col_start + 1) * 5;
  const bedInfo = el('div', 'plant-bed-info');
  bedInfo.textContent = `${bed.name}　${bedLen}cm × ${bedWid}cm`;
  form.appendChild(bedInfo);

  // 野菜選択
  const vtLabel = el('div', 'form-label');
  vtLabel.textContent = '野菜を選ぶ';
  form.appendChild(vtLabel);

  const allChips = [];
  const vtWrap = el('div');

  families.forEach(fam => {
    const famWrap = el('div', 'plant-fam-wrap');
    const famHdr = el('div', 'plant-fam-label');
    famHdr.textContent = fam.name;
    famHdr.style.color = fam.color;
    famWrap.appendChild(famHdr);

    const chips = el('div', 'plant-vt-chips');
    fam.types.forEach(vt => {
      const chip = el('button', 'plant-vt-chip');
      chip.type = 'button';
      chip.textContent = vt.name;
      chip.addEventListener('click', () => {
        allChips.forEach(ch => { ch.classList.remove('selected'); ch.style.cssText = ''; });
        chip.classList.add('selected');
        chip.style.cssText = `background:${fam.color};color:#fff;border-color:${fam.color}`;
        _ps.vt = {...vt, family_color: fam.color, family_name: fam.name};
        _ps.rsOff = 0;
        _ps.reOff = bed.row_end - bed.row_start;
        _buildPlantRangeSec(rangeSec, bed, bedLen);
        submitBtn.style.display = '';
        setTimeout(() => rangeSec.scrollIntoView({block:'nearest', behavior:'smooth'}), 60);
      });
      chips.appendChild(chip);
      allChips.push(chip);
    });
    famWrap.appendChild(chips);
    vtWrap.appendChild(famWrap);
  });
  form.appendChild(vtWrap);

  // 植付設定セクション（選択後に展開）
  const rangeSec = el('div', 'plant-range-sec');
  rangeSec.style.display = 'none';
  form.appendChild(rangeSec);

  // 植えるボタン
  const submitBtn = el('button', 'log-submit');
  submitBtn.textContent = '植える';
  submitBtn.style.display = 'none';
  submitBtn.addEventListener('click', _doPlant);
  form.appendChild(submitBtn);

  c.appendChild(form);
}

function _buildPlantRangeSec(sec, bed, bedLen) {
  sec.innerHTML = '';
  sec.style.display = '';
  const vt = _ps.vt;

  // 植付方法バッジ
  const METHOD_JP = {individual:'個体植え', row:'筋蒔き', block:'まとめ植え'};
  const badge = el('span', 'plant-method-badge');
  badge.textContent = METHOD_JP[vt.planting_method] || vt.planting_method;
  badge.style.cssText = `background:${vt.family_color}22;color:${vt.family_color};border:1px solid ${vt.family_color}55`;
  sec.appendChild(badge);

  if (vt.planting_method === 'individual') {
    _buildIndividualSec(sec, bed, bedLen);
  } else {
    _buildAreaSec(sec, bed, bedLen);
  }

  // 品種
  const varSec = el('div');
  const varLbl = el('div', 'form-label'); varLbl.textContent = '品種（任意）';
  const varInp = el('input');
  varInp.type = 'text'; varInp.className = 'log-date-input';
  varInp.placeholder = '例：桃太郎、黒陽…';
  varInp.addEventListener('input', () => { _ps.variety = varInp.value; });
  varSec.appendChild(varLbl); varSec.appendChild(varInp);
  sec.appendChild(varSec);

  // 植え付け日
  const dateSec = el('div');
  const dateLbl = el('div', 'form-label'); dateLbl.textContent = '植え付け日';
  const dateInp = el('input');
  dateInp.type = 'date'; dateInp.className = 'log-date-input';
  dateInp.value = TODAY; dateInp.max = TODAY;
  dateInp.addEventListener('change', () => { _ps.plantedAt = dateInp.value; });
  dateSec.appendChild(dateLbl); dateSec.appendChild(dateInp);
  sec.appendChild(dateSec);
}

function _buildIndividualSec(sec, bed, bedLen) {
  const vt = _ps.vt;
  const spacingCells = Math.max(1, Math.round(vt.spacing_cm / 5));

  // 開始位置
  const startRow = el('div', 'plant-range-row');
  const startLbl = el('span', 'plant-range-label'); startLbl.textContent = '開始位置';
  const startInp = el('input');
  startInp.type = 'number'; startInp.className = 'plant-range-input';
  startInp.min = 0; startInp.max = Math.max(0, bedLen - 5); startInp.step = 5; startInp.value = 0;
  const startUnit = el('span', 'plant-range-unit');
  startUnit.textContent = `cm（0〜${bedLen - 5}cm）`;
  startRow.appendChild(startLbl); startRow.appendChild(startInp); startRow.appendChild(startUnit);
  sec.appendChild(startRow);

  // 株間情報
  const spInfo = el('div', 'plant-spacing-info');
  spInfo.textContent = `推奨株間: ${vt.spacing_cm}cm`;
  sec.appendChild(spInfo);

  // 株数ステッパー
  const countRow = el('div', 'plant-count-row');
  const countLbl = el('span', 'plant-count-label'); countLbl.textContent = '株数';
  const stepper = el('div', 'plant-count-stepper');
  const minusBtn = el('button', 'plant-count-btn');
  minusBtn.type = 'button'; minusBtn.textContent = '−';
  const countDisp = el('span', 'plant-count-val');
  const plusBtn = el('button', 'plant-count-btn');
  plusBtn.type = 'button'; plusBtn.textContent = '+';
  stepper.appendChild(minusBtn); stepper.appendChild(countDisp); stepper.appendChild(plusBtn);
  countRow.appendChild(countLbl); countRow.appendChild(stepper);
  sec.appendChild(countRow);

  // プレビュー
  const prevLbl = el('div', 'form-label'); prevLbl.textContent = '配置プレビュー';
  const preview = el('div', 'plant-preview');
  sec.appendChild(prevLbl); sec.appendChild(preview);

  function autoCount() {
    const startCm = parseInt(startInp.value) || 0;
    return Math.max(1, Math.floor((bedLen - startCm) / vt.spacing_cm) + 1);
  }

  function calcPositions() {
    const startGrid = Math.floor((parseInt(startInp.value) || 0) / 5);
    return Array.from({length: _ps.plantCount}, (_, i) => startGrid + i * spacingCells);
  }

  function refresh() {
    countDisp.textContent = _ps.plantCount;
    _ps.positions = calcPositions();
    preview.innerHTML = '';
    _ps.positions.forEach((p, i) => {
      if (i > 0) {
        const line = el('div', 'plant-prev-line');
        preview.appendChild(line);
      }
      const item = el('div', 'plant-prev-item');
      const dot  = el('div', 'plant-prev-dot');
      dot.style.background = vt.family_color;
      const lbl  = el('div', 'plant-prev-lbl');
      lbl.textContent = `${p * 5 - bed.row_start * 5}cm`;
      item.appendChild(dot); item.appendChild(lbl);
      preview.appendChild(item);
    });
  }

  _ps.plantCount = autoCount();
  refresh();

  startInp.addEventListener('input', () => { _ps.plantCount = autoCount(); refresh(); });
  minusBtn.addEventListener('click', () => { if (_ps.plantCount > 1) { _ps.plantCount--; refresh(); } });
  plusBtn.addEventListener('click', () => { _ps.plantCount++; refresh(); });
}

function _buildAreaSec(sec, bed, bedLen) {
  const makeRow = (labelText, defaultVal, maxVal, unitText, onChange) => {
    const row = el('div', 'plant-range-row');
    const lbl = el('span', 'plant-range-label'); lbl.textContent = labelText;
    const inp = el('input');
    inp.type = 'number'; inp.className = 'plant-range-input';
    inp.min = 0; inp.max = maxVal; inp.step = 5; inp.value = defaultVal;
    const unit = el('span', 'plant-range-unit'); unit.textContent = unitText;
    inp.addEventListener('input', () => onChange(parseInt(inp.value) || 0));
    row.appendChild(lbl); row.appendChild(inp); row.appendChild(unit);
    sec.appendChild(row);
  };

  makeRow('開始位置', 0, bedLen, 'cm',
    v => { _ps.rsOff = Math.floor(v / 5); });
  makeRow('終了位置', bedLen, bedLen, `cm（最大 ${bedLen}cm）`,
    v => { _ps.reOff = Math.floor(v / 5); });
}

async function _doPlant() {
  const {bed, dateStr, vt, plantedAt, variety, positions, rsOff, reOff} = _ps;
  if (!vt) return;

  const body = {
    vegetable_type_id: vt.id,
    planted_at: plantedAt || TODAY,
    variety: variety || '',
    method: vt.planting_method,
  };
  if (vt.planting_method === 'individual') {
    body.positions = positions || [];
  } else {
    body.row_start_offset = rsOff || 0;
    body.row_end_offset   = reOff ?? (bed.row_end - bed.row_start);
  }

  try {
    const res = await fetch(API_BED_PLANT(bed.id), {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error();
    await openDetail(bed.id, dateStr);
    const mapData = await fetch(`${API_STATE(S.areaId)}?date=${S.date}`).then(r => r.json());
    renderGarden(mapData);
  } catch {
    alert('保存に失敗しました。');
  }
}

// ── インライン日付エディタ ─────────────────────────────
function _mkInlineDateEditor(label, initDate, onSave) {
  const wrap = el('div');
  let cur = initDate;

  function showDisplay() {
    wrap.innerHTML = '';
    const row = el('div', 'inline-date-row');
    const val = el('span', 'inline-date-val');
    val.textContent = `${label}：${cur}`;
    const btn = el('button', 'btn-inline-edit');
    btn.type = 'button'; btn.textContent = '編集';
    btn.addEventListener('click', showForm);
    row.appendChild(val); row.appendChild(btn);
    wrap.appendChild(row);
  }

  function showForm() {
    wrap.innerHTML = '';
    const form = el('div', 'inline-date-form');
    const lbl = el('span', 'harvest-form-label'); lbl.textContent = label;
    const inp = el('input');
    inp.type = 'date'; inp.className = 'harvest-date-input';
    inp.value = cur; inp.max = TODAY;
    const saveBtn = el('button', 'btn-harvest-confirm');
    saveBtn.type = 'button'; saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try { await onSave(inp.value); cur = inp.value; } catch {}
      showDisplay();
    });
    const cancelBtn = el('button', 'btn-harvest-cancel');
    cancelBtn.type = 'button'; cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', showDisplay);
    form.appendChild(lbl); form.appendChild(inp);
    form.appendChild(saveBtn); form.appendChild(cancelBtn);
    wrap.appendChild(form);
  }

  showDisplay();
  return wrap;
}

// 品種など自由テキストのインライン編集
function _mkInlineTextEditor(label, initVal, placeholder, onSave) {
  const wrap = el('div');
  let cur = initVal || '';

  function showDisplay() {
    wrap.innerHTML = '';
    const row = el('div', 'inline-date-row');
    const val = el('span', 'inline-date-val');
    val.textContent = cur ? `${label}：${cur}` : `${label}：（未設定）`;
    const btn = el('button', 'btn-inline-edit');
    btn.type = 'button'; btn.textContent = '編集';
    btn.addEventListener('click', showForm);
    row.appendChild(val); row.appendChild(btn);
    wrap.appendChild(row);
  }

  function showForm() {
    wrap.innerHTML = '';
    const form = el('div', 'inline-date-form');
    const lbl = el('span', 'harvest-form-label'); lbl.textContent = label;
    const inp = el('input');
    inp.type = 'text'; inp.className = 'inline-edit-input';
    inp.value = cur; inp.placeholder = placeholder || '';
    const saveBtn = el('button', 'btn-harvest-confirm');
    saveBtn.type = 'button'; saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try { await onSave(inp.value.trim()); cur = inp.value.trim(); } catch {}
      showDisplay();
    });
    const cancelBtn = el('button', 'btn-harvest-cancel');
    cancelBtn.type = 'button'; cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', showDisplay);
    form.appendChild(lbl); form.appendChild(inp);
    form.appendChild(saveBtn); form.appendChild(cancelBtn);
    wrap.appendChild(form);
  }

  showDisplay();
  return wrap;
}

// 作物名（VegetableType）のインライン選択編集
function _mkInlineVegTypeEditor(label, initId, initName, onSave) {
  const wrap = el('div');
  let curId = initId;
  let curName = initName;

  function showDisplay() {
    wrap.innerHTML = '';
    const row = el('div', 'inline-date-row');
    const val = el('span', 'inline-date-val');
    val.textContent = `${label}：${curName}`;
    const btn = el('button', 'btn-inline-edit');
    btn.type = 'button'; btn.textContent = '変更';
    btn.addEventListener('click', showForm);
    row.appendChild(val); row.appendChild(btn);
    wrap.appendChild(row);
  }

  async function showForm() {
    wrap.innerHTML = '';
    const loading = el('span', 'inline-date-val');
    loading.textContent = '読み込み中…';
    wrap.appendChild(loading);

    const {families} = await fetch(API_VEG_TYPES()).then(r => r.json());

    wrap.innerHTML = '';
    const form = el('div', 'inline-date-form');
    const lbl = el('span', 'harvest-form-label'); lbl.textContent = label;
    const sel = el('select');
    sel.className = 'inline-edit-select';
    families.forEach(fam => {
      const grp = document.createElement('optgroup');
      grp.label = fam.name;
      fam.types.forEach(vt => {
        const opt = document.createElement('option');
        opt.value = vt.id; opt.textContent = vt.name;
        if (vt.id === curId) opt.selected = true;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
    const saveBtn = el('button', 'btn-harvest-confirm');
    saveBtn.type = 'button'; saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      const newId   = parseInt(sel.value);
      const newName = sel.options[sel.selectedIndex].textContent;
      try { await onSave(newId); curId = newId; curName = newName; } catch {}
      showDisplay();
    });
    const cancelBtn = el('button', 'btn-harvest-cancel');
    cancelBtn.type = 'button'; cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', showDisplay);
    form.appendChild(lbl); form.appendChild(sel);
    form.appendChild(saveBtn); form.appendChild(cancelBtn);
    wrap.appendChild(form);
  }

  showDisplay();
  return wrap;
}

// ── 調整パネル共通ビルダー ─────────────────────────────
function _buildAdjPanel(title, isOpen, onToggle, buildBody) {
  const panel = el('div', 'adj-panel');
  const toggle = el('button', 'adj-toggle' + (isOpen ? ' open' : ''));
  toggle.type = 'button';
  const tlbl = el('span'); tlbl.textContent = title;
  const tarr = el('span', 'adj-toggle-arrow'); tarr.textContent = '▼';
  toggle.appendChild(tlbl); toggle.appendChild(tarr);

  const body = el('div', 'adj-body');
  body.style.display = isOpen ? '' : 'none';

  toggle.addEventListener('click', () => {
    const next = body.style.display === 'none';
    body.style.display = next ? '' : 'none';
    toggle.classList.toggle('open', next);
    onToggle(next);
  });

  panel.appendChild(toggle);
  panel.appendChild(body);
  buildBody(body);  // body が panel に追加された後なので body.parentElement = panel
  return panel;
}

function _mkMoveGrid(onClick) {
  const grid = el('div', 'adj-move-grid');
  // 3×3: _ ↑ _ / ← _ → / _ ↓ _
  [null, {i:'↑',r:-1,c:0}, null,
   {i:'←',r:0,c:-1}, null, {i:'→',r:0,c:1},
   null, {i:'↓',r:1,c:0}, null
  ].forEach(d => {
    if (!d) { grid.appendChild(el('div')); return; }
    const btn = el('button', 'adj-btn');
    btn.type = 'button'; btn.textContent = d.i;
    btn.addEventListener('click', () => onClick(d.r, d.c));
    grid.appendChild(btn);
  });
  return grid;
}

function _mkEdgeGrid(onEdge) {
  const grid = el('div', 'adj-edge-grid');
  [
    {label:'上端', key:'drs', plus:-1, minus:+1},
    {label:'下端', key:'dre', plus:+1, minus:-1},
    {label:'左端', key:'dcs', plus:-1, minus:+1},
    {label:'右端', key:'dce', plus:+1, minus:-1},
  ].forEach(e => {
    const row = el('div', 'adj-edge-row');
    const lbl = el('span', 'adj-edge-label'); lbl.textContent = e.label;
    const btns = el('div', 'adj-edge-btns');
    const mBtn = el('button', 'adj-btn-sm'); mBtn.type='button'; mBtn.textContent='−';
    mBtn.addEventListener('click', () => onEdge(e.key, e.minus));
    const pBtn = el('button', 'adj-btn-sm'); pBtn.type='button'; pBtn.textContent='＋';
    pBtn.addEventListener('click', () => onEdge(e.key, e.plus));
    btns.appendChild(mBtn); btns.appendChild(pBtn);
    row.appendChild(lbl); row.appendChild(btns);
    grid.appendChild(row);
  });
  return grid;
}

function _mkPosDisplay(row_start, row_end, col_start, col_end, opts = {}) {
  const baseRow = opts.baseRow ?? 0;
  const baseCol = opts.baseCol ?? 0;
  const showSize = opts.showSize ?? true;

  const table = el('div', 'adj-pos-table');
  const kv = (k, v) => {
    const d = el('div', 'adj-pos-kv');
    const kEl = el('span', 'adj-pos-k'); kEl.textContent = k;
    const vEl = el('span', 'adj-pos-v'); vEl.textContent = v;
    d.appendChild(kEl); d.appendChild(vEl);
    return d;
  };

  const top    = (row_start - baseRow) * 5;
  const bottom = (row_end   - baseRow + 1) * 5;
  const left   = (col_start - baseCol) * 5;
  const right  = (col_end   - baseCol + 1) * 5;
  const h = (row_end - row_start + 1) * 5;
  const w = (col_end - col_start + 1) * 5;

  table.appendChild(kv('上端', `${top}cm`));
  table.appendChild(kv('下端', `${bottom}cm`));
  table.appendChild(kv('左端', `${left}cm`));
  table.appendChild(kv('右端', `${right}cm`));
  if (showSize) table.appendChild(kv('縦×横', `${h}cm × ${w}cm`));
  return table;
}

function renderBedAdjPanel(bed, dateStr) {
  return _buildAdjPanel('位置・サイズを調整', _adjOpen, v => { _adjOpen = v; }, body => {
    body.parentElement.insertBefore(
      _mkPosDisplay(bed.row_start, bed.row_end, bed.col_start, bed.col_end, {showSize: true}),
      body
    );
    // Move
    const moveLbl = el('div', 'adj-group-label'); moveLbl.textContent = '移動（5cm ずつ）';
    body.appendChild(moveLbl);

    const moveCropsChk = el('input');
    moveCropsChk.type = 'checkbox'; moveCropsChk.checked = true;
    moveCropsChk.id = `mc-${bed.id}`;

    body.appendChild(_mkMoveGrid((dr, dc) =>
      adjBed(bed.id, {dr, dc, move_crops: moveCropsChk.checked}, dateStr)
    ));

    const optRow = el('div', 'adj-move-opt');
    const optLbl = el('label'); optLbl.htmlFor = moveCropsChk.id;
    optLbl.textContent = '作物も連動して移動';
    optRow.appendChild(moveCropsChk); optRow.appendChild(optLbl);
    body.appendChild(optRow);

    // Resize
    const resizeLbl = el('div', 'adj-group-label');
    resizeLbl.style.marginTop = '4px';
    resizeLbl.textContent = '辺を移動（＋で外へ・−で内へ）';
    body.appendChild(resizeLbl);
    body.appendChild(_mkEdgeGrid((key, val) => adjBed(bed.id, {[key]: val}, dateStr)));
  });
}

function renderCropAdjPanel(crop, bed, bedId, dateStr) {
  return _buildAdjPanel('植わっている範囲を調整', !!_cropAdjOpen[crop.id],
    v => { _cropAdjOpen[crop.id] = v; }, body => {
      const isIndividual = crop.planting_method === 'individual';
      body.parentElement.insertBefore(
        _mkPosDisplay(crop.row_start, crop.row_end, crop.col_start, crop.col_end, {
          baseRow: bed.row_start, baseCol: bed.col_start,
          showSize: !isIndividual,
        }),
        body
      );
      const moveLbl = el('div', 'adj-group-label'); moveLbl.textContent = '移動（5cm ずつ）';
      body.appendChild(moveLbl);
      body.appendChild(_mkMoveGrid((dr, dc) => adjCrop(crop.id, {dr, dc}, bedId, dateStr)));

      const resizeLbl = el('div', 'adj-group-label');
      resizeLbl.style.marginTop = '4px';
      resizeLbl.textContent = '辺を移動（＋で外へ・−で内へ）';
      body.appendChild(resizeLbl);
      body.appendChild(_mkEdgeGrid((key, val) => adjCrop(crop.id, {[key]: val}, bedId, dateStr)));
    }
  );
}

async function adjBed(bedId, params, dateStr) {
  try {
    const res = await fetch(API_BED_ADJUST(bedId), {
      method: 'POST',
      headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
      body: JSON.stringify(params),
    });
    if (!res.ok) { alert('保存に失敗しました。'); return; }
    _adjOpen = true;
    await openDetail(bedId, dateStr);
    // 詳細を閉じずにマップだけ更新
    const mapData = await fetch(`${API_STATE(S.areaId)}?date=${S.date}`).then(r => r.json());
    renderGarden(mapData);
  } catch { alert('保存に失敗しました。'); }
}

async function adjCrop(cropId, params, bedId, dateStr) {
  try {
    const res = await fetch(API_CROP_ADJUST(cropId), {
      method: 'POST',
      headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
      body: JSON.stringify(params),
    });
    if (!res.ok) { alert('保存に失敗しました。'); return; }
    _cropAdjOpen[cropId] = true;
    await openDetail(bedId, dateStr);
    const mapData = await fetch(`${API_STATE(S.areaId)}?date=${S.date}`).then(r => r.json());
    renderGarden(mapData);
  } catch { alert('保存に失敗しました。'); }
}

function renderCropSection(crop, bed, bedId, dateStr, allCrops) {
  const section = el('div', 'crop-section');
  // 作物ヘッダー
  const head = el('div', 'crop-section-head');
  const cn = el('div', 'crop-section-name');
  cn.textContent = crop.name;
  cn.style.color = crop.family_color;
  head.appendChild(cn);
  const tags = el('div', 'detail-tags');
  const famTag = el('span', 'detail-fam-tag');
  famTag.textContent = crop.family;
  famTag.style.cssText = `color:${crop.family_color};background:${crop.family_tint}`;
  tags.appendChild(famTag);
  if (crop.variety) {
    const vt = el('span', 'detail-variety');
    vt.textContent = `品種：${crop.variety}`;
    tags.appendChild(vt);
  }
  head.appendChild(tags);
  section.appendChild(head);

  // 作物名・品種の編集
  const editBlock = el('div', 'detail-dates');
  editBlock.appendChild(_mkInlineVegTypeEditor('作物名', crop.vegetable_type_id, crop.name, async (newId) => {
    const res = await fetch(API_CROP_UPDATE(crop.id), {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
      body: JSON.stringify({vegetable_type_id: newId}),
    });
    if (!res.ok) throw new Error();
    await openDetail(bedId, dateStr);
  }));
  editBlock.appendChild(_mkInlineTextEditor('品種', crop.variety, '例：桃太郎、大玉など', async (val) => {
    const res = await fetch(API_CROP_UPDATE(crop.id), {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
      body: JSON.stringify({variety: val}),
    });
    if (!res.ok) throw new Error();
  }));
  section.appendChild(editBlock);

  // 日付・進捗
  const dateBlock = el('div', 'detail-dates');
  dateBlock.appendChild(_mkInlineDateEditor('植え付け', crop.planted_at, async (d) => {
    const res = await fetch(API_CROP_UPDATE(crop.id), {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
      body: JSON.stringify({planted_at: d}),
    });
    if (!res.ok) throw new Error();
  }));
  const harvLine = el('div', 'inline-date-row');
  const harvVal = el('span', 'inline-date-val');
  const harv = crop.expected_harvest_date
    ? `収穫予定：${crop.expected_harvest_date}`
    : (crop.harvested_at ? `収穫済：${crop.harvested_at}` : '収穫日未定');
  harvVal.textContent = harv;
  harvLine.appendChild(harvVal);
  dateBlock.appendChild(harvLine);
  if (crop.progress) {
    const pw = el('div', 'progress-wrap');
    const bg = el('div', 'progress-bar-bg');
    const bar = el('div', 'progress-bar');
    bar.style.width = `${crop.progress.pct}%`;
    bg.appendChild(bar);
    const lbl = el('div', 'progress-label');
    lbl.textContent = crop.progress.label;
    pw.appendChild(bg); pw.appendChild(lbl);
    dateBlock.appendChild(pw);
  }
  section.appendChild(dateBlock);
  // 連作チェック
  const rot = crop.rotation;
  if (rot && rot.level !== 'none') {
    const rc = ROT_COLOR[rot.level] || ROT_COLOR.ok;
    const rotBlock = el('div', 'rot-block');
    rotBlock.style.cssText = `background:${rc.bg};border:1px solid ${rc.c}40`;
    const rotHead = el('div', 'rot-head');
    const rotDot = el('span', 'rot-dot-lg');
    rotDot.style.background = rc.c;
    rotHead.appendChild(rotDot);
    const rotTitle = el('span', 'rot-title');
    rotHead.appendChild(rotTitle);
    if (rot.level === 'ok') {
      rotTitle.textContent = '連作チェック';
      rotBlock.appendChild(rotHead);
      const rotMsg = el('div', 'rot-msg');
      rotMsg.textContent = '過去数年に同じ科の栽培はありません。輪作は良好です。';
      rotBlock.appendChild(rotMsg);
    } else {
      rotTitle.textContent = `連作注意（${rot.family}）`;
      const rotSub = el('span', 'rot-sub');
      rotSub.textContent = `回避推奨 ${rot.rotation_years}年`;
      rotHead.appendChild(rotSub);
      rotBlock.appendChild(rotHead);
      const list = el('div', 'rot-conflict-list');
      (rot.conflicts || []).forEach(cf => {
        const row = el('div', 'rot-conflict-row');
        const yr = el('span', 'rot-conflict-year');
        yr.textContent = `${cf.year}年`;
        const nm = el('span', 'rot-conflict-name');
        nm.textContent = cf.name;
        const right = el('div', 'rot-conflict-right');
        const bw = el('div', 'rot-conflict-bar-wrap');
        const bar = el('div', 'rot-conflict-bar');
        bar.style.cssText = `width:${cf.pct}%;background:${rc.c}`;
        bw.appendChild(bar);
        const pct = el('span', 'rot-conflict-pct');
        pct.textContent = `${cf.pct}%`;
        right.appendChild(bw); right.appendChild(pct);
        row.appendChild(yr); row.appendChild(nm); row.appendChild(right);
        list.appendChild(row);
      });
      rotBlock.appendChild(list);
    }
    section.appendChild(rotBlock);
  }

  // 同じ野菜の他の株
  const sameCrops = (allCrops || []).filter(c => c.name === crop.name && c.id !== crop.id);

  // 収穫・撤去ボタン
  const harvestRow = el('div', 'harvest-row');
  const harvestBtn = el('button', 'btn-harvest');
  harvestBtn.textContent = '収穫・撤去';
  harvestBtn.addEventListener('click', () => {
    harvestBtn.style.display = 'none';
    const form = el('div', 'harvest-form');

    // まとめ撤去チェックボックス（同名の株が他にある場合のみ）
    let batchChk = null;
    if (sameCrops.length > 0) {
      const batchRow = el('div', 'harvest-batch-row');
      batchChk = el('input');
      batchChk.type = 'checkbox';
      batchChk.id = `batch-${crop.id}`;
      batchChk.className = 'harvest-batch-chk';
      const batchLbl = el('label');
      batchLbl.htmlFor = `batch-${crop.id}`;
      batchLbl.className = 'harvest-batch-label';
      batchLbl.textContent = `この畝の${crop.name}（${sameCrops.length + 1}株）をまとめて撤去`;
      batchRow.appendChild(batchChk);
      batchRow.appendChild(batchLbl);
      form.appendChild(batchRow);
    }

    const lbl = el('span', 'harvest-form-label');
    lbl.textContent = '収穫日・撤去日';
    const dateInput = el('input');
    dateInput.type = 'date';
    dateInput.className = 'harvest-date-input';
    dateInput.value = TODAY;
    dateInput.max = TODAY;
    form.appendChild(lbl);
    form.appendChild(dateInput);

    const confirmBtn = el('button', 'btn-harvest-confirm');
    confirmBtn.textContent = '確定';
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      try {
        const ids = (batchChk && batchChk.checked)
          ? [crop.id, ...sameCrops.map(c => c.id)]
          : [crop.id];
        await Promise.all(ids.map(id =>
          fetch(API_HARVEST(id), {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
            body: JSON.stringify({harvested_at: dateInput.value}),
          }).then(r => { if (!r.ok) throw new Error(); })
        ));
        await openDetail(bedId, dateStr);
      } catch {
        confirmBtn.disabled = false;
        alert('保存に失敗しました。');
      }
    });
    const cancelBtn = el('button', 'btn-harvest-cancel');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => {
      form.remove();
      harvestBtn.style.display = '';
    });
    form.appendChild(confirmBtn);
    form.appendChild(cancelBtn);
    harvestRow.appendChild(form);
  });
  harvestRow.appendChild(harvestBtn);
  section.appendChild(harvestRow);

  // 作物の範囲調整パネル
  section.appendChild(renderCropAdjPanel(crop, bed, bedId, dateStr));

  return section;
}

function renderDetail(data) {
  const crops = data.crops || [];
  const c     = document.getElementById('detailContent');
  c.innerHTML = '';

  // ── ヘッダー ───────────────────────────────────────────
  const top = el('div', 'detail-top');
  const left = el('div');

  const meta = el('div', 'detail-meta');
  meta.textContent = `${data.bed.name} ・ ${data.year}年`;
  left.appendChild(meta);

  const titleEl = el('div', 'detail-crop-name');
  if (crops.length === 0) {
    titleEl.textContent = '空き畝';
  } else if (crops.length === 1) {
    titleEl.textContent = crops[0].name;
    // 1作物なら科タグをヘッダーに表示
    const tags = el('div', 'detail-tags');
    const famTag = el('span', 'detail-fam-tag');
    famTag.textContent = crops[0].family;
    famTag.style.cssText = `color:${crops[0].family_color};background:${crops[0].family_tint}`;
    tags.appendChild(famTag);
    if (crops[0].variety) {
      const vt = el('span', 'detail-variety');
      vt.textContent = `品種：${crops[0].variety}`;
      tags.appendChild(vt);
    }
    left.appendChild(titleEl);
    left.appendChild(tags);
  } else {
    const uniqueNames = [...new Set(crops.map(c => c.name))];
    const isSameType = uniqueNames.length === 1;
    if (isSameType) {
      // 同じ野菜の個体植え複数株
      titleEl.textContent = crops[0].name;
      const tags = el('div', 'detail-tags');
      const famTag = el('span', 'detail-fam-tag');
      famTag.textContent = crops[0].family;
      famTag.style.cssText = `color:${crops[0].family_color};background:${crops[0].family_tint}`;
      tags.appendChild(famTag);
      const countTag = el('span', 'detail-variety');
      countTag.textContent = `${crops.length}株`;
      tags.appendChild(countTag);
      left.appendChild(titleEl);
      left.appendChild(tags);
    } else {
      // 混植（異なる野菜）
      titleEl.textContent = uniqueNames.join('・');
      const mix = el('div', 'detail-mix-label');
      mix.textContent = `${uniqueNames.length}種混植`;
      left.appendChild(titleEl);
      left.appendChild(mix);
    }
  }

  if (crops.length === 0) left.appendChild(titleEl);

  const closeBtn = el('button', 'btn-close');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDetail);
  top.appendChild(left); top.appendChild(closeBtn);
  c.appendChild(top);

  // ── ボディ ─────────────────────────────────────────────
  const body = el('div', 'detail-body');

  if (crops.length === 0) {
    const emsg = el('div', 'detail-empty-msg');
    emsg.textContent = 'この畝は記録がありません。最初の作付けを登録できます。';
    body.appendChild(emsg);
  } else {
    crops.forEach((crop, idx) => {
      if (idx > 0) body.appendChild(el('div', 'crop-divider'));
      body.appendChild(renderCropSection(crop, data.bed, data.bed.id, data.date, data.crops));
    });
  }

  // 履歴
  if (data.history && data.history.length) {
    const histSec = el('div');
    const histTitle = el('div', 'section-title');
    histTitle.textContent = 'この畝の履歴';
    const histCells = el('div', 'history-cells');
    data.history.forEach(h => {
      const crops = h.crops || [];
      const cell = el('div', 'history-cell');

      // 1作物かつ全面なら科のtintを背景に、それ以外はニュートラル
      if (crops.length === 1 && !crops[0].is_partial) {
        const c = crops[0];
        cell.style.cssText = `background:${c.family_tint};border:${h.is_current ? `2px solid var(--accent)` : `1px solid ${c.family_color}40`}`;
      } else {
        cell.style.cssText = `background:#f1ecdd;border:${h.is_current ? '2px solid var(--accent)' : '1.5px dashed #cfc8b4'}`;
      }

      const yr = el('div', 'history-year');
      yr.textContent = `${h.year}年`;
      cell.appendChild(yr);

      if (crops.length === 0) {
        const nm = el('div', 'history-name');
        nm.textContent = '空き';
        nm.style.color = '#a89e84';
        cell.appendChild(nm);
      } else {
        crops.forEach(c => {
          const row = el('div', 'history-crop-row');
          const dot = el('span', 'history-crop-dot');
          dot.style.background = c.family_color;
          const nm = el('span', 'history-crop-name');
          nm.textContent = c.name;
          nm.style.color = c.family_color;
          row.appendChild(dot);
          row.appendChild(nm);
          if (c.is_partial) {
            const partial = el('span', 'history-crop-partial');
            partial.textContent = `${c.overlap_pct}%`;
            row.appendChild(partial);
          }
          cell.appendChild(row);
        });
      }

      histCells.appendChild(cell);
    });
    histSec.appendChild(histTitle); histSec.appendChild(histCells);
    body.appendChild(histSec);
  }

  // 記録ログ
  if (data.logs && data.logs.length) {
    const logSec = el('div');
    const logTitle = el('div', 'section-title');
    logTitle.textContent = 'さいきんの記録';
    const logList = el('div', 'log-list');
    data.logs.forEach(lg => {
      const row = el('div', 'log-row');
      const when = el('span', 'log-when');
      when.textContent = lg.when;
      const task = el('span', 'log-task');
      task.textContent = lg.task;
      const note = el('span', 'log-note');
      note.textContent = lg.note;
      row.appendChild(when); row.appendChild(task); row.appendChild(note);
      if (lg.user_name) {
        const user = el('span', 'log-user');
        user.textContent = lg.user_name;
        row.appendChild(user);
      }
      logList.appendChild(row);
    });
    logSec.appendChild(logTitle); logSec.appendChild(logList);
    body.appendChild(logSec);
  }

  // ボタン
  if (crops.length > 0) {
    const btnRow = el('div', 'btn-row');
    const addBtn = el('button', 'btn-secondary');
    addBtn.textContent = '記録を追加';
    addBtn.addEventListener('click', () => openLogForm(data.bed.id, data.crops, data.date));
    btnRow.appendChild(addBtn);
    body.appendChild(btnRow);
  } else {
    const plantBtn = el('button', 'btn-primary');
    plantBtn.textContent = 'この畝に植える';
    plantBtn.addEventListener('click', () => openPlantForm(data.bed, data.date));
    body.appendChild(plantBtn);
  }

  // 畝立て日のインライン編集
  if (data.bed.created_at) {
    body.appendChild(_mkInlineDateEditor('畝立て日', data.bed.created_at, async (d) => {
      const res = await fetch(API_BED_UPDATE(data.bed.id), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
        body: JSON.stringify({created_at: d}),
      });
      if (!res.ok) throw new Error();
    }));
  }

  // 畝の位置・サイズ調整パネル
  body.appendChild(renderBedAdjPanel(data.bed, data.date));

  // 畝を撤去（まだ撤去されていない場合のみ）
  if (!data.bed.deleted_at) {
    const removeRow = el('div', 'bed-remove-row');
    const removeBtn = el('button', 'btn-bed-remove');
    removeBtn.textContent = '畝を撤去';
    removeBtn.addEventListener('click', () => {
      removeBtn.style.display = 'none';
      const form = el('div', 'harvest-form');
      const lbl = el('span', 'harvest-form-label');
      lbl.textContent = '撤去日';
      const dateInput = el('input');
      dateInput.type = 'date';
      dateInput.className = 'harvest-date-input';
      dateInput.value = TODAY;
      dateInput.max = TODAY;
      const confirmBtn = el('button', 'btn-harvest-confirm');
      confirmBtn.textContent = '撤去を確定';
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        try {
          const res = await fetch(API_BED_REMOVE(data.bed.id), {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
            body: JSON.stringify({deleted_at: dateInput.value}),
          });
          if (!res.ok) throw new Error();
          closeDetail();
          loadGardenTab();
        } catch {
          confirmBtn.disabled = false;
          alert('保存に失敗しました。');
        }
      });
      const cancelBtn = el('button', 'btn-harvest-cancel');
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => {
        form.remove();
        removeBtn.style.display = '';
      });
      form.appendChild(lbl);
      form.appendChild(dateInput);
      form.appendChild(confirmBtn);
      form.appendChild(cancelBtn);
      removeRow.appendChild(form);
    });
    removeRow.appendChild(removeBtn);
    body.appendChild(removeRow);
  }

  c.appendChild(body);
}

// ══════════════════════════════════════════════════════
// ── Log form ──────────────────────────────────────────
// ══════════════════════════════════════════════════════
let _lastDetailBedId  = null;
let _lastDetailDate   = null;

const TASK_LABELS = {
  watering:    '水やり',
  fertilizing: '追肥',
  weeding:     '除草',
  pruning:     '芽かき・間引き',
  pest_control:'防虫・消毒',
  harvesting:  '収穫',
  other:       'その他',
};

function openLogForm(bedId, crops, dateStr) {
  _lastDetailBedId = bedId;
  _lastDetailDate  = dateStr;
  const c = document.getElementById('detailContent');
  c.innerHTML = '';

  const form = el('div', 'log-form');

  // 戻るボタン
  const back = el('button', 'log-form-back');
  back.innerHTML = '&#8592; 詳細に戻る';
  back.addEventListener('click', () => openDetail(bedId, dateStr));
  form.appendChild(back);

  const title = el('div', 'log-form-title');
  title.textContent = '記録を追加';
  form.appendChild(title);

  // 作業種類
  let selectedTask = 'watering';
  const taskSec = el('div');
  const taskLabel = el('div', 'form-label');
  taskLabel.textContent = '作業内容';
  const taskChips = el('div', 'task-chips');
  Object.entries(TASK_LABELS).forEach(([val, label]) => {
    const chip = el('button', 'task-chip' + (val === selectedTask ? ' selected' : ''));
    chip.textContent = label;
    chip.type = 'button';
    chip.addEventListener('click', () => {
      selectedTask = val;
      taskChips.querySelectorAll('.task-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    taskChips.appendChild(chip);
  });
  taskSec.appendChild(taskLabel);
  taskSec.appendChild(taskChips);
  form.appendChild(taskSec);

  // 対象作物（複数作物がある場合のみ）
  let selectedCropId = crops.length === 1 ? crops[0].id : null;
  if (crops.length > 1) {
    const cropSec = el('div');
    const cropLabel = el('div', 'form-label');
    cropLabel.textContent = '対象の作物';
    const cropChips = el('div', 'crop-select-chips');

    // 「全体」チップ
    const allChip = el('button', 'crop-sel-chip' + (selectedCropId === null ? ' selected' : ''));
    allChip.textContent = '畝全体';
    allChip.type = 'button';
    allChip.style.cssText = 'background:#ece7d2;color:#6b6655';
    allChip.addEventListener('click', () => {
      selectedCropId = null;
      cropChips.querySelectorAll('.crop-sel-chip').forEach(c => {
        c.classList.remove('selected');
        c.style.background = '';
      });
      allChip.classList.add('selected');
      allChip.style.background = '#ece7d2';
    });
    cropChips.appendChild(allChip);

    crops.forEach(crop => {
      const chip = el('button', 'crop-sel-chip');
      chip.textContent = crop.name;
      chip.type = 'button';
      chip.addEventListener('click', () => {
        selectedCropId = crop.id;
        cropChips.querySelectorAll('.crop-sel-chip').forEach(c => {
          c.classList.remove('selected');
          c.style.background = '';
          c.style.color = '';
        });
        chip.classList.add('selected');
        chip.style.cssText = `background:${crop.family_color};color:#fff;border-color:${crop.family_color}`;
      });
      cropChips.appendChild(chip);
    });

    cropSec.appendChild(cropLabel);
    cropSec.appendChild(cropChips);
    form.appendChild(cropSec);
  }

  // 作業日
  const dateSec = el('div');
  const dateLabel = el('div', 'form-label');
  dateLabel.textContent = '作業日';
  const dateInput = el('input');
  dateInput.type = 'date';
  dateInput.className = 'log-date-input';
  dateInput.value = (dateStr && dateStr <= TODAY) ? dateStr : TODAY;
  dateSec.appendChild(dateLabel);
  dateSec.appendChild(dateInput);
  form.appendChild(dateSec);

  // メモ
  const noteSec = el('div');
  const noteLabel = el('div', 'form-label');
  noteLabel.textContent = 'メモ（任意）';
  const noteInput = document.createElement('textarea');
  noteInput.className = 'log-note-input';
  noteInput.placeholder = '気づいたこと、病害虫の状況など';
  noteSec.appendChild(noteLabel);
  noteSec.appendChild(noteInput);
  form.appendChild(noteSec);

  // 送信ボタン
  const submitBtn = el('button', 'log-submit');
  submitBtn.textContent = '記録する';
  submitBtn.type = 'button';
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中…';
    const payload = {
      task_type:  selectedTask,
      worked_at:  dateInput.value,
      note:       noteInput.value.trim(),
      crop_id:    selectedCropId,
    };
    try {
      const res = await fetch(API_LOG(bedId), {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRFToken': CSRF},
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('server error');
      // 成功 → 詳細画面に戻る（記録が反映された状態で再取得）
      await openDetail(bedId, dateStr);
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = '記録する';
      alert('保存に失敗しました。もう一度お試しください。');
    }
  });
  form.appendChild(submitBtn);

  c.appendChild(form);
}

// ── Helper ─────────────────────────────────────────────
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

init();
