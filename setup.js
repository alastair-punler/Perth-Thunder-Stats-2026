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
import { initDB, isConfigured, setCurrentGame, saveGame } from "./js/db.js";

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

async function setUpNewGameModal(rink) {
    if (!isConfigured()) return;

    const existingId = sessionStorage.getItem('currentGameId');
    if (existingId) {
        setCurrentGame(existingId);
        return;
    }

    const modal = new bootstrap.Modal(document.getElementById('new-game-modal'), {
        backdrop: 'static',
        keyboard: false,
    });

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('game-date').value = today;

    // Show "Continue last game" button if a previous game exists
    const lastGameId = localStorage.getItem('lastGameId');
    if (lastGameId) {
        const continueBtn = document.getElementById('continue-game-btn');
        continueBtn.style.display = '';
        continueBtn.addEventListener('click', () => {
            setCurrentGame(lastGameId);
            modal.hide();
        });
    }

    modal.show();

    await new Promise(resolve => {
        document.getElementById('start-game-btn').addEventListener('click', async () => {
            const opponent = document.getElementById('game-opponent').value.trim();
            const date     = document.getElementById('game-date').value;
            const venue    = document.getElementById('game-venue').value.trim();
            const homeName = d3.select("#blue-team-name").property("value") || "Home";
            const awayName = d3.select("#orange-team-name").property("value") || "Away";
            const name     = opponent ? `vs ${opponent}` : 'Game';

            const gameId = await saveGame({ name, date, opponent, venue, rink, homeName, awayName });
            if (gameId) {
                setCurrentGame(gameId);
                localStorage.setItem('lastGameId', gameId);
            }
            modal.hide();
            resolve();
        });

        // Also resolve if "continue" was clicked (modal hides, promise resolves)
        document.getElementById('new-game-modal').addEventListener('hidden.bs.modal', resolve, { once: true });
    });
}

function setUpResetButton() {
    d3.select(".header")
        .append("button")
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
