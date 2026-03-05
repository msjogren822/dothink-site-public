// Treehouse JS: Fetch trends from Neon API, fall back to static JSON
async function fetchTrends() {
    // Fetch votes first
    const votes = await fetchVotes();
    
    try {
        // Try Neon API first
        const apiRes = await fetch('/.netlify/functions/treehouse-api');
        if (apiRes.ok) {
            const data = await apiRes.json();
            // Handle new format with _meta or old format
            const trends = data.trends || data;
            const timestamp = (data._meta && data._meta.generatedAt) || 'Live from DB';
            displayTrends(trends, timestamp, votes);
            return;
        }
    } catch (e) {
        console.log('API not available, trying static JSON:', e.message);
    }
    
    // Fall back to static JSON
    try {
        const res = await fetch('feeds/trends.json');
        const trends = await res.json();
        displayTrends(trends, new Date().toLocaleString(), votes);
    } catch (e) {
        document.getElementById('trend-list').innerHTML = '<li>Trends loading...</li>';
        console.error('Fetch error:', e);
    }
}

// Display trends in the UI
function displayTrends(trends, timestamp, votes = {}) {
    const list = document.getElementById('trend-list');
    list.innerHTML = '';
    trends.filter(t => !t.signature).forEach((trend, idx) => {
        const li = document.createElement('li');
        // Handle both 'summary' (Neon) and 'desc' (static JSON) field names
        const description = trend.summary || trend.desc || '';
        const source = trend.source ? `<span style="color: var(--text-light); font-size: 0.85em;">(${trend.source})</span>` : '';
        
        const v = votes[idx] || { up: 0, down: 0 };
        
        li.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button onclick="voteTrend(${idx}, 'up')" title="thumbs up" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em;">👍</button>
                    <span style="font-size:0.8em; text-align:center;">${v.up}</span>
                    <button onclick="voteTrend(${idx}, 'down')" title="thumbs down" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em;">👎</button>
                    <span style="font-size:0.8em; text-align:center;">${v.down}</span>
                </div>
                <div>
                    <a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a> ${source}<br>${description}
                </div>
            </div>
        `;
        list.appendChild(li);
    });
    loadScoutView(trends);
    document.getElementById('last-update').textContent = timestamp;
}

// Fetch votes from API
async function fetchVotes() {
    try {
        const res = await fetch('/.netlify/functions/treehouse-votes');
        if (!res.ok) return {};
        return await res.json();
    } catch (e) {
        console.log('Votes unavailable:', e.message);
        return {};
    }
}

// Vote on a trend
async function voteTrend(idx, vote) {
    try {
        await fetch('/.netlify/functions/treehouse-votes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trend_id: idx, vote: vote })
        });
        // Refresh to show new counts
        fetchTrends();
    } catch (e) {
        console.error('Vote failed:', e);
    }
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

// Countdown to next update (runs every 4h from 12:46 AM CST = 6:46 AM UTC)
function startCountdown() {
    const nextUpdate = new Date();
    // Next update: 4:46 PM CST today (or tomorrow if past)
    nextUpdate.setHours(16, 46, 0, 0);
    const now = new Date();
    if (now > nextUpdate) {
        nextUpdate.setDate(nextUpdate.getDate() + 1);
    }
    
    function update() {
        const now = new Date();
        const diff = nextUpdate - now;
        
        if (diff <= 0) {
            nextUpdate.setDate(nextUpdate.getDate() + 1);
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        
        // Funky display
        const el = document.getElementById('countdown');
        if (el) {
            el.innerHTML = `<span style="color: #ff6b6b; font-weight: bold;">⏱️ ${hours}h ${mins}m ${secs}s</span>`;
        }
    }
    
    update();
    setInterval(update, 1000);
}

// Comments: fetch + submit
async function loadComments() {
    try {
        const res = await fetch('/.netlify/functions/treehouse-comments');
        if (!res.ok) throw new Error('Comments API unavailable');
        const comments = await res.json();
        const list = document.getElementById('comment-list');
        list.innerHTML = '';
        if (!comments || comments.length === 0) {
            list.innerHTML = '<p>No comments yet — be the first!</p>';
            return;
        }
        comments.forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment';
            div.style.padding = '0.5rem';
            div.style.borderBottom = '1px solid var(--border)';
            div.innerHTML = `<strong>${escapeHtml(c.name || 'Anonymous')}</strong> <span style="color:var(--text-light); font-size:0.9em;">• ${new Date(c.created_at).toLocaleString()}</span><p style="margin:0.3rem 0 0 0;">${escapeHtml(c.message)}</p>`;
            list.appendChild(div);
        });
    } catch (e) {
        console.error('Comment load error:', e);
        const list = document.getElementById('comment-list');
        list.innerHTML = '<p>Unable to load comments.</p>';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[m]; });
}

// Submit comment handler
async function handleCommentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('comment-name').value.trim();
    const message = document.getElementById('comment-message').value.trim();
    if (!message) return;
    try {
        const res = await fetch('/.netlify/functions/treehouse-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name || null, message })
        });
        if (!res.ok) throw new Error('Failed to post');
        document.getElementById('comment-message').value = '';
        document.getElementById('comment-name').value = '';
        alert('Thanks! Your comment is pending review and will appear soon.');
    } catch (e) {
        console.error('Comment submit error:', e);
        alert('Unable to post comment. Try again later.');
    }
}

// Auto-load on page load - show current trends by default, not archive
document.addEventListener('DOMContentLoaded', async () => {
    await populateArchiveDropdown();
    startCountdown();
    // Load current trends first (not archive)
    fetchTrends();
    // Comments
    loadComments();
    const form = document.getElementById('comment-form');
    if (form) form.addEventListener('submit', handleCommentSubmit);
});
