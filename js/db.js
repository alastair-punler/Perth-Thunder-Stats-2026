// Supabase persistence layer.
// Requires window.supabase (CDN UMD) and window.APP_CONFIG (js/config.js) loaded first.
// All functions are fire-and-forget safe — errors are logged, never thrown.

let _client = null;

export function initDB() {
    const cfg = window.APP_CONFIG || {};
    const { supabaseUrl, supabaseKey } = cfg;
    if (!supabaseUrl || supabaseUrl.startsWith("$") || !window.supabase) return;
    _client = window.supabase.createClient(supabaseUrl, supabaseKey);
}

export function isConfigured() {
    return _client !== null;
}

function token() {
    return (window.APP_CONFIG || {}).appToken || "";
}

export function setCurrentGame(id) {
    id
        ? sessionStorage.setItem("currentGameId", id)
        : sessionStorage.removeItem("currentGameId");
}

export function getCurrentGameId() {
    return sessionStorage.getItem("currentGameId");
}

export async function saveGame({ name, date, opponent, venue, rink, homeName, awayName, homeScore, awayScore }) {
    if (!_client) return null;
    try {
        const { data, error } = await _client
            .from("games")
            .insert([{
                name,
                date: date || new Date().toISOString().split("T")[0],
                opponent: opponent || null,
                venue: venue || null,
                rink,
                home_name:  homeName  || "Home",
                away_name:  awayName  || "Away",
                home_score: homeScore ?? null,
                away_score: awayScore ?? null,
                app_token: token(),
            }])
            .select()
            .single();
        if (error) { console.warn("db.saveGame:", error.message); return null; }
        return data.id;
    } catch (e) { console.warn("db.saveGame:", e); return null; }
}

export async function listGames() {
    if (!_client) return [];
    try {
        const { data, error } = await _client
            .from("games")
            .select("*")
            .order("date", { ascending: false })
            .order("created_at", { ascending: false });
        if (error) { console.warn("db.listGames:", error.message); return []; }
        return data || [];
    } catch (e) { return []; }
}

export async function saveEvent(row) {
    const gameId = getCurrentGameId();
    if (!_client || !gameId) return;
    const { id, rowData, specialData } = row;
    try {
        await _client.from("events").upsert([{
            id,
            game_id:     gameId,
            period:      rowData["period"]      ?? null,
            team:        rowData["team"]        ?? null,
            type:        rowData["shot-type"]   ?? null,
            player:      specialData.player     ?? null,
            x:           parseFloat(rowData["x"])  || null,
            y:           parseFloat(rowData["y"])  || null,
            svg_x:       specialData.coords?.[0]   ?? null,
            svg_y:       specialData.coords?.[1]   ?? null,
            team_color:  specialData.teamColor      ?? null,
            type_index:  specialData.typeIndex      ?? 0,
            is_stat_row: !!specialData.isStatRow,
            app_token:   token(),
        }]);
    } catch (e) { console.warn("db.saveEvent:", e); }
}

export async function deleteEvent(id) {
    if (!_client) return;
    try {
        await _client.from("events").delete().eq("id", id);
    } catch (e) { console.warn("db.deleteEvent:", e); }
}

export async function bulkSaveEvents(gameId, rows) {
    if (!_client || !gameId || !rows?.length) return;
    const records = rows.map(({ id, rowData, specialData }) => {
        const xVal = parseFloat(rowData["x"]);
        const yVal = parseFloat(rowData["y"]);
        return {
        id,
        game_id:     gameId,
        period:      rowData["period"]      ?? null,
        team:        rowData["team"]        ?? null,
        type:        rowData["shot-type"]   ?? null,
        player:      specialData.player     ?? null,
        x:           isNaN(xVal) ? null : xVal,
        y:           isNaN(yVal) ? null : yVal,
        svg_x:       specialData.coords?.[0]   ?? null,
        svg_y:       specialData.coords?.[1]   ?? null,
        team_color:  specialData.teamColor      ?? null,
        type_index:  specialData.typeIndex      ?? 0,
        is_stat_row: !!specialData.isStatRow,
        app_token:   token(),
    };});
    try {
        await _client.from("events").upsert(records);
    } catch (e) { console.warn("db.bulkSaveEvents:", e); }
}

export async function loadGameEvents(gameId) {
    if (!_client) return [];
    try {
        const { data, error } = await _client
            .from("events")
            .select("*")
            .eq("game_id", gameId)
            .order("created_at", { ascending: true });
        if (error) { console.warn("db.loadGameEvents:", error.message); return []; }
        return data || [];
    } catch (e) { return []; }
}
