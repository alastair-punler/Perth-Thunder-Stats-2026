import { cfgAppearance } from "../config-appearance.js";

// ─── Module state ─────────────────────────────────────────────────────────────

let activePeriod = "All";
const activeTypes = new Set(["shots"]);

export function resetSummaryFilters() {
    activePeriod = "All";
    activeTypes.clear();
    activeTypes.add("shots");
}

// ─── Faceoff dot positions ────────────────────────────────────────────────────

function getFaceoffDots(W) {
    if (W <= 61) {
        return [
            { x: 30, y: 15  },
            { x: 24, y:  8  }, { x: 36, y:  8  },
            { x: 24, y: 22  }, { x: 36, y: 22  },
            { x: 10, y:  8  }, { x: 50, y:  8  },
            { x: 10, y: 22  }, { x: 50, y: 22  },
        ];
    }
    return [
        { x: 100, y: 42.5 },
        { x:  80, y: 20.5 }, { x: 120, y: 20.5 },
        { x:  80, y: 64.5 }, { x: 120, y: 64.5 },
        { x:  31, y: 20.5 }, { x: 169, y: 20.5 },
        { x:  31, y: 64.5 }, { x: 169, y: 64.5 },
    ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function polygonPoints(cx, cy, r, sides) {
    const step = (2 * Math.PI) / sides;
    return Array.from({ length: sides }, (_, i) => {
        const x = (cx + r * Math.cos(step * i + 100)).toFixed(3);
        const y = (cy + r * Math.sin(step * i + 100)).toFixed(3);
        return `${x},${y}`;
    }).join(" ");
}

function normalise(coords, period, W) {
    const [rawX, rawY] = coords;
    return [period === "2" ? W - rawX : rawX, rawY];
}

function nearestDot(nx, ny, dots) {
    return dots.reduce((best, dot) => {
        const d = Math.hypot(nx - dot.x, ny - dot.y);
        return d < best.dist ? { dot, dist: d } : best;
    }, { dot: null, dist: Infinity }).dot;
}

// ─── Rink SVG processing ──────────────────────────────────────────────────────

// Rename clipPath IDs, strip interactive layers, add #summary-dots group.
// Called on a cloned/imported SVG node before it's inserted into the DOM.
export function prepareRinkSVG(svgNode) {
    svgNode.id = "summary-rink-svg";
    svgNode.querySelectorAll("clipPath[id]").forEach(cp => {
        const oldId = cp.id;
        const newId = "s-" + oldId;
        cp.id = newId;
        svgNode.querySelectorAll(`[clip-path="url(#${oldId})"]`).forEach(el => {
            el.setAttribute("clip-path", `url(#${newId})`);
        });
    });
    ["dots", "heat-map", "player-events", "rink-label-left", "rink-label-right"]
        .forEach(id => { const el = svgNode.querySelector("#" + id); if (el) el.remove(); });
    const transformations = svgNode.querySelector("#transformations");
    const perimeter = svgNode.querySelector("#outside-perimeter");
    if (transformations) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.id = "summary-dots";
        transformations.insertBefore(g, perimeter || null);
    }
    return svgNode;
}

// ─── Faceoff analytics ────────────────────────────────────────────────────────

function aggregateFaceoffs(rows, W) {
    const dots = getFaceoffDots(W);
    const stats = new Map(dots.map(d => [d, { w: 0, l: 0 }]));
    rows.forEach(row => {
        if (!row.specialData?.isStatRow || !row.specialData.coords) return;
        const type = row.rowData["shot-type"] || "";
        const isWin  = type.includes("FO Win");
        const isLoss = type.includes("FO Loss");
        if (!isWin && !isLoss) return;
        const [nx, ny] = normalise(row.specialData.coords, row.rowData["period"], W);
        const dot = nearestDot(nx, ny, dots);
        if (!dot) return;
        if (isWin) stats.get(dot).w++;
        else        stats.get(dot).l++;
    });
    return { dots, stats };
}

function renderFaceoffAnalytics(dotsG, rows, W, H) {
    const { dots, stats } = aggregateFaceoffs(rows, W);
    const fontSize = H * 0.055;
    const lineGap  = fontSize * 1.35;
    const padX     = fontSize * 2.4;
    const padY     = fontSize * 0.35;

    dots.forEach(dot => {
        const { w, l } = stats.get(dot);
        if (w + l === 0) return;
        const total = w + l;
        const pct   = Math.round((w / total) * 100);
        const pctColor = pct >= 50 ? "#2dc653" : "#e63946";
        const bx = dot.x - padX;
        const by = dot.y - padY;
        const bw = padX * 2;
        const bh = lineGap + fontSize + padY * 2;
        dotsG.append("rect")
            .attr("x", bx).attr("y", by)
            .attr("width", bw).attr("height", bh)
            .attr("fill", "white").attr("fill-opacity", 0.82)
            .attr("rx", fontSize * 0.25);
        dotsG.append("text")
            .attr("x", dot.x).attr("y", dot.y + fontSize * 0.7)
            .attr("text-anchor", "middle")
            .attr("font-size", fontSize * 0.82)
            .attr("font-family", "Open Sans, sans-serif")
            .attr("font-weight", "600")
            .attr("fill", "#333")
            .text(`${w}W  ${l}L`);
        dotsG.append("text")
            .attr("x", dot.x).attr("y", dot.y + lineGap + fontSize * 0.7)
            .attr("text-anchor", "middle")
            .attr("font-size", fontSize)
            .attr("font-family", "Open Sans, sans-serif")
            .attr("font-weight", "700")
            .attr("fill", pctColor)
            .text(`${pct}%`);
    });
}

// ─── Stats tables ─────────────────────────────────────────────────────────────

function renderStatsTables(container, fullRows, homeName, awayName) {
    const periods = ["1", "2", "3", "OT"];
    const shots = {}, stats = {};
    periods.forEach(p => {
        shots[p] = { home: 0, away: 0 };
        stats[p] = { hits: 0, turnovers: 0, foWin: 0, foLoss: 0 };
    });
    fullRows.forEach(row => {
        const p = row.rowData["period"];
        if (!periods.includes(p)) return;
        const type = row.rowData["shot-type"] || "";
        if (!row.specialData?.isStatRow) {
            if (row.specialData?.teamColor === "blueTeam")        shots[p].home++;
            else if (row.specialData?.teamColor === "orangeTeam") shots[p].away++;
        } else {
            if (type.includes("Hits"))          stats[p].hits++;
            else if (type.includes("Turnovers")) stats[p].turnovers++;
            else if (type.includes("FO Win"))    stats[p].foWin++;
            else if (type.includes("FO Loss"))   stats[p].foLoss++;
        }
    });
    const totShots = periods.reduce((a, p) => ({
        home: a.home + shots[p].home, away: a.away + shots[p].away
    }), { home: 0, away: 0 });
    const totStats = periods.reduce((a, p) => ({
        hits: a.hits + stats[p].hits,
        turnovers: a.turnovers + stats[p].turnovers,
        foWin: a.foWin + stats[p].foWin,
        foLoss: a.foLoss + stats[p].foLoss,
    }), { hits: 0, turnovers: 0, foWin: 0, foLoss: 0 });

    const wrap = container.append("div").attr("class", "summary-tables-row");

    // Shots table
    const shotsWrap = wrap.append("div").attr("class", "summary-table-wrap");
    shotsWrap.append("h6").attr("class", "summary-table-title").text("Shots");
    const st = shotsWrap.append("table").attr("class", "table summary-stat-table");
    const sh = st.append("thead").append("tr");
    ["Period", homeName, awayName, "Total"].forEach(h => sh.append("th").text(h));
    const sb = st.append("tbody");
    periods.forEach(p => {
        const tr = sb.append("tr");
        const tot = shots[p].home + shots[p].away;
        [p === "OT" ? "OT" : `P${p}`, shots[p].home, shots[p].away, tot]
            .forEach(v => tr.append("td").text(v));
    });
    const stot = sb.append("tr").attr("class", "summary-total-row");
    ["Total", totShots.home, totShots.away, totShots.home + totShots.away]
        .forEach(v => stot.append("td").text(v));

    // Player stats table
    const statsWrap = wrap.append("div").attr("class", "summary-table-wrap");
    statsWrap.append("h6").attr("class", "summary-table-title").text("Player Stats");
    const pt = statsWrap.append("table").attr("class", "table summary-stat-table");
    const ph = pt.append("thead").append("tr");
    ["Period", "Hits", "Turnovers", "FO Win", "FO Loss", "FO%"].forEach(h => ph.append("th").text(h));
    const pb = pt.append("tbody");
    periods.forEach(p => {
        const { hits, turnovers, foWin, foLoss } = stats[p];
        const foTotal = foWin + foLoss;
        const foPct   = foTotal > 0 ? Math.round((foWin / foTotal) * 100) + "%" : "—";
        const tr = pb.append("tr");
        [p === "OT" ? "OT" : `P${p}`, hits, turnovers, foWin, foLoss, foPct]
            .forEach(v => tr.append("td").text(v));
    });
    const ptot = pb.append("tr").attr("class", "summary-total-row");
    const { hits, turnovers, foWin, foLoss } = totStats;
    const foTotal = foWin + foLoss;
    const foPct   = foTotal > 0 ? Math.round((foWin / foTotal) * 100) + "%" : "—";
    ["Total", hits, turnovers, foWin, foLoss, foPct].forEach(v => ptot.append("td").text(v));
}

// ─── Main shared renderer ─────────────────────────────────────────────────────

// container: D3 selection of the container element
// allRows: array of row objects in the standard { id, rowData, specialData } format
// getRinkSvg: function() → prepared SVG node (cloned+processed, ready to insert)
// W, H: rink dimensions in rink-space units
// homeName, awayName: team name strings for labels
// circleR, polyR: dot radii from cfgSportA
export function renderSummaryFromData(container, allRows, getRinkSvg, W, H, homeName, awayName, circleR, polyR) {
    container.selectAll("*").remove();

    renderStatsTables(container, allRows, homeName, awayName);

    // Period filter
    const filterBar = container.append("div").attr("class", "summary-filter-bar");
    ["All", "1", "2", "3", "OT"].forEach(p => {
        const label = p === "All" ? "All" : p === "OT" ? "OT" : `P${p}`;
        filterBar.append("button")
            .attr("class", "summary-period-btn grey-btn" +
                (activePeriod === p ? " summary-period-active" : ""))
            .text(label)
            .on("click", () => {
                activePeriod = p;
                renderSummaryFromData(container, allRows, getRinkSvg, W, H, homeName, awayName, circleR, polyR);
            });
    });

    // Event type toggles
    const TYPES = [
        { key: "shots",     label: "Shots",     color: cfgAppearance.blueTeamSolid },
        { key: "hits",      label: "Hits",       color: "#e63946" },
        { key: "turnovers", label: "Turnovers",  color: "#8338ec" },
        { key: "faceoffs",  label: "Faceoffs",   color: "#0033A0" },
    ];
    const typeBar = container.append("div").attr("class", "summary-type-bar");
    TYPES.forEach(({ key, label, color }) => {
        const on = activeTypes.has(key);
        typeBar.append("button")
            .attr("class", "summary-type-btn grey-btn" + (on ? " summary-type-active" : ""))
            .style("border-color", on ? color : null)
            .style("color",        on ? color : null)
            .text(label)
            .on("click", () => {
                activeTypes.has(key) ? activeTypes.delete(key) : activeTypes.add(key);
                renderSummaryFromData(container, allRows, getRinkSvg, W, H, homeName, awayName, circleR, polyR);
            });
    });

    // Collect + filter rows
    const filteredRows = (allRows || []).filter(r =>
        activePeriod === "All" || r.rowData["period"] === activePeriod
    );

    // Normalise events for dot rendering
    const dots = [];
    filteredRows.forEach(row => {
        if (!row.specialData.coords) return;
        const period = row.rowData["period"] || "1";
        const [nx, ny] = normalise(row.specialData.coords, period, W);
        const type = row.rowData["shot-type"] || "";
        if (!row.specialData.isStatRow && activeTypes.has("shots")) {
            dots.push({ nx, ny, period, kind: "shot", teamColor: row.specialData.teamColor || "greyTeam" });
        } else if (row.specialData.isStatRow) {
            if (activeTypes.has("hits")      && type.includes("Hits"))      dots.push({ nx, ny, period, kind: "hit" });
            if (activeTypes.has("turnovers") && type.includes("Turnovers")) dots.push({ nx, ny, period, kind: "turnover" });
        }
    });

    // Shot count line
    const shotDots = dots.filter(d => d.kind === "shot");
    const nOffensive = shotDots.filter(d => d.nx > W / 2).length;
    const nDefensive = shotDots.filter(d => d.nx <= W / 2).length;
    container.append("div").attr("class", "summary-counts center")
        .html(`<span class="summary-defensive">${awayName} Shots: <strong>${nDefensive}</strong></span>` +
              `<span class="summary-sep">|</span>` +
              `<span class="summary-offensive">${homeName} Shots: <strong>${nOffensive}</strong></span>`);

    // Clone rink SVG
    const svgNode = getRinkSvg();
    if (!svgNode) {
        container.append("p").attr("class", "center").text("Rink not available.");
        return;
    }
    container.node().appendChild(svgNode);
    const dotsG = d3.select("#summary-dots");

    // Zone labels
    const labelFontSize = H * 0.09;
    [
        { x: W * 0.25, text: `${awayName} Shoots`, fill: cfgAppearance.orangeTeamSolid },
        { x: W * 0.75, text: `${homeName} Shoots`, fill: cfgAppearance.blueTeamSolid  },
    ].forEach(({ x, text, fill }) => {
        dotsG.append("text")
            .attr("x", x).attr("y", H * 0.13)
            .attr("text-anchor", "middle").attr("font-size", labelFontSize)
            .attr("font-family", "Open Sans, sans-serif").attr("font-weight", "600")
            .attr("fill", fill).attr("pointer-events", "none")
            .text(text);
    });

    // Dots
    dots.forEach(d => {
        if (d.kind === "shot") {
            dotsG.append("circle")
                .attr("cx", d.nx).attr("cy", d.ny).attr("r", circleR)
                .attr("fill", cfgAppearance[d.teamColor])
                .attr("stroke", cfgAppearance[d.teamColor + "Solid"])
                .attr("stroke-width", 0.1);
        } else if (d.kind === "hit") {
            dotsG.append("polygon")
                .attr("points", polygonPoints(d.nx, d.ny, polyR, 4))
                .attr("fill", "#e63946").attr("fill-opacity", 0.9)
                .attr("stroke", "white").attr("stroke-width", 0.05);
        } else if (d.kind === "turnover") {
            dotsG.append("polygon")
                .attr("points", polygonPoints(d.nx, d.ny, polyR, 3))
                .attr("fill", "#8338ec").attr("fill-opacity", 0.9)
                .attr("stroke", "white").attr("stroke-width", 0.05);
        }
    });

    // Faceoff analytics overlay
    if (activeTypes.has("faceoffs")) {
        renderFaceoffAnalytics(dotsG, filteredRows, W, H);
    }
}
