// Treehouse JS: Fetch trends from feeds/trends.json or archive
async function fetchTrends() {
    try {
        const res = await fetch('feeds/trends.json');
        const trends = await res.json();
        const list = document.getElementById('trend-list');
        list.innerHTML = '';
        trends.filter(t => !t.signature).forEach(trend => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a><br>${trend.desc}`;
            list.appendChild(li);
        });
        // Also load Scout's View
        loadScoutView(trends);
        document.getElementById('last-update').textContent = new Date().toLocaleString();
    } catch (e) {
        document.getElementById('trend-list').innerHTML = '<li>Trends loading... (check console if issues)</li>';
        console.error('Fetch error:', e);
    }
}

// Load Scout's View from data
function loadScoutView(data) {
    const scoutEntry = data.find(item => item.title && item.title.startsWith("Scout's View:"));
    const scoutEl = document.getElementById('scout-comment');
    if (scoutEntry) {
        scoutEl.innerHTML = scoutEntry.desc + '<br><br><em style="font-size: 0.85em; color: var(--text-light);">— ' + scoutEntry.signature + '</em>';
    } else {
        scoutEl.textContent = "No Scout's View for this archive.";
    }
}

// Load from archive
function loadArchive(filename) {
    const cacheBust = '_t=' + Date.now();
    const url = filename ? `feeds/archive/${filename}?${cacheBust}` : `feeds/trends.json?${cacheBust}`;
    fetch(url).then(res => res.json()).then(trends => {
        // Update trends list
        const list = document.getElementById('trend-list');
        list.innerHTML = '';
        trends.filter(t => !t.signature).forEach(trend => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a><br>${trend.desc}`;
            list.appendChild(li);
        });
        // Update Scout's View
        loadScoutView(trends);
        document.getElementById('last-update').textContent = filename ? `Archive: ${filename}` : new Date().toLocaleString();
    }).catch(e => {
        console.error('Archive load error:', e);
        document.getElementById('trend-list').innerHTML = '<li>Error loading archive</li>';
    });
}

// Populate archive dropdown dynamically
async function populateArchiveDropdown() {
    try {
        const res = await fetch('feeds/archive-index.json');
        const archives = await res.json();
        const select = document.getElementById('archive-select');
        // First option is empty - page already shows latest (trends.json)
        // Then include all archives including the most recent
        select.innerHTML = '<option value="">-- Select Archive --</option>';
        archives.forEach(arch => {
            const opt = document.createElement('option');
            opt.value = arch.file;
            opt.textContent = arch.label;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Archive index load error:', e);
    }
}

// Auto-load on page load - load most recent archive by default
document.addEventListener('DOMContentLoaded', async () => {
    await populateArchiveDropdown();
    // Auto-select the most recent archive (index 1, after placeholder)
    const select = document.getElementById('archive-select');
    if (select.options.length > 1) {
        select.selectedIndex = 1;
        loadArchive(select.value);
    } else {
        fetchTrends();
    }
});
