import { setUpPlayingArea } from "./js/playing-area.js";
import { setUpDetailsPanel } from "./js/details/details-panel.js";
import { setUpToggles } from "./js/toggles.js";
import { setUpShots } from "./js/shots/shot.js";
import { setUpTable } from "./js/table/table.js";
import { setUpCSVDownloadUpload } from "./js/csv.js";
import { setUpLegend, shotTypeLegend } from "./js/shots/legend.js";
import { setUpRoster } from "./js/roster/roster.js";
import { setUpSummary } from "./js/summary/summary.js";
import { select2Dropdown } from "./js/details/widgets/widgets-special.js";
import { cfgOtherSetup } from "./js/details/config-details.js";
import { customCardSetup } from "./js/custom-setups/card-setup.js";
import { customConfigSetup } from "./js/custom-setups/config-setup.js";
import { initDB, isConfigured, setCurrentGame, saveGame, deleteGameEvents, saveEvent, getCurrentGameId } from "./js/db.js";
import { getRows } from "./js/table/table-functions.js";

export let sport;
export let dataStorage;
export let cfgSportCustomSetup;
export let cfgSportA;
export let cfgSportGoalCoords;
export let cfgSportScoringArea;
export let getDefaultSetup;
export let cfgDefaultEnable;
export let perimeterId;

export function indexSetup() {
    d3.json("/supported-sports.json").then((data) => {
        const customSports = _.filter(data.sports, "needsCustomSetup");
        for (const s of customSports) {
            customCardSetup(s);
        }
    });
}

export function setCfgSportGoalCoords(newGoalCoords) {
    cfgSportGoalCoords = newGoalCoords;
}

export function setup(s) {
    sport = s;
    dataStorage = localDataStorage(sport);
    initDB();
    d3.json("/supported-sports.json").then(async (data) => {
        let sportData = _.find(data.sports, { id: sport });
        cfgSportCustomSetup = false;
        if (sportData.needsCustomSetup) {
            sportData = customConfigSetup(sportData);
            cfgSportCustomSetup = true;
        }
        cfgSportA = sportData.appearance;
        cfgSportGoalCoords = sportData.goalCoords;
        cfgSportScoringArea = sportData.scoringArea;
        perimeterId = sportData.perimeter;
        getDefaultSetup = function () {
            const details = _.cloneDeep(sportData.defaultDetails);
            return {
                details: details,
                ...cfgOtherSetup,
                twoPointEnable:
                    _.some(details, { type: "x", id: "x2" }) &&
                    _.some(details, { type: "y", id: "y2" }),
            };
        };
        cfgDefaultEnable = sportData.defaultEnable;

        setUpPlayingArea();
        setUpDetailsPanel();
        setUpToggles();
        setUpTable();
        setUpShots();
        setUpCSVDownloadUpload();
        setUpLegend();
        setUpRoster();
        setUpSummary();
        setUpResetButton();

        d3.select("h1")
            .attr("href", "./")
            .on("click", () => {
                window.location = "./";
            });

        function decode(a) {
            return a.replace(/[a-zA-Z]/g, function (c) {
                return String.fromCharCode(
                    (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13)
                        ? c
                        : c - 26
                );
            });
        }

        d3.select("#email").on("click", function () {
            const y = "znvygb:naxathlranaxathlra@tznvy.pbz";
            d3.select(this)
                .attr("href", decode(y))
                .on("click", () => {});
        });

        $(document).ready(function () {
            select2Dropdown();
            $("#shot-type-select").on("change", function (e) {
                shotTypeLegend();
                $(this).find("option").removeAttr("data-select2-tag");
            });
        });

        await setUpNewGameModal(s);
    });
}

async function _showNewGameModal(rink, { bulkSaveExisting = false } = {}) {
    const modal = new bootstrap.Modal(document.getElementById('new-game-modal'), {
        backdrop: 'static',
        keyboard: false,
    });

    document.getElementById('game-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('game-opponent').value = '';
    document.getElementById('game-venue').value = '';

    const lastGameId = localStorage.getItem('lastGameId');
    const continueBtn = document.getElementById('continue-game-btn');
    if (!bulkSaveExisting && lastGameId) {
        continueBtn.style.display = '';
        continueBtn.onclick = () => { setCurrentGame(lastGameId); modal.hide(); };
    } else {
        continueBtn.style.display = 'none';
    }

    const startBtn = document.getElementById('start-game-btn');
    startBtn.textContent = bulkSaveExisting ? 'Save Game' : 'Start Game';

    modal.show();

    await new Promise(resolve => {
        startBtn.addEventListener('click', async () => {
            const opponent = document.getElementById('game-opponent').value.trim();
            const date     = document.getElementById('game-date').value;
            const venue    = document.getElementById('game-venue').value.trim();
            const homeName = d3.select("#blue-team-name").property("value") || "Home";
            const awayName = d3.select("#orange-team-name").property("value") || "Away";
            const name     = opponent ? `vs ${opponent}` : 'Game';

            if (bulkSaveExisting) deleteGameEvents(getCurrentGameId());

            const gameId = await saveGame({ name, date, opponent, venue, rink, homeName, awayName });
            if (gameId) {
                setCurrentGame(gameId);
                localStorage.setItem('lastGameId', gameId);
                if (bulkSaveExisting) {
                    for (const row of (getRows() || [])) saveEvent(row);
                }
            }
            modal.hide();
            resolve();
        }, { once: true });
        document.getElementById('new-game-modal').addEventListener('hidden.bs.modal', resolve, { once: true });
    });
}

async function setUpNewGameModal(rink) {
    if (!isConfigured()) return;

    // Don't interrupt an active session — if rows exist, silently reconnect and continue
    const existingRows = dataStorage.get('rows') || [];
    if (existingRows.length > 0) {
        const lastGameId = localStorage.getItem('lastGameId');
        if (lastGameId) setCurrentGame(lastGameId);
        return;
    }

    const existingId = sessionStorage.getItem('currentGameId');
    if (existingId) {
        setCurrentGame(existingId);
        return;
    }

    await _showNewGameModal(rink);
}

export async function showSaveGameModal(rink) {
    if (!isConfigured()) return;
    await _showNewGameModal(rink, { bulkSaveExisting: true });
}

function setUpResetButton() {
    const btnGroup = d3.select(".header")
        .append("div")
        .attr("class", "header-btn-group");

    if (isConfigured()) {
        btnGroup.append("button")
            .attr("class", "new-game-btn")
            .attr("title", "Clear current data and start a new game")
            .text("New Game")
            .on("click", () => {
                if (!confirm("Start a new game? This will clear the current shot data.")) return;
                localStorage.clear();
                sessionStorage.clear();
                location.reload();
            });
    }

    btnGroup.append("button")
        .attr("class", "reset-all-btn")
        .attr("title", "Clear all shots, roster stats and settings")
        .text("Reset All Data")
        .on("click", () => {
            if (!confirm("This will permanently clear all shots, roster stats, and settings. Continue?")) return;
            localStorage.clear();
            sessionStorage.clear();
            location.reload();
        });
}
