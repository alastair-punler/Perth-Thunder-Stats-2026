import { cfgAppearance } from "../config-appearance.js";
import { cfgSportA, cfgSportGoalCoords } from "../../setup.js";
import { getRows } from "../table/table-functions.js";

const PADDING = 10;

let activePeriod = "All";

export function setUpSummary() {
    const btn = document.getElementById("summary-tab");
    if (!btn) return;
    btn.addEventListener("shown.bs.tab", () => renderSummary());
}

// ─── Rink geometry helpers ────────────────────────────────────────────────────

function rinkDims() {
    const W = parseFloat(cfgSportA.width);
    const H = parseFloat(cfgSportA.height);
    // cornerRadius is present in IIHF config; NHL SVG uses 28 but it's not in appearance JSON
    const r = parseFloat(cfgSportA.cornerRadius || "28");
    return { W, H, r };
}

function boardPath(W, H, r) {
    return `M 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 ` +
           `L ${W - r} 0 A ${r} ${r} 0 0 1 ${W} ${r} ` +
           `L ${W} ${H - r} A ${r} ${r} 0 0 1 ${W - r} ${H} ` +
           `L ${r} ${H} A ${r} ${r} 0 0 1 0 ${H - r} Z`;
}

function resizeFactor(W, H) {
    const maxWidth = window.innerWidth >= 768
        ? window.innerWidth * 0.7
        : window.innerWidth;
    const scalar = Math.max(W, H);
    let resize = (
        Math.floor((maxWidth - 2 * PADDING) / scalar) +
        Math.round((maxWidth - 2 * PADDING) / scalar)
    ) / 2;
    if (W / H < 1.3) {
        resize = resize * (0.6 + (Math.max(W / H, 1) - 1));
    }
    return Number(resize.toFixed(1));
}

// ─── Main render ──────────────────────────────────────────────────────────────

