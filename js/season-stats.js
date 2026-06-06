import { isConfigured, loadAllGamePlayers, loadAllStatEvents, listGames } from "./db.js";

// ─── Sort state ───────────────────────────────────────────────────────────────

let sortColumn = null;
let sortDir    = "desc";

// ─── Column definitions ───────────────────────────────────────────────────────

const COLS = [
    { key: "number",    label: "#",    getValue: r => parseInt(r.number, 10) || 0, isNumeric: true  },
    { key: "name",      label: "Name", getValue: r => r.name,                       isNumeric: false },
    { key: "gp",        label: "GP",   getValue: r => r.gp,                         isNumeric: true  },
    { key: "hits",      label: "Hits", getValue: r => r.hits,                       isNumeric: true  },
    { key: "turnovers", label: "TO",   getValue: r => r.turnovers,                  isNumeric: true  },
    { key: "foWins",    label: "FO W", getValue: r => r.foWins,                     isNumeric: true  },
    { key: "foLosses",  label: "FO L",   getValue: r => r.foLosses,                  isNumeric: true  },
    { key: "foTotal",   label: "FO Tot", getValue: r => r.foWins + r.foLosses,       isNumeric: true  },
    { key: "foPct",     label: "FO%",   getValue: r => {
        const t = r.foWins + r.foLosses;
        return t > 0 ? r.foWins / t * 100 : -1;
    }, isNumeric: true },
];

// ─── Cached data ──────────────────────────────────────────────────────────────

let cachedRows   = null;   // aggregated player rows
let cachedByGame = null;   // Map: playerNumber -> Map: gameId -> stats
let cachedGames  = null;   // Map: gameId -> game object

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setUpSeasonStats() {
    const btn = document.getElementById("season-stats-tab-btn");
    if (!btn) return;
    btn.addEventListener("shown.bs.tab", () => loadAndRender());
}

// ─── Load + aggregate ─────────────────────────────────────────────────────────

async function loadAndRender() {
    const container = d3.select("#season-stats-container");

    if (!isConfigured()) {
        container.html('<p class="text-muted fst-italic" style="padding:1.25rem">Database not configured — Supabase env vars not set.</p>');
        return;
    }

    container.html(`
        <div class="d-flex align-items-center gap-2 text-muted mt-2 ms-1" style="padding:1.25rem">
            <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
            <span>Loading season stats…</span>
        </div>`);

    const [gamePlayers, statEvents, games] = await Promise.all([
        loadAllGamePlayers(),
        loadAllStatEvents(),
        listGames(),
    ]);

    cachedGames = new Map(games.map(g => [g.id, g]));

    // playerMap: number -> { name, gp, hits, turnovers, foWins, foLosses, statsByGame }
    const playerMap = new Map();

    for (const gp of gamePlayers) {
        const num = gp.player_number;
        if (!playerMap.has(num)) {
            playerMap.set(num, {
                number: num,
                name: gp.player_name || "",
                games: new Set(),
                statsByGame: new Map(),
            });
        }
        const p = playerMap.get(num);
        if (gp.player_name) p.name = gp.player_name;
        p.games.add(gp.game_id);
        if (!p.statsByGame.has(gp.game_id)) {
            p.statsByGame.set(gp.game_id, { hits: 0, turnovers: 0, foWins: 0, foLosses: 0 });
        }
    }

    for (const ev of statEvents) {
        if (!ev.player) continue;
        const p = playerMap.get(ev.player);
        if (!p) continue;
        const gs = p.statsByGame.get(ev.game_id);
        if (!gs) continue;
        const t = ev.type || "";
        if      (t.includes("Hits"))       gs.hits++;
        else if (t.includes("Turnovers"))  gs.turnovers++;
        else if (t.includes("FO Win"))     gs.foWins++;
        else if (t.includes("FO Loss"))    gs.foLosses++;
    }

    // Flatten into sortable rows
    cachedRows = [...playerMap.values()].map(p => {
        const totals = { hits: 0, turnovers: 0, foWins: 0, foLosses: 0 };
        for (const gs of p.statsByGame.values()) {
            totals.hits      += gs.hits;
            totals.turnovers += gs.turnovers;
            totals.foWins    += gs.foWins;
            totals.foLosses  += gs.foLosses;
        }
        return {
            number:     p.number,
            name:       p.name,
            gp:         p.games.size,
            statsByGame: p.statsByGame,
            ...totals,
        };
    });

    cachedByGame = new Map(
        [...playerMap.entries()].map(([num, p]) => [num, p.statsByGame])
    );

    if (!cachedRows.length) {
        container.html('<p class="text-muted fst-italic" style="padding:1.25rem">No season data yet — save a game with a roster snapshot first.</p>');
        return;
    }

    render();
}

