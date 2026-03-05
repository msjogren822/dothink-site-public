// Treehouse JS: Fetch trends from Neon API, fall back to static JSON
async function fetchTrends() {
    try {
        // Try Neon API first
        const apiRes = await fetch('/.netlify/functions/treehouse-api');
        if (apiRes.ok) {
            const trends = await apiRes.json();
            displayTrends(trends, new Date().toLocaleString() + ' (live)');
            return;
        }
    } catch (e) {
        console.log('API not available, trying static JSON:', e.message);
    }
    
    // Fall back to static JSON
    try {
        const res = await fetch('feeds/trends.json');
        const trends = await res.json();
        displayTrends(trends, new Date().toLocaleString());
    } catch (e) {
        document.getElementById('trend-list').innerHTML = '<li>Trends loading...</li>';
        console.error('Fetch error:', e);
    }
}

// Display trends in the UI
function displayTrends(trends, timestamp) {
    const list = document.getElementById('trend-list');
    list.innerHTML = '';
    trends.filter(t => !t.signature).forEach(trend => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a><br>${trend.desc}`;
        list.appendChild(li);
    });
    loadScoutView(trends);
    document.getElementById('last-update').textContent = timestamp;
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

// Load from archive (Neon API)
function loadArchive(dbId) {
    fetch(`/.netlify/functions/treehouse-archive?id=${dbId}`)
        .then(res => res.json())
        .then(trends => {
            displayTrends(trends, 'Archive loaded');
        })
        .catch(e => {
            console.error('Archive load error:', e);
            document.getElementById('trend-list').innerHTML = '<li>Error loading archive</li>';
        });
}

// Populate archive dropdown from Neon
async function populateArchiveDropdown() {
    try {
        const res = await fetch('/.netlify/functions/treehouse-archives');
        const archives = await res.json();
        const select = document.getElementById('archive-select');
        select.innerHTML = '';
        // Skip the first one (it's already showing as latest)
        archives.slice(1).forEach(arch => {
            const opt = document.createElement('option');
            opt.value = arch.dbId;
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
    // Auto-select the most recent archive (index 0, since no placeholder)
    const select = document.getElementById('archive-select');
    if (select.options.length > 0) {
        select.selectedIndex = 0;
        loadArchive(select.value);
    } else {
        fetchTrends();
    }
});
