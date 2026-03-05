// Treehouse JS: Fetch trends from Neon API, fall back to static JSON
async function fetchTrends() {
    try {
        // Try Neon API first
        const apiRes = await fetch('/.netlify/functions/treehouse-api');
        if (apiRes.ok) {
            const data = await apiRes.json();
            // Handle new format with _meta or old format
            const trends = data.trends || data;
            const timestamp = (data._meta && data._meta.generatedAt) || 'Live from DB';
            displayTrends(trends, timestamp);
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
        // Handle both 'summary' (Neon) and 'desc' (static JSON) field names
        const description = trend.summary || trend.desc || '';
        const source = trend.source ? `<span style="color: var(--text-light); font-size: 0.85em;">(${trend.source})</span>` : '';
        li.innerHTML = `<a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a> ${source}<br>${description}`;
        list.appendChild(li);
    });
    loadScoutView(trends);
    document.getElementById('last-update').textContent = timestamp;
}

// Load Scout's View from data
function loadScoutView(data) {
    // Scout's View is identified by having a signature field
    const scoutEntry = data.find(item => item.signature && item.signature.includes("Scout"));
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
        .then(data => {
            // Handle new format with _meta or old format
            const trends = data.trends || data;
            const timestamp = (data._meta && data._meta.generatedAt) || 'Archive';
            displayTrends(trends, 'Archive: ' + timestamp);
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
        // Show ALL records (most recent first) so user can compare any
        archives.forEach((arch, index) => {
            const opt = document.createElement('option');
            opt.value = arch.dbId;
            const label = index === 0 ? arch.label + ' (latest)' : arch.label;
            opt.textContent = label;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Archive index load error:', e);
    }
}

// Auto-load on page load - show current trends by default, not archive
document.addEventListener('DOMContentLoaded', async () => {
    await populateArchiveDropdown();
    // Load current trends first (not archive)
    fetchTrends();
});
