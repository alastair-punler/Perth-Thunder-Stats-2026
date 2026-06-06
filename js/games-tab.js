import { listGames, loadGameEvents, setCurrentGame, isConfigured } from "./db.js";
import { clearTable, getHeaderRow, getRows, addRow, setNumRows } from "./table/table-functions.js";
import { applyImportedStat, resetRosterForImport } from "./roster/roster.js";
import { cfgSportA } from "../setup.js";

const STAT_KEY_BY_TYPE = {
    "Turnovers": "turnovers",
    "Hits":      "hits",
    "FO Win":    "faceoffWins",
    "FO Loss":   "faceoffLosses",
};

export function setUpGamesTab() {
    const btn = document.getElementById("games-tab-btn");
    if (!btn) return;
    btn.addEventListener("shown.bs.tab", () => loadAndRenderGames());
}

async function loadAndRenderGames() {
    const container = document.getElementById("games-list-container");
    if (!container) return;

    if (!isConfigured()) {
        container.innerHTML = '<p class="text-muted fst-italic">Database not configured — Supabase env vars not set.</p>';
        return;
    }

    container.innerHTML = `
        <div class="d-flex align-items-center gap-2 text-muted mt-2 ms-1">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>Loading games…</span>
        </div>`;
    const games = await listGames();

    if (!games.length) {
        container.innerHTML = '<p class="text-muted fst-italic">No games in database yet.</p>';
        return;
    }

    const table = document.createElement("table");
    table.className = "table table-sm table-hover align-middle";

    const thead = table.createTHead();
    const hr    = thead.insertRow();
    ["Date", "Home", "Score", "Away", ""].forEach(text => {
        const th = document.createElement("th");
        th.textContent = text;
        hr.appendChild(th);
    });

    const tbody = table.createTBody();
    for (const game of games) {
        const tr = tbody.insertRow();
        tr.insertCell().textContent = game.date;
        tr.insertCell().textContent = game.home_name || "Home";

        const scoreCell = tr.insertCell();
        if (game.home_score != null && game.away_score != null) {
            scoreCell.textContent = `${game.home_score} – ${game.away_score}`;
            scoreCell.style.textAlign  = "center";
            scoreCell.style.fontWeight = "600";
        } else {
            scoreCell.textContent  = "–";
            scoreCell.style.textAlign = "center";
            scoreCell.style.color  = "#aaa";
        }

        tr.insertCell().textContent = game.away_name || "Away";

        const btn = document.createElement("button");
        btn.className   = "btn btn-sm btn-outline-primary";
        btn.textContent = "Load";
        btn.addEventListener("click", () => loadGame(game, btn));
        tr.insertCell().appendChild(btn);
    }

    container.innerHTML = "";
    container.appendChild(table);
}

async function loadGame(game, triggerBtn) {
    triggerBtn.disabled    = true;
    triggerBtn.textContent = "Loading…";

    const events = await loadGameEvents(game.id);

    // Wipe current localStorage state cleanly
    clearTable();
    resetRosterForImport();

    // Write all events into localStorage — the page reload will render from there
    const numberCol = _.findIndex(getHeaderRow(), { type: "shot-number" }) - 1;

    for (const ev of events) {
        const id = ev.id;

        // Reconstruct SVG coords from game coords (like CSV import does)
        const gx = parseFloat(ev.x);
        const gy = parseFloat(ev.y);
        const svgCoords = (!isNaN(gx) && !isNaN(gy))
            ? [gx + cfgSportA.width / 2, gy * -1 + cfgSportA.height / 2]
            : [ev.svg_x ?? cfgSportA.width / 2, ev.svg_y ?? cfgSportA.height / 2];

        const specialData = {
            coords:    svgCoords,
            teamColor: ev.team_color || "blueTeam",
            typeIndex: ev.type_index ?? 0,
            player:    ev.player     || "",
            numberCol,
        };
        if (ev.is_stat_row) specialData.isStatRow = true;

        const rowData = {
            "shot-number": (getRows() || []).length + 1,
            "period":    ev.period || "",
            "team":      ev.team   || "",
            "shot-type": ev.type   || "",
            "x": !isNaN(gx) ? gx.toFixed(2) : "",
            "y": !isNaN(gy) ? gy.toFixed(2) : "",
        };

        addRow({ id, rowData, specialData, selected: false });

        if (ev.is_stat_row) {
            const statKey = resolveStatKey(ev.type);
            if (statKey) applyImportedStat(id, ev.player, statKey, svgCoords);
        }
    }

    setNumRows(events.length);
    setCurrentGame(game.id);

    // Ask setup.js to restore the Games tab after reload instead of the default Inputs tab
    sessionStorage.setItem("pendingTab", "games-tab-btn");

    location.reload();
}

function resolveStatKey(typeStr) {
    if (!typeStr) return null;
    if (STAT_KEY_BY_TYPE[typeStr]) return STAT_KEY_BY_TYPE[typeStr];
    for (const [label, key] of Object.entries(STAT_KEY_BY_TYPE)) {
        if (typeStr.includes(label)) return key;
    }
    return null;
}
