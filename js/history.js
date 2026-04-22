import { initDB, listGames, loadGameEvents } from "./db.js";
import { renderSummaryFromData, prepareRinkSVG, resetSummaryFilters } from "./summary/summary-render.js";

// ─── Init ─────────────────────────────────────────────────────────────────────

initDB();

// ─── Rink SVG fetching ────────────────────────────────────────────────────────

const _rinkSvgCache = {};

async function fetchRinkSvgNode(rink) {
    if (!_rinkSvgCache[rink]) {
        const url = rink === 'ice-hockey-iihf'
            ? '/html/ice-hockey-iihf.html'
            : '/html/index.html';
        const html = await fetch(url).then(r => r.text());
        const doc  = new DOMParser().parseFromString(html, 'text/html');
        _rinkSvgCache[rink] = doc.querySelector('#playing-area svg') || null;
    }
    return _rinkSvgCache[rink];
}

// Returns a sync getter — call after fetchRinkSvgNode resolves.
function makeSyncRinkGetter(original) {
    if (!original) return () => null;
    return () => prepareRinkSVG(document.importNode(original, true));
}

// ─── Rink config ──────────────────────────────────────────────────────────────

async function getRinkConfig(rink) {
    const data = await fetch('/supported-sports.json').then(r => r.json());
    const sportId = rink === 'ice-hockey-iihf' ? 'ice-hockey-iihf' : 'ice-hockey';
    const sport = data.sports.find(s => s.id === sportId);
    if (!sport) return { W: 200, H: 85, circleR: 2, polyR: 2.75 };
    const a = sport.appearance;
    return {
        W: parseFloat(a.width),
        H: parseFloat(a.height),
        circleR: parseFloat(a.circleR),
        polyR: parseFloat(a.polyR || a.circleR),
    };
}

// ─── Map DB events → row format expected by summary-render ───────────────────

function dbEventsToRows(events) {
    return events.map(ev => ({
        id: ev.id,
        rowData: {
            'period':    ev.period,
            'team':      ev.team,
            'shot-type': ev.type,
        },
        specialData: {
            coords:     ev.svg_x != null ? [ev.svg_x, ev.svg_y] : null,
            teamColor:  ev.team_color,
            typeIndex:  ev.type_index,
            isStatRow:  ev.is_stat_row || undefined,
            player:     ev.player,
        },
        selected: false,
    }));
}

// ─── Shot counts helper ───────────────────────────────────────────────────────

function computeStats(events) {
    let shots = 0, foWins = 0, foLosses = 0;
    events.forEach(ev => {
        if (!ev.is_stat_row) shots++;
        if (ev.type?.includes('FO Win'))  foWins++;
        if (ev.type?.includes('FO Loss')) foLosses++;
    });
    const foTotal = foWins + foLosses;
    const foPct   = foTotal > 0 ? Math.round((foWins / foTotal) * 100) : null;
    return { shots, foPct };
}

// ─── Games table ──────────────────────────────────────────────────────────────

let _allGamesData = []; // { game, events, stats }

async function renderGamesTable(games) {
    const container = document.getElementById('games-table-container');
    if (!games.length) {
        container.innerHTML = '<p class="no-games-msg">No games recorded yet. Start tracking to see history here.</p>';
        return;
    }

    // Load stats for all games in parallel
    _allGamesData = await Promise.all(games.map(async game => {
        const events = await loadGameEvents(game.id);
        const stats  = computeStats(events);
        return { game, events, stats };
    }));

    const table = document.createElement('table');
    table.className = 'table table-sm table-hover';
    table.innerHTML = `<thead><tr>
        <th>Date</th><th>Game</th><th>Venue</th><th>Shots</th><th>FO%</th><th></th>
    </tr></thead><tbody id="games-tbody"></tbody>`;
    container.innerHTML = '';
    container.appendChild(table);

    const tbody = document.getElementById('games-tbody');
    _allGamesData.forEach(({ game, stats }) => {
        const tr = document.createElement('tr');
        tr.className = 'game-row';
        tr.dataset.gameId = game.id;
        tr.innerHTML = `
            <td>${game.date || ''}</td>
            <td>${game.name || ''}</td>
            <td>${game.venue || ''}</td>
            <td>${stats.shots}</td>
            <td>${stats.foPct != null ? stats.foPct + '%' : '—'}</td>
            <td><a href="#game-detail-section" style="font-size:0.85rem">View →</a></td>
        `;
        tr.addEventListener('click', () => showGameDetail(game.id));
        tbody.appendChild(tr);
    });

    document.getElementById('trends-section').style.display = '';
    renderTrendCharts(_allGamesData);
}

// ─── Trend charts ─────────────────────────────────────────────────────────────

function renderTrendCharts(gamesData) {
    const reversed = [...gamesData].reverse(); // chronological order
    const labels   = reversed.map((d, i) => d.game.name || `G${i + 1}`);
    const shots    = reversed.map(d => d.stats.shots);
    const foPcts   = reversed.map(d => d.stats.foPct);

    renderBarChart('#shots-chart', labels, shots, '#4361ee', 'Shots');
    renderLineChart('#fo-chart', labels, foPcts, '#2dc653', 'FO%');
}

