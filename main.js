// "Every winter, one line": interactive line chart of Sierra Nevada snow cover by water year.
// Data: data/sierra_snow_timeseries.csv, exported by the Python notebook
// (columns: water_year, date, pct_snow, clear_frac, day_of_wy).

const DATA_URL = "data/sierra_snow_timeseries.csv";
const DEFAULT_YEARS = [2015, 2023];
// Fixed categorical order (validated palette). A year keeps its color while selected.
const PALETTE = ["#eb6834", "#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const OTHER = "#c9c8c3";
const MAX_SELECTED = PALETTE.length;

const margin = { top: 20, right: 56, bottom: 40, left: 56 };
const width = 860, height = 420;
const innerW = width - margin.left - margin.right;
const innerH = height - margin.top - margin.bottom;

// Month ticks, as days since Oct 1 (a non-leap reference year)
const MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const monthDay = m => (new Date(m >= 10 ? 2001 : 2002, m - 1, 1) - new Date(2001, 9, 1)) / 864e5;

let byYear, years, colorOf = new Map();

d3.csv(DATA_URL, d => ({
  water_year: +d.water_year,
  date: new Date(d.date + "T00:00:00"),
  pct: d.pct_snow === "" || d.pct_snow === "nan" ? NaN : +d.pct_snow,
  day: +d.day_of_wy
})).then(rows => {
  byYear = d3.group(rows, d => d.water_year);
  years = Array.from(byYear.keys()).sort(d3.ascending);
  DEFAULT_YEARS.filter(y => byYear.has(y)).forEach(select);
  buildChips();
  drawChart();
}).catch(err => {
  console.error(err);
  d3.select("#chart").append("p").attr("class", "chart-msg")
    .text(`Couldn't load ${DATA_URL}. Copy figures/sierra_snow_timeseries.csv from the notebook into the data/ folder.`);
});

// ---------- selection ----------
function select(y) {
  if (colorOf.has(y) || colorOf.size >= MAX_SELECTED) return;
  const used = new Set(colorOf.values());
  // 2015 and 2023 always get orange and blue; others take the next free color
  const preferred = y === 2015 ? PALETTE[0] : y === 2023 ? PALETTE[1] : null;
  colorOf.set(y, preferred && !used.has(preferred) ? preferred : PALETTE.find(c => !used.has(c) && c !== PALETTE[0] && c !== PALETTE[1]) || PALETTE.find(c => !used.has(c)));
}
function toggle(y) {
  colorOf.has(y) ? colorOf.delete(y) : select(y);
  update();
}

function buildChips() {
  const chips = d3.select("#year-chips").selectAll("button").data(years).join("button")
    .attr("class", "chip")
    .on("click", (e, y) => toggle(y));
  chips.append("span").attr("class", "swatch");
  chips.append("span").text(y => y);
  d3.select("#reset-btn").on("click", () => {
    colorOf.clear();
    DEFAULT_YEARS.filter(y => byYear.has(y)).forEach(select);
    update();
  });
}

// ---------- chart ----------
let svg, gLines, gLabels, x, y, line;

function drawChart() {
  svg = d3.select("#chart").append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Line chart of percent of the Sierra Nevada covered by snow through each winter");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  x = d3.scaleLinear().domain([monthDay(11) - 5, monthDay(8)]).range([0, innerW]);
  y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);
  line = d3.line().x(d => x(d.day)).y(d => y(d.pct)).curve(d3.curveMonotoneX);

  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(""));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickValues(MONTHS.slice(1, -1).map(monthDay))
      .tickFormat(dd => d3.timeFormat("%b")(new Date(2001, 9, 1 + dd))));
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d + "%"));
  g.append("text").attr("class", "axis-label")
    .attr("transform", "rotate(-90)").attr("x", -innerH / 2).attr("y", -42).attr("text-anchor", "middle")
    .text("% of Sierra Nevada covered by snow");

  gLines = g.append("g");
  gLabels = g.append("g");

  // hover layer: crosshair + tooltip with every highlighted year's value
  const cross = g.append("line").attr("class", "crosshair").attr("y1", 0).attr("y2", innerH).style("opacity", 0);
  const dots = g.append("g");
  const tip = d3.select("#tooltip");
  g.append("rect").attr("width", innerW).attr("height", innerH).attr("fill", "transparent")
    .on("pointermove", e => {
      const [mx] = d3.pointer(e);
      const day = x.invert(mx);
      const sel = years.filter(yr => colorOf.has(yr));
      if (!sel.length) return;
      // nearest sample per selected year
      const pts = sel.map(yr => {
        const arr = byYear.get(yr).filter(d => !isNaN(d.pct));
        const p = arr.reduce((a, b) => Math.abs(b.day - day) < Math.abs(a.day - day) ? b : a, arr[0]);
        return { yr, p };
      }).filter(d => d.p);
      if (!pts.length) return;
      const snapDay = pts[0].p.day;
      cross.attr("x1", x(snapDay)).attr("x2", x(snapDay)).style("opacity", 1);
      dots.selectAll("circle").data(pts, d => d.yr).join("circle")
        .attr("r", 5).attr("cx", d => x(d.p.day)).attr("cy", d => y(d.p.pct))
        .attr("fill", d => colorOf.get(d.yr)).attr("stroke", "#fcfcfb").attr("stroke-width", 2);
      const label = d3.timeFormat("%b %-d")(new Date(2001, 9, 1 + snapDay));
      tip.attr("hidden", null).html(
        `<div class="tt-date">${label}</div>` +
        pts.sort((a, b) => b.p.pct - a.p.pct).map(d =>
          `<div class="tt-row"><span><i class="dot" style="background:${colorOf.get(d.yr)}"></i>${d.yr}</span><b>${d.p.pct.toFixed(0)}%</b></div>`
        ).join(""));
      const tw = tip.node().offsetWidth;
      const left = e.clientX + 16 + tw > window.innerWidth ? e.clientX - tw - 16 : e.clientX + 16;
      tip.style("left", left + "px").style("top", (e.clientY - 20) + "px");
    })
    .on("pointerleave", () => {
      cross.style("opacity", 0);
      dots.selectAll("circle").remove();
      tip.attr("hidden", true);
    });

  update();
}