// ─── Render (uses cached data, called on load + every sort click) ─────────────

function render() {
    if (!cachedRows) return;

    // Sort
    let sorted = [...cachedRows];
    if (sortColumn) {
        const col = COLS.find(c => c.key === sortColumn);
        if (col) {
            sorted.sort((a, b) => {
                const va = col.getValue(a);
                const vb = col.getValue(b);
                if (col.isNumeric) return sortDir === "desc" ? vb - va : va - vb;
                return sortDir === "desc" ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
            });
        }
    } else {
        // Default: sort by jersey number ascending
        sorted.sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
    }

    const container = d3.select("#season-stats-container");
    container.html("");

    const wrap = container.append("div").style("padding", "1.25rem");
    wrap.append("h5").style("margin-bottom", "1rem").text("Season Player Stats");

    const table = wrap.append("table")
        .attr("class", "table table-sm table-hover align-middle summary-leaderboard-table");

    // Header
    const hRow = table.append("thead").append("tr");
    COLS.forEach(col => {
        const isActive  = sortColumn === col.key;
        const indicator = isActive ? (sortDir === "desc" ? " ▼" : " ▲") : "";
        hRow.append("th")
            .attr("class", "summary-leaderboard-hdr" + (isActive ? " summary-leaderboard-hdr-active" : ""))
            .style("cursor", "pointer")
            .html(col.label + (indicator ? `<span class="sort-indicator">${indicator}</span>` : ""))
            .on("click", () => {
                if (sortColumn === col.key) {
                    sortDir = sortDir === "desc" ? "asc" : "desc";
                } else {
                    sortColumn = col.key;
                    sortDir    = "desc";
                }
                render();
            });
    });

    // Body
    const tbody = table.append("tbody");
    sorted.forEach(player => {
        const foTotal  = player.foWins + player.foLosses;
        const foPct    = foTotal > 0 ? Math.round((player.foWins / foTotal) * 100) + "%" : "—";
        const values   = [
            player.number, player.name, player.gp,
            player.hits, player.turnovers,
            player.foWins, player.foLosses, foTotal, foPct,
        ];

        const tr = tbody.append("tr").style("cursor", "pointer").attr("title", "Click to see game-by-game breakdown");

        values.forEach((v, i) => {
            tr.append("td")
                .attr("class", sortColumn === COLS[i].key ? "summary-leaderboard-col-active" : "")
                .text(v);
        });

        // Drill-down row
        const drillRow = tbody.append("tr")
            .attr("class", "season-drill-row")
            .style("display", "none");
        const drillCell = drillRow.append("td")
            .attr("colspan", COLS.length)
            .style("background", "#f8f9fa")
            .style("padding", "0.5rem 1rem");

        tr.on("click", () => {
            const isOpen = drillRow.style("display") !== "none";
            drillRow.style("display", isOpen ? "none" : null);
            if (!isOpen) drillCell.html(buildDrillDown(player.number));
        });
    });
}

// ─── Drill-down ───────────────────────────────────────────────────────────────

function buildDrillDown(playerNumber) {
    const statsByGame = cachedByGame?.get(playerNumber);
    if (!statsByGame?.size) return "<em>No game data.</em>";

    const entries = [...statsByGame.entries()].sort((a, b) => {
        const da = cachedGames.get(a[0])?.date || "";
        const db = cachedGames.get(b[0])?.date || "";
        return db.localeCompare(da);
    });

    const rows = entries.map(([gameId, gs]) => {
        const game     = cachedGames.get(gameId);
        const date     = game?.date      || "—";
        const opponent = game?.away_name || game?.opponent || "—";
        const foTotal  = gs.foWins + gs.foLosses;
        const foPct    = foTotal > 0 ? Math.round((gs.foWins / foTotal) * 100) + "%" : "—";
        return `<tr>
            <td>${date}</td><td>${opponent}</td>
            <td>${gs.hits}</td><td>${gs.turnovers}</td>
            <td>${gs.foWins}</td><td>${gs.foLosses}</td><td>${foPct}</td>
        </tr>`;
    }).join("");

    return `<table class="table table-sm mb-0">
        <thead><tr>
            <th>Date</th><th>Opponent</th>
            <th>Hits</th><th>TO</th><th>FO W</th><th>FO L</th><th>FO%</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}
