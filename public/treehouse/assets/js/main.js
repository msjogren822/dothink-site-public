// Treehouse JS: Fetch trends from feeds/trends.json or API
async function fetchTrends() {
    try {
        const res = await fetch('feeds/trends.json');
        const trends = await res.json();
        const list = document.getElementById('trend-list');
        list.innerHTML = '';
        trends.forEach(trend => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${trend.title}</strong> <a href="${trend.url}" class="trend-link" target="_blank">→ Read</a><br>${trend.desc}`;
            list.appendChild(li);
        });
        document.getElementById('last-update').textContent = new Date().toLocaleString();
    } catch (e) {
        document.getElementById('trend-list').innerHTML = '<li>Trends loading... (fallback: check console)</li>';
        console.error(e);
    }
}
fetchTrends(); // Auto-load

// Archive load
function loadArchive(filename) {
    if (!filename) return fetchTrends();
    fetch(`feeds/archive/${filename}`).then(res => res.json()).then(trends => {
        const list = document.getElementById('trend-list');
        list.innerHTML = '';
        trends.forEach(trend => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${trend.title}</strong> <a href="${trend.url}" class="trend-link" target="_blank">→ Read</a><br>${trend.desc}`;
            list.appendChild(li);
        });
        document.getElementById('last-update').textContent = `Archive: ${filename}`;
    }).catch(e => console.error(e));
}
