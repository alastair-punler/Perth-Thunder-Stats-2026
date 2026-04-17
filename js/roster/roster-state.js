let _selectedPlayer = null;
let _selectedStat = null;
let _recordCallback = null;

export function setRecordCallback(fn) { _recordCallback = fn; }

export function setSelectedPlayer(p) { _selectedPlayer = p; }
export function getSelectedPlayer() { return _selectedPlayer; }

export function setSelectedStat(s) { _selectedStat = s; }
export function getSelectedStat() { return _selectedStat; }

export function getRosterSelection() {
    if (_selectedPlayer && _selectedStat)
        return { player: _selectedPlayer, stat: _selectedStat };
    return null;
}

export function triggerRecord(svgCoords) {
    if (_recordCallback && _selectedPlayer && _selectedStat)
        _recordCallback(_selectedPlayer, _selectedStat, svgCoords);
}
