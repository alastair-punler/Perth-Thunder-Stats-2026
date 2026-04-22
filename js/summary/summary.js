import { cfgSportA } from "../../setup.js";
import { getRows } from "../table/table-functions.js";
import { renderSummaryFromData, prepareRinkSVG } from "./summary-render.js";

function cloneRinkSVG() {
    const original = document.querySelector("#playing-area svg");
    if (!original) return null;
    return prepareRinkSVG(original.cloneNode(true));
}

function renderSummary() {
    const W = parseFloat(cfgSportA.width);
    const H = parseFloat(cfgSportA.height);
    const homeName = d3.select("#blue-team-name").property("value")   || "Home";
    const awayName = d3.select("#orange-team-name").property("value") || "Away";
    renderSummaryFromData(
        d3.select("#summary-container"),
        getRows() || [],
        cloneRinkSVG,
        W, H,
        homeName, awayName,
        parseFloat(cfgSportA.circleR),
        parseFloat(cfgSportA.polyR || cfgSportA.circleR)
    );
}

export function setUpSummary() {
    const btn = document.getElementById("summary-tab");
    if (!btn) return;
    btn.addEventListener("shown.bs.tab", () => renderSummary());
}