function renderBarChart(selector, labels, values, color, title) {
    const svg    = d3.select(selector);
    const W      = svg.node().getBoundingClientRect().width || 400;
    const H      = 180;
    const margin = { top: 10, right: 10, bottom: 40, left: 30 };
    const iW     = W - margin.left - margin.right;
    const iH     = H - margin.top - margin.bottom;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(labels).range([0, iW]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(values) || 1]).nice().range([iH, 0]);

    g.append("g").attr("transform", `translate(0,${iH})`).call(
        d3.axisBottom(x).tickSize(0)
    ).selectAll("text").attr("font-size", "10px")
        .attr("transform", "rotate(-30)").attr("text-anchor", "end");

    g.append("g").call(d3.axisLeft(y).ticks(4).tickSize(-iW))
        .selectAll(".tick line").attr("stroke", "#eee");

    g.selectAll("rect").data(values).join("rect")
        .attr("x", (_, i) => x(labels[i]))
        .attr("y", d => y(d))
        .attr("width", x.bandwidth())
        .attr("height", d => iH - y(d))
        .attr("fill", color)
        .attr("fill-opacity", 0.8)
        .attr("rx", 2);
}

function renderLineChart(selector, labels, values, color, title) {
    const svg    = d3.select(selector);
    const W      = svg.node().getBoundingClientRect().width || 400;
    const H      = 180;
    const margin = { top: 10, right: 10, bottom: 40, left: 36 };
    const iW     = W - margin.left - margin.right;
    const iH     = H - margin.top - margin.bottom;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    const defined = values.filter(v => v != null);
    if (!defined.length) {
        svg.append("text").attr("x", W / 2).attr("y", H / 2)
            .attr("text-anchor", "middle").attr("font-size", "12px")
            .attr("fill", "#aaa").text("No faceoff data");
        return;
    }

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(labels).range([0, iW]).padding(0.3);
    const y = d3.scaleLinear().domain([0, 100]).range([iH, 0]);

    g.append("g").attr("transform", `translate(0,${iH})`).call(
        d3.axisBottom(x).tickSize(0)
    ).selectAll("text").attr("font-size", "10px")
        .attr("transform", "rotate(-30)").attr("text-anchor", "end");

    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat(d => d + '%').tickSize(-iW))
        .selectAll(".tick line").attr("stroke", "#eee");

    // 50% reference line
    g.append("line")
        .attr("x1", 0).attr("x2", iW)
        .attr("y1", y(50)).attr("y2", y(50))
        .attr("stroke", "#ccc").attr("stroke-dasharray", "4,3");

    const pts = labels.map((l, i) => ({ l, v: values[i] })).filter(d => d.v != null);
    const line = d3.line()
        .x(d => x(d.l) + x.bandwidth() / 2)
        .y(d => y(d.v));

    g.append("path").datum(pts)
        .attr("fill", "none").attr("stroke", color).attr("stroke-width", 2)
        .attr("d", line);

    g.selectAll("circle").data(pts).join("circle")
        .attr("cx", d => x(d.l) + x.bandwidth() / 2)
        .attr("cy", d => y(d.v))
        .attr("r", 4)
        .attr("fill", d => d.v >= 50 ? "#2dc653" : "#e63946");
}

// ─── Game detail (full Summary view) ─────────────────────────────────────────

async function showGameDetail(gameId) {
    // Highlight selected row
    document.querySelectorAll('.game-row').forEach(r => r.classList.remove('selected-game'));
    document.querySelectorAll(`.game-row[data-game-id="${gameId}"]`)
        .forEach(r => r.classList.add('selected-game'));

    const found = _allGamesData.find(d => d.game.id === gameId);
    if (!found) return;

    const { game, events } = found;
    const detailSection = document.getElementById('game-detail-section');
    const title         = document.getElementById('game-detail-title');
    const summaryContainer = document.getElementById('game-summary-container');

    title.textContent = `${game.name || 'Game'} — ${game.date || ''}${game.venue ? ' · ' + game.venue : ''}`;
    detailSection.style.display = '';
    summaryContainer.innerHTML = '<p style="color:#888;font-style:italic">Loading…</p>';
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    resetSummaryFilters();

    const rows    = dbEventsToRows(events);
    const [cfg, rinkOriginal] = await Promise.all([
        getRinkConfig(game.rink),
        fetchRinkSvgNode(game.rink),
    ]);
    const getRinkSvg = makeSyncRinkGetter(rinkOriginal);
    const homeName = game.home_name || 'Home';
    const awayName = game.away_name || 'Away';

    summaryContainer.innerHTML = '';
    renderSummaryFromData(
        d3.select('#game-summary-container'),
        rows,
        getRinkSvg,
        cfg.W, cfg.H,
        homeName, awayName,
        cfg.circleR, cfg.polyR
    );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
    const games = await listGames();
    await renderGamesTable(games);
})();