function renderSummary() {
    const container = d3.select("#summary-container");
    container.selectAll("*").remove();

    const { W, H, r } = rinkDims();
    const resize = resizeFactor(W, H);
    const svgW = resize * W + PADDING;
    const svgH = resize * H + PADDING;

    // goal line X positions from cfgSportGoalCoords
    const leftGoalX  = cfgSportGoalCoords[0][0];
    const rightGoalX = cfgSportGoalCoords[1][0];

    // crease dimensions proportional to rink size (NHL baseline: 4 half-height, 4.5 depth)
    const creaseHalf  = H * (4 / 85);
    const creaseDepth = W * (4.5 / 200);
    const centerY     = H / 2;

    // blue lines proportional (NHL: 75 and 125 of 200)
    const leftBlue  = W * 0.375;
    const rightBlue = W * 0.625;

    // goal line Y extent proportional (NHL: 6 and 79 of 85)
    const goalLineTop    = H * (6 / 85);
    const goalLineBottom = H * (79 / 85);

    // ── period filter ──
    const filterBar = container.append("div").attr("class", "summary-filter-bar");
    for (const p of ["All", "1", "2", "3", "OT"]) {
        const label = p === "All" ? "All" : p === "OT" ? "OT" : `P${p}`;
        filterBar.append("button")
            .attr("class", "summary-period-btn grey-btn" +
                (activePeriod === p ? " summary-period-active" : ""))
            .text(label)
            .on("click", () => { activePeriod = p; renderSummary(); });
    }

    // ── filter + normalise rows ──
    const allRows = getRows() || [];
    const rows = allRows.filter(r =>
        !r.specialData.isStatRow &&
        r.specialData.coords &&
        (activePeriod === "All" || r.rowData["period"] === activePeriod)
    );

    const dots = rows.map(row => {
        const period = row.rowData["period"];
        const [rawX, rawY] = row.specialData.coords;
        // Period 2: home attacked LEFT, so flip X so home always attacks right
        const nx = period === "2" ? W - rawX : rawX;
        return { nx, ny: rawY, teamColor: row.specialData.teamColor || "greyTeam" };
    });

    const shotsFor     = dots.filter(d => d.teamColor === "blueTeam").length;
    const shotsAgainst = dots.filter(d => d.teamColor === "orangeTeam").length;

    // ── counts ──
    container.append("div").attr("class", "summary-counts center")
        .html(`<span class="summary-against">Shots Against: <strong>${shotsAgainst}</strong></span>` +
              `<span class="summary-sep">|</span>` +
              `<span class="summary-for">Shots For: <strong>${shotsFor}</strong></span>`);

    // ── SVG ──
    const svg = container.append("svg")
        .attr("id", "summary-rink-svg")
        .attr("width", svgW)
        .attr("height", svgH);

    // clip path so dots don't render past the boards
    svg.append("clipPath").attr("id", "summary-clip")
        .append("path").attr("d", boardPath(W, H, r));

    const g = svg.append("g")
        .attr("transform", `translate(${PADDING / 2},${PADDING / 2}) scale(${resize},${resize})`);

    // ── rink ──
    g.append("path").attr("d", boardPath(W, H, r)).attr("fill", "white");

    // center line
    g.append("line")
        .attr("x1", W / 2).attr("y1", 0).attr("x2", W / 2).attr("y2", H)
        .attr("stroke", "#C8102E").attr("stroke-width", W / 200);

    // blue lines
    for (const x of [leftBlue, rightBlue]) {
        g.append("line")
            .attr("x1", x).attr("y1", 0).attr("x2", x).attr("y2", H)
            .attr("stroke", "#0033A0").attr("stroke-width", W / 200);
    }

    // goal lines
    for (const x of [leftGoalX, rightGoalX]) {
        g.append("line")
            .attr("x1", x).attr("y1", goalLineTop).attr("x2", x).attr("y2", goalLineBottom)
            .attr("stroke", "#C8102E").attr("stroke-width", W / 1200);
    }

    // left crease
    const lc = leftGoalX + creaseDepth;
    g.append("path")
        .attr("d", `M ${leftGoalX} ${centerY - creaseHalf} L ${lc} ${centerY - creaseHalf} ` +
                   `A ${creaseHalf} ${creaseHalf} 0 0 1 ${lc} ${centerY + creaseHalf} ` +
                   `L ${leftGoalX} ${centerY + creaseHalf}`)
        .attr("stroke", "#C8102E").attr("stroke-width", W / 1200).attr("fill", "#E6F9FF");

    // right crease
    const rc = rightGoalX - creaseDepth;
    g.append("path")
        .attr("d", `M ${rightGoalX} ${centerY - creaseHalf} L ${rc} ${centerY - creaseHalf} ` +
                   `A ${creaseHalf} ${creaseHalf} 0 0 0 ${rc} ${centerY + creaseHalf} ` +
                   `L ${rightGoalX} ${centerY + creaseHalf}`)
        .attr("stroke", "#C8102E").attr("stroke-width", W / 1200).attr("fill", "#E6F9FF");

    // boards outline
    g.append("path")
        .attr("d", boardPath(W, H, r))
        .attr("fill", "none").attr("stroke", "black").attr("stroke-width", W / 200);

    // ── zone labels ──
    const fontSize = H * 0.09;
    g.append("text")
        .attr("x", W * 0.25).attr("y", H * 0.13)
        .attr("text-anchor", "middle").attr("font-size", fontSize)
        .attr("font-family", "Open Sans, sans-serif").attr("font-weight", "600")
        .attr("fill", cfgAppearance.orangeTeamSolid).attr("pointer-events", "none")
        .text("Shots Against");

    g.append("text")
        .attr("x", W * 0.75).attr("y", H * 0.13)
        .attr("text-anchor", "middle").attr("font-size", fontSize)
        .attr("font-family", "Open Sans, sans-serif").attr("font-weight", "600")
        .attr("fill", cfgAppearance.blueTeamSolid).attr("pointer-events", "none")
        .text("Shots For");

    // ── dots ──
    const dotR = parseFloat(cfgSportA.circleR);
    g.selectAll("circle.summary-dot")
        .data(dots).enter().append("circle")
        .attr("class", "summary-dot")
        .attr("cx", d => d.nx).attr("cy", d => d.ny).attr("r", dotR)
        .attr("fill", d => cfgAppearance[d.teamColor])
        .attr("stroke", d => cfgAppearance[d.teamColor + "Solid"])
        .attr("stroke-width", 0.1)
        .attr("clip-path", "url(#summary-clip)");
}
