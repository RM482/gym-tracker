// chart.js — tiny dependency-free SVG line chart for dashboard metrics.

const SVG_NS = 'http://www.w3.org/2000/svg';
const makeSvg = (name, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
};

export function lineChart({ title, points, unit, decimals = 0 }) {
  const format = (value) => String(Number(value.toFixed(decimals)));
  const card = document.createElement('section');
  card.className = 'card chart-card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.appendChild(heading);
  const usable = points.filter((point) => Number.isFinite(point.value));
  if (!usable.length) {
    const empty = document.createElement('p');
    empty.className = 'sub';
    empty.textContent = 'No qualifying sets in this period.';
    card.appendChild(empty);
    return card;
  }

  const width = 340; const height = 180;
  const left = 42; const right = 12; const top = 16; const bottom = 30;
  const xTimes = usable.map((point) => Date.parse(`${point.day}T00:00:00Z`));
  const minX = Math.min(...xTimes); const maxX = Math.max(...xTimes);
  const maxY = Math.max(1, ...usable.map((point) => point.value));
  const x = (time) => minX === maxX ? (left + width - right) / 2
    : left + ((time - minX) / (maxX - minX)) * (width - left - right);
  const y = (value) => height - bottom - (value / maxY) * (height - top - bottom);
  const svg = makeSvg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${title} over time` });
  for (const value of [0, maxY / 2, maxY]) {
    const py = y(value);
    svg.appendChild(makeSvg('line', { x1: left, y1: py, x2: width - right, y2: py, class: 'chart-grid' }));
    const label = makeSvg('text', { x: left - 5, y: py + 4, class: 'chart-axis', 'text-anchor': 'end' });
    label.textContent = format(value);
    svg.appendChild(label);
  }
  const coordinates = usable.map((point, index) => `${x(xTimes[index])},${y(point.value)}`).join(' ');
  if (usable.length > 1) svg.appendChild(makeSvg('polyline', { points: coordinates, class: 'chart-line' }));
  usable.forEach((point, index) => {
    const px = x(xTimes[index]); const py = y(point.value);
    svg.appendChild(makeSvg('circle', { cx: px, cy: py, r: 4, class: 'chart-point' }));
  });
  const first = makeSvg('text', { x: left, y: height - 8, class: 'chart-axis', 'text-anchor': 'start' });
  first.textContent = usable[0].day.slice(5);
  const last = makeSvg('text', { x: width - right, y: height - 8, class: 'chart-axis', 'text-anchor': 'end' });
  last.textContent = usable.at(-1).day.slice(5);
  svg.append(first, last);
  card.appendChild(svg);
  const latest = document.createElement('p');
  latest.className = 'chart-latest';
  latest.textContent = `Latest: ${format(usable.at(-1).value)} ${unit}`;
  card.appendChild(latest);
  if (usable.length === 1) {
    const hint = document.createElement('p');
    hint.className = 'sub';
    hint.textContent = 'Come back after your next workout to see a trend.';
    card.appendChild(hint);
  }
  return card;
}
