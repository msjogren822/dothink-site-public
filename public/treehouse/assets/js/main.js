// Treehouse JS: Fetch trends from Neon API, fall back to static JSON

// Get or create user token for duplicate prevention
function getUserToken() {
    let token = localStorage.getItem('treehouse_user_token');
    if (!token) {
        token = 't_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('treehouse_user_token', token);
    }
    return token;
}

let userVotes = {}; // Track which trends user has voted on

async function fetchTrends() {
    // Fetch votes first (includes user's votes)
    const { votes, userVotes: uv } = await fetchVotes();
    userVotes = uv || {};
    
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
        
        // Look up votes by URL
        const urlKey = trend.url;
        const v = votes[urlKey] || { up: 0, down: 0 };
        const userVote = userVotes[urlKey]; // 'up', 'down', or undefined
        
        // Style for voted buttons
        const upStyle = userVote === 'up' ? 'opacity:1; filter:grayscale(0);' : (userVote ? 'opacity:0.3;' : '');
        const downStyle = userVote === 'down' ? 'opacity:1; filter:grayscale(0);' : (userVote ? 'opacity:0.3;' : '');
        
        li.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button onclick="voteTrend('${encodeURIComponent(trend.url)}', 'up', this)" title="thumbs up" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; ${upStyle}">👍</button>
                    <span style="font-size:0.8em; text-align:center;">${v.up}</span>
                    <button onclick="voteTrend('${encodeURIComponent(trend.url)}', 'down', this)" title="thumbs down" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; ${downStyle}">👎</button>
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

// Fetch votes from API (includes user votes)
async function fetchVotes() {
    const userToken = getUserToken();
    try {
        const res = await fetch(`/.netlify/functions/treehouse-votes?user=${encodeURIComponent(userToken)}`);
        if (!res.ok) return { votes: {}, userVotes: {} };
        const data = await res.json();
        return { votes: data.votes || data, userVotes: data.userVotes || {} };
    } catch (e) {
        console.log('Votes unavailable:', e.message);
        return { votes: {}, userVotes: {} };
    }
}

// Vote on a trend (now uses URL as identifier)
async function voteTrend(trendUrl, vote, btnElement) {
    const userToken = getUserToken();
    const decodedUrl = decodeURIComponent(trendUrl);
    try {
        const res = await fetch('/.netlify/functions/treehouse-votes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trend_url: decodedUrl, vote: vote, user_token: userToken })
        });
        
        if (res.status === 409) {
            const data = await res.json();
            showToast(`Already voted ${data.existingVote === 'up' ? '👍' : '👎'} on this!`, btnElement);
            return;
        }
        
        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Oops! Something went wrong', btnElement);
            return;
        }
        
        // Refresh to show new counts
        fetchTrends();
    } catch (e) {
        console.error('Vote failed:', e);
        showToast('Connection issue — try again?', btnElement);
    }
}

// Show toast notification
function showToast(message, targetEl, duration = 2500) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    msgEl.textContent = message;
    
    if (targetEl) {
        // Position near the target element
        const rect = targetEl.getBoundingClientRect();
        toast.style.left = (rect.left + rect.width/2) + 'px';
        toast.style.top = (rect.bottom + 10) + 'px';
        toast.style.transform = 'translateX(-50%)';
    } else {
        // Default: bottom center
        toast.style.left = '50%';
        toast.style.top = 'auto';
        toast.style.bottom = '20px';
        toast.style.transform = 'translateX(-50%)';
    }
    
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
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
            // Clear userVotes when loading archive (votes don't carry over)
            userVotes = {};
            displayTrends(trends, 'Archive: ' + timestamp, {});
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

// Countdown to next update (runs every 4h from 12:46 AM CST)
function startCountdown() {
    function getNextUpdate() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        
        // Next run is at :46 minutes, every 4 hours
        // Calculate hours: 0, 4, 8, 12, 16, 20
        let nextHour = Math.ceil(currentHour / 4) * 4;
        
        const next = new Date(now);
        next.setHours(nextHour, 46, 0, 0);
        
        // If we've passed that time or it's too close, add 4 hours
        if (next < now || (nextHour === currentHour && currentMin >= 46)) {
            next.setHours(next.getHours() + 4);
        }
        
        return next;
    }
    
    let nextUpdate = getNextUpdate();
    
    function update() {
        const now = new Date();
        const diff = nextUpdate - now;
        
        if (diff <= 0) {
            nextUpdate = getNextUpdate();
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        
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
    return str.replace(/[&<>"']/g, function(m) { return ({'&':'&','<':'<','>':'>','"':'"',"'":"'"})[m]; });
}

// Submit comment handler
async function handleCommentSubmit(e) {
    e.preventDefault();
    const form = e.target;
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
        showToast('Thanks! Comment pending review 💬', form);
    } catch (e) {
        console.error('Comment submit error:', e);
        showToast('Couldn\'t post — try again?', form);
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