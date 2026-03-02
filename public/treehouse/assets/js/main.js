// Treehouse JS: Fetch trends from feeds/trends.json or archive
async function fetchTrends() {
    try {
        const res = await fetch('feeds/trends.json');
        const trends = await res.json();
        const list = document.getElementById('trend-list');
        list.innerHTML = '';
        trends.forEach(trend => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a><br>${trend.desc}`;
            list.appendChild(li);
        });
        document.getElementById('last-update').textContent = new Date().toLocaleString();
    } catch (e) {
        document.getElementById('trend-list').innerHTML = '<li>Trends loading... (check console if issues)</li>';
        console.error('Fetch error:', e);
    }
}

// Load from archive
function loadArchive(filename) {
    if (!filename) return fetchTrends();
    fetch(`feeds/archive/${filename}`).then(res => res.json()).then(trends => {
        const list = document.getElementById('trend-list');
        list.innerHTML = '';
        trends.forEach(trend => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a><br>${trend.desc}`;
            list.appendChild(li);
        });
        document.getElementById('last-update').textContent = `Archive: ${filename}`;
    }).catch(e => {
        console.error('Archive load error:', e);
        document.getElementById('trend-list').innerHTML = '<li>Error loading archive</li>';
    });
}

// Auto-load on page load
document.addEventListener('DOMContentLoaded', fetchTrends);
