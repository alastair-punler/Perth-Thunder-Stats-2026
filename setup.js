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
import { initDB, isConfigured, saveGame, bulkSaveEvents, setCurrentGame, saveRosterSnapshot } from "./js/db.js";
import { setUpGamesTab } from "./js/games-tab.js";
import { setUpSeasonStats } from "./js/season-stats.js";
import { getRows } from "./js/table/table-functions.js";
import { getPlayers } from "./js/roster/roster.js";

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
    d3.json("/supported-sports.json").then((data) => {
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
        initDB();
        setUpHeaderButtons();
        setUpGamesTab();
        setUpSeasonStats();

        const pendingTab = sessionStorage.getItem("pendingTab");
        if (pendingTab) {
            sessionStorage.removeItem("pendingTab");
            const tabEl = document.getElementById(pendingTab);
            if (tabEl) bootstrap.Tab.getOrCreateInstance(tabEl).show();
        }

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

        // https://www.ionos.com/digitalguide/e-mail/e-mail-security/protecting-your-email-address-how-to-do-it/

        // ROT13 encryption for email
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
                // update legend
                shotTypeLegend();

                // https://stackoverflow.com/a/54047075
                // do not delete new options
                $(this).find("option").removeAttr("data-select2-tag");
            });
        });
    });
}

function setUpHeaderButtons() {
    const actions = d3.select(".header")
        .append("div")
        .attr("class", "header-actions");

    if (isConfigured()) {
        actions.append("button")
            .attr("class", "save-to-db-btn")
            .attr("title", "Save current game data to the database")
            .text("Save to Database")
            .on("click", () => showSaveGameModal());
    }

    actions.append("button")
        .attr("class", "reset-all-btn")
        .attr("title", "Clear all shots, roster stats and settings")
        .text("Reset All Data")
        .on("click", () => {
            if (!confirm("This will permanently clear all shots, roster stats, and settings. Continue?")) return;
            localStorage.clear();
            sessionStorage.removeItem("currentGameId");
            location.reload();
        });
}

function showSaveGameModal() {
    const today = new Date().toISOString().split("T")[0];
    const ngDate = document.getElementById("ng-date");
    if (!ngDate.value) ngDate.value = today;

    const ngOpponent = document.getElementById("ng-opponent");
    if (!ngOpponent.value) {
        const awayName = d3.select("#orange-team-name").property("value");
        if (awayName) ngOpponent.value = awayName;
    }

    const modal = new bootstrap.Modal(document.getElementById("new-game-modal"));
    modal.show();

    d3.select("#ng-start-btn").on("click", async () => {
        const rows = getRows();
        if (!rows?.length) {
            modal.hide();
            alert("No shots recorded yet — nothing to save.");
            return;
        }

        const date      = d3.select("#ng-date").property("value") || today;
        const opponent  = d3.select("#ng-opponent").property("value").trim() || "Away";
        const homeName  = d3.select("#blue-team-name").property("value") || "Perth Thunder";
        const homeScore = d3.select("#ng-home-score").property("value");
        const awayScore = d3.select("#ng-away-score").property("value");

        d3.select("#ng-start-btn").attr("disabled", true).text("Saving…");

        const id = await saveGame({
            name:      `${homeName} vs ${opponent}`,
            date,
            opponent,
            rink:      sport,
            homeName,
            awayName:  opponent,
            homeScore: homeScore !== "" ? parseInt(homeScore, 10) : null,
            awayScore: awayScore !== "" ? parseInt(awayScore, 10) : null,
        });
        if (id) {
            setCurrentGame(id);
            await bulkSaveEvents(id, getRows());
            await saveRosterSnapshot(id, getPlayers());
        }

        modal.hide();
        d3.select("#ng-start-btn").attr("disabled", null).text("Save Game");
    });

    d3.select("#ng-skip-btn").on("click", () => modal.hide());
}

