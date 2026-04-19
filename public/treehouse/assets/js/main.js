// Treehouse JS: Fetch trends from Neon API, fall back to static JSON

// Track current view state
let currentDbId = null; // null = current trends, number = archive ID, 'day' = day view
let currentRunId = null; // The DB ID of the current run for voting
let currentDayArchives = null; // Store archives array when viewing a day

const VOTE_REASON_OPTIONS = {
    up: [
        { reason: 'insightful', label: '🧠 Insightful' },
        { reason: 'useful', label: '🛠️ Useful' },
        { reason: 'hot', label: '🔥 Hot' }
    ],
    down: [
        { reason: 'boring', label: '🥱 Boring' },
        { reason: 'duplicate', label: '🪞 Duplicate' },
        { reason: 'clickbait', label: '🎣 Clickbait' }
    ]
};

let _reasonToastTimer = null;
let _reasonToastHandlerInstalled = false;
const _reasonPrompted = new Set(); // `${runId}|${trendUrl}`

function _hideToast() {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.style.display = 'none';
}

async function setVoteReason({ runId, trendUrl, userToken, reason }) {
    try {
        const res = await fetch('/.netlify/functions/treehouse-votes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_token: userToken,
                run_id: runId,
                trend_url: trendUrl,
                reason
            })
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

function showReasonPrompt({ vote, runId, trendUrl, userToken, anchorEl }) {
    if (!VOTE_REASON_OPTIONS[vote]) return;

    const key = `${runId}|${trendUrl}`;
    if (_reasonPrompted.has(key)) return;
    _reasonPrompted.add(key);

    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;

    if (_reasonToastTimer) {
        clearTimeout(_reasonToastTimer);
        _reasonToastTimer = null;
    }

    const chips = VOTE_REASON_OPTIONS[vote]
        .map(o => `<button type="button" data-reason="${o.reason}" style="border:1px solid rgba(255,255,255,0.25); background:rgba(255,255,255,0.08); color:#fff; padding:6px 10px; border-radius:999px; cursor:pointer; font-weight:600; font-size:13px; margin-right:8px;">${o.label}</button>`)
        .join('');

    msgEl.innerHTML = `
        <span style="font-weight:700; margin-right:10px;">Why?</span>
        <span data-reason-wrap="1" data-vote="${vote}" data-runid="${runId}" data-trendurl="${encodeURIComponent(trendUrl)}" data-usertoken="${encodeURIComponent(userToken)}">${chips}</span>
        <button type="button" data-dismiss="1" title="Dismiss" style="margin-left:6px; border:none; background:transparent; color:rgba(255,255,255,0.75); cursor:pointer; font-size:18px; line-height:1;">×</button>
    `;

    // Allow chips to wrap if needed.
    toast.style.whiteSpace = 'normal';

    if (anchorEl && anchorEl.getBoundingClientRect) {
        const rect = anchorEl.getBoundingClientRect();
        toast.style.left = (rect.left + rect.width / 2) + 'px';
        toast.style.top = (rect.bottom + 10) + 'px';
        toast.style.bottom = 'auto';
        toast.style.transform = 'translateX(-50%)';
    } else {
        toast.style.left = '50%';
        toast.style.top = 'auto';
        toast.style.bottom = '20px';
        toast.style.transform = 'translateX(-50%)';
    }

    toast.style.display = 'block';

    if (!_reasonToastHandlerInstalled) {
        _reasonToastHandlerInstalled = true;
        toast.addEventListener('click', async (e) => {
            const target = e.target;
            if (!target) return;

            const dismissBtn = target.closest && target.closest('[data-dismiss="1"]');
            if (dismissBtn) {
                _hideToast();
                return;
            }

            const btn = target.closest && target.closest('button[data-reason]');
            if (!btn) return;

            const reason = btn.getAttribute('data-reason');
            const wrap = toast.querySelector('[data-reason-wrap="1"]');
            if (!wrap) return;

            const r = wrap.getAttribute('data-runid');
            const url = decodeURIComponent(wrap.getAttribute('data-trendurl') || '');
            const tok = decodeURIComponent(wrap.getAttribute('data-usertoken') || '');

            _hideToast();
            if (!reason || !r || !url || !tok) return;

            const ok = await setVoteReason({ runId: parseInt(r, 10), trendUrl: url, userToken: tok, reason });
            if (ok) {
                showToast('Saved', null, 1200);
            }
        });
    }

    _reasonToastTimer = setTimeout(() => {
        _hideToast();
    }, 4500);
}

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
    currentDbId = null; // Reset to current trends view
    
    try {
        // Try Neon API first
        const apiRes = await fetch('/.netlify/functions/treehouse-api');
        if (apiRes.ok) {
            const data = await apiRes.json();
            // Handle new format with _meta or old format
            const trends = data.trends || data;
            const timestamp = (data._meta && data._meta.generatedAt) || 'Live from DB';
            
            // Store last run time for countdown
            if (data._meta && data._meta.runAt) {
                lastRunTimestamp = data._meta.runAt;
            }

            // Render immediately; hydrate runId/votes afterward to reduce perceived latency.
            displayTrends(trends, timestamp, {});

            // Prefer runId returned by the API; fall back to archives if missing.
            if (data._meta && data._meta.runId) {
                currentRunId = data._meta.runId;
            } else {
                try {
                    await fetchLatestRunId();
                } catch (e) { /* ignore */ }
            }

            // Fetch votes for this specific run in the background and re-render when ready.
            (async () => {
                const { votes, userVotes: uv } = await fetchVotesForRun(currentRunId);
                userVotes = uv || {};
                displayTrends(trends, timestamp, votes || {});
            })().catch(() => {});

            return;
        }
    } catch (e) {
        console.log('API not available, trying static JSON:', e.message);
    }
    
    // Fall back to static JSON
    try {
        const res = await fetch('feeds/trends.json');
        const trends = await res.json();
        displayTrends(trends, new Date().toLocaleString(), {});
    } catch (e) {
        document.getElementById('trend-list').innerHTML = '<li>Trends loading...</li>';
        console.error('Fetch error:', e);
    }
}

