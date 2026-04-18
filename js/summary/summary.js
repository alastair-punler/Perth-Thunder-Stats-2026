import { cfgAppearance } from "../config-appearance.js";
import { cfgSportA } from "../../setup.js";
import { getRows } from "../table/table-functions.js";

// ─── Module state ─────────────────────────────────────────────────────────────

let activePeriod = "All";
const activeTypes = new Set(["shots"]); // "shots" | "hits" | "turnovers"

// ─── Public entry point ───────────────────────────────────────────────────────

export function setUpSummary() {
    const btn = document.getElementById("summary-tab");
    if (!btn) return;
    btn.addEventListener("shown.bs.tab", () => renderSummary());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Inline polygon point generator (same algorithm as dot.js)
function polygonPoints(cx, cy, r, sides) {
    const step = (2 * Math.PI) / sides;
    return Array.from({ length: sides }, (_, i) => {
        const x = (cx + r * Math.cos(step * i + 100)).toFixed(3);
        const y = (cy + r * Math.sin(step * i + 100)).toFixed(3);
        return `${x},${y}`;
    }).join(" ");
}

// Clone the live rink SVG, strip interactive layers, rename clipPath IDs
// so they don't conflict with the original in the same document.
function cloneRinkSVG() {
    // The sport SVG id is e.g. "ice-hockey-svg" or "ice-hockey-iihf-svg"
    const original = document.querySelector("#playing-area svg");
    if (!original) return null;

    const clone = original.cloneNode(true);
    clone.id = "summary-rink-svg";

    // Rename every clipPath id and its url() references to avoid doc-level conflicts
    clone.querySelectorAll("clipPath[id]").forEach(cp => {
        const oldId = cp.id;
        const newId = "s-" + oldId;
        cp.id = newId;
        clone.querySelectorAll(`[clip-path="url(#${oldId})"]`).forEach(el => {
            el.setAttribute("clip-path", `url(#${newId})`);
        });
    });

    // Remove dynamic / interactive groups added by JS at runtime
    [
        "dots", "heat-map", "player-events",
        "rink-label-left", "rink-label-right",
    ].forEach(id => {
        const el = clone.querySelector("#" + id);
        if (el) el.remove();
    });

    // Add a fresh group for our summary dots, before #outside-perimeter
    const transformations = clone.querySelector("#transformations");
    const perimeter = clone.querySelector("#outside-perimeter");
    if (transformations) {
        const dotsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        dotsGroup.id = "summary-dots";
        transformations.insertBefore(dotsGroup, perimeter || null);
    }

    return clone;
}

// ─── Main render ──────────────────────────────────────────────────────────────

function renderSummary() {
    const container = d3.select("#summary-container");
    container.selectAll("*").remove();

    const W = parseFloat(cfgSportA.width);

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

    // ── event type toggles ──
    const typeBar = container.append("div").attr("class", "summary-type-bar");
    const TYPES = [
        { key: "shots",     label: "Shots",     color: cfgAppearance.blueTeamSolid },
        { key: "hits",      label: "Hits",       color: "#e63946" },
        { key: "turnovers", label: "Turnovers",  color: "#8338ec" },
    ];
    TYPES.forEach(({ key, label, color }) => {
        const active = activeTypes.has(key);
        typeBar.append("button")
            .attr("class", "summary-type-btn grey-btn" + (active ? " summary-type-active" : ""))
            .style("border-color", active ? color : null)
            .style("color",        active ? color : null)
            .text(label)
            .on("click", () => {
                activeTypes.has(key) ? activeTypes.delete(key) : activeTypes.add(key);
                renderSummary();
            });
    });

    // ── collect + normalise rows ──
    const allRows = getRows() || [];

    function normaliseCoords(coords, period) {
        const [rawX, rawY] = coords;
        return [period === "2" ? W - rawX : rawX, rawY];
    }

    const dots = [];

    allRows.forEach(row => {
        const period = row.rowData["period"];
        if (activePeriod !== "All" && period !== activePeriod) return;
        if (!row.specialData.coords) return;

        const [nx, ny] = normaliseCoords(row.specialData.coords, period);
        const type = row.rowData["shot-type"] || "";

        if (!row.specialData.isStatRow && activeTypes.has("shots")) {
            dots.push({ nx, ny, kind: "shot", teamColor: row.specialData.teamColor || "greyTeam" });
        } else if (row.specialData.isStatRow) {
            if (activeTypes.has("hits") && type.includes("Hits")) {
                dots.push({ nx, ny, kind: "hit" });
            } else if (activeTypes.has("turnovers") && type.includes("Turnovers")) {
                dots.push({ nx, ny, kind: "turnover" });
            }
        }
    });

    // ── counts ──
    const shotDots      = dots.filter(d => d.kind === "shot");
    const shotsOffensive = shotDots.filter(d => d.nx > W / 2).length;
    const shotsDefensive = shotDots.filter(d => d.nx <= W / 2).length;

    container.append("div").attr("class", "summary-counts center")
        .html(`<span class="summary-defensive">Defensive Zone: <strong>${shotsDefensive}</strong></span>` +
              `<span class="summary-sep">|</span>` +
              `<span class="summary-offensive">Offensive Zone: <strong>${shotsOffensive}</strong></span>`);

    // ── clone rink SVG ──
    const svgNode = cloneRinkSVG();
    if (!svgNode) {
        container.append("p").text("Rink not available — switch to Inputs tab first.");
        return;
    }
    document.getElementById("summary-container").appendChild(svgNode);

    // ── zone labels (inside #summary-dots, in rink-space units) ──
    const H        = parseFloat(cfgSportA.height);
    const fontSize = H * 0.09;
    const dotsG    = d3.select("#summary-dots");

    dotsG.append("text")
        .attr("x", W * 0.25).attr("y", H * 0.13)
        .attr("text-anchor", "middle").attr("font-size", fontSize)
        .attr("font-family", "Open Sans, sans-serif").attr("font-weight", "600")
        .attr("fill", cfgAppearance.orangeTeamSolid).attr("pointer-events", "none")
        .text("Defensive Zone");

    dotsG.append("text")
        .attr("x", W * 0.75).attr("y", H * 0.13)
        .attr("text-anchor", "middle").attr("font-size", fontSize)
        .attr("font-family", "Open Sans, sans-serif").attr("font-weight", "600")
        .attr("fill", cfgAppearance.blueTeamSolid).attr("pointer-events", "none")
        .text("Offensive Zone");

    // ── render dots ──
    const circleR = parseFloat(cfgSportA.circleR);
    const polyR   = parseFloat(cfgSportA.polyR || cfgSportA.circleR);

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
}
