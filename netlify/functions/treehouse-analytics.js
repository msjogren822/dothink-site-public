// netlify/functions/treehouse-analytics.js
// Analytics for treehouse trends: keywords, sources, stats
const { neon } = require('@netlify/neon');

const sql = neon();

// Common stopwords to filter out
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom',
  'their', 'them', 'your', 'my', 'his', 'her', 'our', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'any', 'as', 'if', 'because', 'while', 'although',
  'after', 'before', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'how', 'get', 'make', 'new', 'one', 'two',
  'says', 'said', 'use', 'using', 'used', 'many', 'much', 'first', 'last', 'like'
]);

function extractKeywords(topics) {
  const wordCount = {};
  
  topics.forEach(topic => {
    if (!topic) return;
    
    // Combine title and summary for keyword extraction
    let text = ((topic.title || '') + ' ' + (topic.summary || topic.desc || '')).toLowerCase();
    
    // Normalize known multi-word phrases before tokenizing
    text = text.replace(/\bless\s+wrong\b/g, 'lesswrong');
    
    // Split on non-alphanumeric chars
    const words = text.split(/[^a-z0-9]+/).filter(w => w.length > 2);
    
    words.forEach(word => {
      if (!STOPWORDS.has(word) && !/^\d+$/.test(word)) {
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    });
  });
  
  return wordCount;
}

exports.handler = async function(event, context) {
  try {
    // Get all topics from all runs
    const rows = await sql`
      SELECT id, created_at, topics, scout_title
      FROM treehouse_trends
      ORDER BY created_at DESC
    `;
    
    // Aggregate stats
    const totalBatches = rows.length;
    let allTopics = [];
    const sourceCount = {};
    let totalUpvotes = 0;
    let totalDownvotes = 0;
    
    rows.forEach(row => {
      const topics = row.topics || [];
      topics.forEach(t => {
        if (t) {
          allTopics.push(t);
          
          // Count sources (normalize name - handle LessWrong variants, The Block, etc.)
          const rawSource = t.source || 'Unknown';
          let source = rawSource.trim();
          // Normalize variations
          const lower = source.toLowerCase().replace(/\s+/g, '');  // strip all spaces first
          if (lower === 'lesswrong') source = 'LessWrong';
          else if (lower === 'theblock') source = 'The Block';
          else if (lower === 'techradar') source = 'TechRadar';
          else if (lower === 'techcrunch') source = 'TechCrunch';
          else source = source.replace(/\b\w/g, c => c.toUpperCase());
          sourceCount[source] = (sourceCount[source] || 0) + 1;
        }
      });
    });
    
    // Extract keywords from all topics
    const keywordCount = extractKeywords(allTopics);
    
    // Sort and take top keywords
    const topKeywords = Object.entries(keywordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }));
    
    // Sort sources by count
    const sourceDistribution = Object.entries(sourceCount)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));
    
    // Get total votes from votes table
    try {
      const voteRows = await sql`SELECT SUM(upvotes) as total_up, SUM(downvotes) as total_down FROM treehouse_trend_votes`;
      if (voteRows.length > 0) {
        totalUpvotes = parseInt(voteRows[0].total_up) || 0;
        totalDownvotes = parseInt(voteRows[0].total_down) || 0;
      }
    } catch (e) {
      console.log('Votes query error:', e.message);
    }
    
    const response = {
      stats: {
        totalBatches,
        totalTopics: allTopics.length,
        totalUpvotes,
        totalDownvotes,
        dateRange: rows.length > 0 ? {
          earliest: rows[rows.length - 1].created_at,
          latest: rows[0].created_at
        } : null
      },
      topKeywords,
      sourceDistribution
    };
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };
    
  } catch (e) {
    console.error('Analytics error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};