// Fetch the latest run ID from archives
async function fetchLatestRunId() {
    try {
        const res = await fetch('/.netlify/functions/treehouse-archives');
        const archives = await res.json();
        if (archives && archives.length > 0) {
            // First entry is the latest
            currentRunId = archives[0].dbId;
            console.log('Current run ID:', currentRunId);
        }
    } catch (e) {
        console.error('Failed to get run ID:', e);
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
        console.log('Rendering trend:', trend.title, 'urlKey:', urlKey, 'votes:', v);
        const userVote = userVotes[urlKey]; // 'up', 'down', or undefined
        
        // Style for voted buttons
        const upStyle = userVote === 'up' ? 'opacity:1; filter:grayscale(0);' : (userVote ? 'opacity:0.3;' : '');
        const downStyle = userVote === 'down' ? 'opacity:1; filter:grayscale(0);' : (userVote ? 'opacity:0.3;' : '');
        
        li.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button type="button" onclick="voteTrend('${encodeURIComponent(trend.url)}', 'up', this)" title="thumbs up" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; ${upStyle}">👍</button>
                    <span style="font-size:0.8em; text-align:center;">${v.up}</span>
                    <button type="button" onclick="voteTrend('${encodeURIComponent(trend.url)}', 'down', this)" title="thumbs down" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; ${downStyle}">👎</button>
                    <span style="font-size:0.8em; text-align:center;">${v.down}</span>
                </div>
                <div>
                    <a href="${trend.url}" class="trend-link" target="_blank">${trend.title}</a> ${source}<br>${description}
                </div>
            </div>
        `;
        list.appendChild(li);
    });
    loadScoutView(trends, votes);
    document.getElementById('last-update').textContent = timestamp;
}

// Fetch votes for a specific run
async function fetchVotesForRun(runId) {
    const userToken = getUserToken();
    console.log('fetchVotesForRun called with runId:', runId);
    if (!runId) {
        console.log('No runId provided for votes');
        return { votes: {}, userVotes: {} };
    }
    try {
        // Add cache-bust param to ensure fresh data
        const cacheBust = Date.now();
        const res = await fetch(`/.netlify/functions/treehouse-votes?user=${encodeURIComponent(userToken)}&run_id=${runId}&_=${cacheBust}`);
        if (!res.ok) return { votes: {}, userVotes: {} };
        const data = await res.json();
        return { votes: data.votes || data, userVotes: data.userVotes || {} };
    } catch (e) {
        console.log('Votes unavailable:', e.message);
        return { votes: {}, userVotes: {} };
    }
}

// Vote on a trend (now uses run_id + URL as identifier)
async function voteTrend(trendUrl, vote, btnElement) {
    if (!trendUrl) {
        console.error('No URL provided for voting');
        return;
    }
    if (!currentRunId) {
        showToast('Cannot vote - no run ID', btnElement);
        return;
    }
    const userToken = getUserToken();
    const decodedUrl = decodeURIComponent(trendUrl);
    console.log('Voting:', decodedUrl, vote, 'run:', currentRunId);
    try {
        const res = await fetch('/.netlify/functions/treehouse-votes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                trend_url: decodedUrl, 
                vote: vote, 
                user_token: userToken,
                run_id: currentRunId
            })
        });
        
        console.log('Vote response:', res.status);

        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Oops! Something went wrong', btnElement);
            return;
        }

        const result = await res.json().catch(() => ({}));
        if (!result.cleared) {
            // Optional: ask for a reason without blocking the UI.
            showReasonPrompt({ vote, runId: currentRunId, trendUrl: decodedUrl, userToken, anchorEl: btnElement });
        }
        
        // Refresh the correct view (current, archive, or day)
        if (currentDbId === 'day' && currentDayArchives) {
            loadDayArchive(currentDayArchives);
        } else if (currentDbId) {
            loadArchive(currentDbId);
        } else {
            fetchTrends();
        }
    } catch (e) {
        console.error('Vote failed:', e);
        showToast('Connection issue — try again?', btnElement);
    }
}

// Show toast notification
function showToast(message, targetEl, duration = 4500) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');

    if (_reasonToastTimer) {
        clearTimeout(_reasonToastTimer);
        _reasonToastTimer = null;
    }

    msgEl.textContent = message;
    
    // Reset styles to default centered position
    toast.style.whiteSpace = 'nowrap';
    
    if (targetEl) {
        // Position near the target element
        const rect = targetEl.getBoundingClientRect();
        toast.style.left = (rect.left + rect.width/2) + 'px';
        toast.style.top = (rect.bottom + 10) + 'px';
        toast.style.bottom = 'auto';
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
function loadScoutView(data, votes = {}) {
    // Scout's View is identified by having a signature field
    const scoutEntry = data.find(item => item.signature && item.signature.includes("Scout"));
    const scoutEl = document.getElementById('scout-comment');
    
    // Use special key for Scout's View voting
    const scoutUrlKey = '__scout_view__';
    const v = votes[scoutUrlKey] || { up: 0, down: 0 };
    const userVote = userVotes[scoutUrlKey];
    
    // Style for voted buttons
    const upStyle = userVote === 'up' ? 'opacity:1; filter:grayscale(0);' : (userVote ? 'opacity:0.3;' : '');
    const downStyle = userVote === 'down' ? 'opacity:1; filter:grayscale(0);' : (userVote ? 'opacity:0.3;' : '');
    
    if (scoutEntry) {
        // If desc already ends with the signature, strip it to avoid duplication
        let desc = scoutEntry.desc || '';
        const sig = scoutEntry.signature || '';
        if (desc.endsWith(sig)) {
            desc = desc.slice(0, -sig.length).trim();
        }
        // Add voting buttons to Scout's View
        scoutEl.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button type="button" onclick="voteScoutView('up', this)" title="thumbs up" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; ${upStyle}">👍</button>
                    <span style="font-size:0.8em; text-align:center;">${v.up}</span>
                    <button type="button" onclick="voteScoutView('down', this)" title="thumbs down" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; ${downStyle}">👎</button>
                    <span style="font-size:0.8em; text-align:center;">${v.down}</span>
                </div>
                <div>
                    ${desc}<br><br><em style="font-size: 0.85em; color: var(--text-light);">${sig}</em>
                </div>
            </div>
        `;
    } else {
        scoutEl.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <button type="button" onclick="voteScoutView('up', this)" title="thumbs up" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; opacity:0.3;">👍</button>
                    <span style="font-size:0.8em; text-align:center;">0</span>
                    <button type="button" onclick="voteScoutView('down', this)" title="thumbs down" style="background:none; border:none; cursor:pointer; padding:0; font-size:1.1em; opacity:0.3;">👎</button>
                    <span style="font-size:0.8em; text-align:center;">0</span>
                </div>
                <div>No Scout's View for this archive.</div>
            </div>
        `;
    }
}

// Vote on Scout's View
async function voteScoutView(vote, btnElement) {
    if (!currentRunId) {
        showToast('Cannot vote - no run ID', btnElement);
        return;
    }
    const userToken = getUserToken();
    const scoutUrlKey = '__scout_view__';
    console.log('Voting on Scout View:', vote, 'run:', currentRunId);
    try {
        const res = await fetch('/.netlify/functions/treehouse-votes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                trend_url: scoutUrlKey, 
                vote: vote, 
                user_token: userToken,
                run_id: currentRunId
            })
        });

        if (!res.ok) {
            const data = await res.json();
            showToast(data.error || 'Oops! Something went wrong', btnElement);
            return;
        }

        const result = await res.json().catch(() => ({}));
        if (!result.cleared) {
            // Optional reason prompt for Scout's View (uses special URL key).
            showReasonPrompt({ vote, runId: currentRunId, trendUrl: scoutUrlKey, userToken, anchorEl: btnElement });
        }
        
        // Refresh the view
        if (currentDbId === 'day' && currentDayArchives) {
            loadDayArchive(currentDayArchives);
        } else if (currentDbId) {
            loadArchive(currentDbId);
        } else {
            fetchTrends();
        }
    } catch (e) {
        console.error('Vote failed:', e);
        showToast('Connection issue — try again?', btnElement);
    }
}

// Load from archive (Neon API)
function loadArchive(dbId) {
    console.log('loadArchive called with dbId:', dbId);
    currentDbId = dbId; // Track that we're viewing an archive
    currentRunId = dbId; // Set the run ID for voting
    console.log('Set currentRunId to:', currentRunId);
    
    fetch(`/.netlify/functions/treehouse-archive?id=${dbId}`)
        .then(res => res.json())
        .then(data => {
            // Handle new format with _meta or old format
            const trends = data.trends || data;
            const timestamp = (data._meta && data._meta.generatedAt) || 'Archive';
            
            // Note: We don't update lastRunTimestamp here - countdown stays fixed to latest run
            console.log('Archive loaded, trends count:', trends.length);
            
            // Get list of URLs from archived trends
            const urls = trends.filter(t => t.url).map(t => t.url);
            console.log('URLs to fetch votes for:', urls);
            
            // Fetch votes for this specific archive run
            fetchVotesForRun(dbId).then(votesResult => {
                console.log('Votes result for archive:', votesResult);
                const votes = votesResult.votes || {};
                // Clear userVotes when loading archive
                userVotes = votesResult.userVotes || {};
                console.log('Displaying with votes:', votes, 'userVotes:', userVotes);
                displayTrends(trends, 'Archive: ' + timestamp, votes);
            });
        })
        .catch(e => {
            console.error('Archive load error:', e);
            document.getElementById('trend-list').innerHTML = '<li>Error loading archive</li>';
        });
}

// Populate archive dropdown from Neon (last 30 runs only)
async function populateArchiveDropdown() {
    try {
        const res = await fetch('/.netlify/functions/treehouse-archives?limit=30');
        const archives = await res.json();
        const select = document.getElementById('archive-select');
        select.innerHTML = '';
        // Show recent 30 records (most recent first)
        archives.forEach((arch, index) => {
            const opt = document.createElement('option');
            opt.value = arch.dbId;
            const label = index === 0 ? arch.label + ' (latest)' : arch.label;
            opt.textContent = label;
            select.appendChild(opt);
        });
        // Set initial run ID to latest
        if (archives.length > 0) {
            currentRunId = archives[0].dbId;
        }
    } catch (e) {
        console.error('Archive index load error:', e);
    }
}

// Handle archive dropdown selection
function handleArchiveSelect(value) {
    if (!value) return;
    // Clear date picker when using dropdown
    document.getElementById('date-picker').value = '';
    loadArchive(value);
}

// Handle date picker selection - load all runs from that day
async function handleDateSelect(dateStr) {
    if (!dateStr) return;
    // Clear dropdown when using date picker
    document.getElementById('archive-select').value = '';
    
    console.log('Loading archives for date:', dateStr);
    
    try {
        const res = await fetch(`/.netlify/functions/treehouse-archives?date=${dateStr}`);
        const archives = await res.json();
        
        if (!archives || archives.length === 0) {
            showToast('No trends found for that date', null);
            return;
        }
        
        console.log('Found archives for date:', archives.length, 'runs');
        
        // Load all runs from this day, one by one
        await loadDayArchive(archives);
        
    } catch (e) {
        console.error('Date load error:', e);
        showToast('Error loading that date', null);
    }
}

// Load all runs from a single day and combine them
async function loadDayArchive(archives) {
    const allTrends = [];
    const timestamps = [];
    
    // Update countdown to use the most recent run from this day
    // (archives are sorted newest first)
    if (archives.length > 0) {
        // We'll update this after we fetch the first archive's data
        // For now, just use the label as a fallback
    }
    
    for (const arch of archives) {
        try {
            const res = await fetch(`/.netlify/functions/treehouse-archive?id=${arch.dbId}`);
            const data = await res.json();
            const trends = data.trends || data;
            const timestamp = data._meta?.generatedAt || arch.label;
            
            timestamps.push(timestamp);
            
            // Add each topic (skip Scout's View, we'll add our own)
            trends.forEach(t => {
                if (!t.signature) {
                    allTrends.push(t);
                }
            });
        } catch (e) {
            console.error('Error loading archive', arch.dbId, e);
        }
    }
    
    if (allTrends.length === 0) {
        document.getElementById('trend-list').innerHTML = '<li>No trends found</li>';
        return;
    }
    
    // Get votes for all URLs from all runs in this day
    const urls = allTrends.filter(t => t.url).map(t => t.url);
    const dayRunIds = archives.map(a => a.dbId);
    
    // Fetch votes for each run separately and combine
    let combinedVotes = {};
    let combinedUserVotes = {};
    
    for (const runId of dayRunIds) {
        const { votes, userVotes: uv } = await fetchVotesForRun(runId);
        Object.assign(combinedVotes, votes);
        Object.assign(combinedUserVotes, uv);
    }
    
    userVotes = combinedUserVotes;
    currentDbId = 'day'; // Mark as day view
    currentDayArchives = archives; // Store for refresh after voting
    currentRunId = dayRunIds[0]; // Use first run for new votes
    
    // Show date range in header
    const dateLabel = archives[0].label.split(',')[0]; // e.g., "Mar 7"
    const timestamp = `${dateLabel} (${archives.length} batches)`;
    
    // Add Scout's View from the most recent run
    try {
        const latestRes = await fetch(`/.netlify/functions/treehouse-archive?id=${archives[0].dbId}`);
        const latestData = await latestRes.json();
        const latestTrends = latestData.trends || latestData;
        const scoutEntry = latestTrends.find(t => t.signature && t.signature.includes("Scout"));
        if (scoutEntry) {
            allTrends.unshift(scoutEntry);
        }
    } catch (e) {
        console.log('Could not load Scout View:', e);
    }
    
    // Build combined data structure
    const combinedData = {
        _meta: { generatedAt: timestamp, runIds: dayRunIds },
        trends: allTrends
    };
    
    displayTrends(combinedData.trends, timestamp, combinedVotes);
    loadScoutView(combinedData.trends, combinedVotes);
    document.getElementById('last-update').textContent = timestamp;
}

// Countdown to next update (runs every 4 hours from last run)
let lastRunTimestamp = null; // Will be set when we fetch trends

// Countdown to next update (set once at page load from latest run, stays constant)
function startCountdown() {
    const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
    
    let nextUpdate = null;
    
    function initCountdown() {
        if (lastRunTimestamp && !nextUpdate) {
            // Use actual last run time + 4 hours (set once at page load)
            const lastRun = new Date(lastRunTimestamp);
            nextUpdate = new Date(lastRun.getTime() + INTERVAL_MS);
        }
    }
    
    function update() {
        // Initialize on first call after lastRunTimestamp is set
        if (!nextUpdate) {
            initCountdown();
        }
        
        if (!nextUpdate) return;
        
        const now = Date.now();
        const diff = nextUpdate - now;
        
        if (diff <= 0) {
            // Past time - just show 0
            const el = document.getElementById('countdown');
            if (el) {
                el.innerHTML = `<span style="color: #ff6b6b; font-weight: bold;">⏱️ 0h 0m 0s</span>`;
            }
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
    
    // Wait a moment for fetchTrends to set lastRunTimestamp
    setTimeout(initCountdown, 500);
    update();
    setInterval(update, 1000);
}

// Auto-load on page load - show current trends by default, not archive
document.addEventListener('DOMContentLoaded', async () => {
    populateArchiveDropdown();
    startCountdown();
    // Load current trends first (not archive)
    fetchTrends();
});