function update() {
  const ordered = [...years].sort((a, b) => colorOf.has(a) - colorOf.has(b)); // highlighted drawn on top

  gLines.selectAll("path").data(ordered, d => d).join("path")
    .attr("class", "year-line")
    .attr("d", yr => line(byYear.get(yr).filter(d => !isNaN(d.pct))))
    .order()
    .transition().duration(250)
    .attr("stroke", yr => colorOf.get(yr) || OTHER)
    .attr("stroke-width", yr => colorOf.has(yr) ? 2.5 : 1.25)
    .attr("opacity", yr => colorOf.has(yr) ? 1 : 0.7);

  // direct labels at the end of each highlighted line
  const ends = years.filter(yr => colorOf.has(yr)).map(yr => {
    const arr = byYear.get(yr).filter(d => !isNaN(d.pct));
    return { yr, d: arr[arr.length - 1] };
  }).filter(e => e.d);
  // nudge labels apart so they don't overlap
  ends.sort((a, b) => y(a.d.pct) - y(b.d.pct));
  let lastY = -Infinity;
  ends.forEach(e => { e.ly = Math.max(y(e.d.pct), lastY + 14); lastY = e.ly; });
  gLabels.selectAll("text").data(ends, e => e.yr).join("text")
    .attr("class", "end-label")
    .attr("x", e => x(e.d.day) + 6).attr("y", e => e.ly).attr("dy", "0.35em")
    .text(e => e.yr);

  // chips reflect selection
  d3.selectAll("#year-chips .chip")
    .attr("aria-pressed", yr => colorOf.has(yr))
    .property("disabled", yr => !colorOf.has(yr) && colorOf.size >= MAX_SELECTED)
    .select(".swatch").style("background", yr => colorOf.get(yr) || OTHER);
}
