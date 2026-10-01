import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  getChromeViewportGeometry,
  physicalClick,
  CURSOR_SPEEDS,
  ensureAppActive,
} from './lib/cua-physical-controller.mjs';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load env
for (const p of ['.env.local', '.env']) {
  if (fs.existsSync(p)) {
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = l.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=');
        if (!process.env[k.trim()]) process.env[k.trim()] = rest.join('=').trim().replace(/^['\"]|['\"]$/g, '');
      }
    }
  }
}

const TARGET_ARTICLE = 'Dolphin';

const SEMANTIC_KEYWORDS = [
  'dolphin', 'cetacea', 'odontoceti', 'whale', 'porpoise', 'marine mammal',
  'mammal', 'marine biology', 'ocean', 'sea', 'aquatic animal', 'vertebrate',
  'animal', 'chordate', 'zoology', 'wildlife', 'fauna', 'carnivore',
  'biology', 'life science', 'organism', 'evolution', 'ecology', 'ecosystem',
  'earth', 'nature', 'natural science', 'science',
];

function scoreArticle(title) {
  const lower = title.toLowerCase();
  if (lower === 'dolphin') return 1000;
  if (lower.includes('dolphin')) return 900;
  if (lower === 'cetacea' || lower.includes('whale') || lower === 'odontoceti') return 800;
  if (lower === 'mammal' || lower === 'marine mammal' || lower === 'marine biology') return 700;
  if (lower === 'animal' || lower === 'aquatic animal' || lower === 'ocean') return 600;
  if (lower === 'vertebrate' || lower === 'chordate' || lower === 'zoology') return 500;
  if (lower === 'biology' || lower === 'organism' || lower === 'life') return 400;
  if (lower === 'evolution' || lower === 'ecology' || lower === 'earth') return 300;
  if (lower === 'science' || lower === 'natural science' || lower === 'nature') return 200;

  for (let i = 0; i < SEMANTIC_KEYWORDS.length; i++) {
    if (lower.includes(SEMANTIC_KEYWORDS[i])) {
      return 100 - i;
    }
  }
  return 0;
}

function getPageLinks() {
  const js = `(function() {
    const list = [];
    const set = new Set();
    const prefix = 'https://en.wikipedia.org/wiki/';
    for (const a of document.querySelectorAll('.mw-parser-output a')) {
        const href = a.href || '';
        if (href.startsWith(prefix)) {
            const slug = href.slice(prefix.length);
            if (!slug.includes(':') && !slug.includes('#') && !slug.includes('?')) {
                const text = (a.innerText || '').trim();
                const art = decodeURIComponent(slug).replace(/_/g, ' ');
                if (text.length > 1 && !text.toLowerCase().includes('edit') && !set.has(art)) {
                    set.add(art);
                    list.push({ text, art, href });
                }
            }
        }
    }
    return JSON.stringify({
        url: location.href,
        title: document.title,
        links: list
    });
})()`;

  const raw = execFileSync('osascript', ['-e', 'tell application "Google Chrome" to tell active tab of front window to return execute javascript "' + js.replace(/"/g, '\\"') + '"'], { encoding: 'utf8' });
  return JSON.parse(raw);
}

async function askJevChoice(currentPage, candidateArticles) {
  const criteria = {};
  for (const art of candidateArticles) {
    criteria[art] = `Article about ${art}. Assess proximity to target topic: Dolphin (marine mammal, cetacean, aquatic life).`;
  }

  const start = performance.now();
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jev-latest',
      state: {
        current_article: currentPage,
        target_goal: 'Reach Wikipedia article "Dolphin"',
      },
      questions: {
        next_step: {
          type: 'choice',
          instructions: 'Choose the single link that moves closest toward biology, ocean life, or dolphins.',
          criteria,
        },
      },
    }),
  });

  const latencyMs = Math.round(performance.now() - start);
  const data = await res.json();
  const choice = data?.answers?.next_step?.choice;
  const confidence = data?.answers?.next_step?.confidence || 0;
  return { choice, confidence, latencyMs };
}

async function clickLinkOnPage(articleTitle) {
  const js = `(function() {
    const targetSlug = encodeURIComponent('${articleTitle.replace(/'/g, "\\'")}').replace(/%20/g, '_');
    const a = Array.from(document.querySelectorAll('.mw-parser-output a'))
        .find(el => {
            const h = el.getAttribute('href') || '';
            return h.includes('/wiki/' + targetSlug) || el.innerText.trim().toLowerCase() === '${articleTitle.toLowerCase()}';
        });
    if (!a) return JSON.stringify({ error: 'not found' });
    a.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = a.getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width/2, y: r.top + r.height/2, text: a.innerText });
})()`;

  const ptRaw = execFileSync('osascript', ['-e', 'tell application "Google Chrome" to tell active tab of front window to return execute javascript "' + js.replace(/"/g, '\\"') + '"'], { encoding: 'utf8' });
  const linkPt = JSON.parse(ptRaw);
  if (linkPt.error) {
    throw new Error(`Link not found on page: ${articleTitle}`);
  }

  const geom = getChromeViewportGeometry();
  const desktopPt = geom.toDesktopPixels(linkPt.x, linkPt.y);

  await physicalClick(desktopPt.x, desktopPt.y, { speed: CURSOR_SPEEDS.normal });
}

async function runWikipediaLinkGame() {
  console.log('====================================================');
  console.log('=== Starting Wikipedia Link Game: Rocket -> Dolphin ===');
  console.log('====================================================\n');

  ensureAppActive('Google Chrome');
  await sleep(300);

  const startInfo = getPageLinks();
  console.log(`Starting Page: "${startInfo.title}" (${startInfo.url})`);

  let currentTitle = startInfo.title;
  let currentUrl = startInfo.url;
  const history = [{ hop: 0, title: currentTitle, url: currentUrl, action: 'START' }];
  let hopCount = 0;
  const maxHops = 10;
  const startTime = performance.now();

  while (hopCount < maxHops) {
    if (currentTitle.toLowerCase().includes('dolphin') || currentUrl.toLowerCase().includes('/wiki/dolphin')) {
      console.log('\n🎯 TARGET REACHED! Successfully landed on Dolphin page!');
      break;
    }

    hopCount++;
    console.log(`\n--- [Hop ${hopCount}] Current: "${currentTitle}" ---`);

    const pageData = getPageLinks();
    const links = pageData.links;
    console.log(`Extracted ${links.length} content links.`);

    // 1. Direct Target Check
    const directDolphin = links.find(l => l.art.toLowerCase() === 'dolphin');
    if (directDolphin) {
      console.log(`✨ Direct Dolphin link found on page! Physically clicking: "${directDolphin.art}"`);
      const clickStart = performance.now();
      await clickLinkOnPage(directDolphin.art);
      await sleep(2500);

      const navTime = Math.round(performance.now() - clickStart);
      const after = getPageLinks();
      currentTitle = after.title;
      currentUrl = after.url;
      history.push({ hop: hopCount, link: directDolphin.art, navTime, title: currentTitle, url: currentUrl });
      console.log(`Landed on: "${currentTitle}" (nav: ${navTime}ms)`);
      break;
    }

    // 2. Rank candidates by semantic score
    const scored = links
      .map(l => ({ ...l, score: scoreArticle(l.art) }))
      .sort((a, b) => b.score - a.score);

    const topCandidates = scored.slice(0, 5);
    console.log('Top Candidates:', topCandidates.map(c => `${c.art} (${c.score})`).join(', '));

    let chosenArticle = topCandidates[0].art;
    let jevLatency = 0;

    // 3. JEV System-1 choice routing
    if (topCandidates.length > 1 && topCandidates[0].score < 800) {
      try {
        const candidateNames = topCandidates.map(c => c.art);
        const jev = await askJevChoice(currentTitle, candidateNames);
        jevLatency = jev.latencyMs;
        if (jev.choice && candidateNames.includes(jev.choice)) {
          chosenArticle = jev.choice;
          console.log(`JEV System-1 Decision: "${chosenArticle}" (conf: ${jev.confidence}, latency: ${jevLatency}ms)`);
        }
      } catch (err) {
        console.warn('JEV fallback to top scored:', err.message);
      }
    }

    // 4. Physical link click
    console.log(`Physically clicking link: "${chosenArticle}"...`);
    const clickStart = performance.now();
    await clickLinkOnPage(chosenArticle);
    await sleep(2500);

    const navTime = Math.round(performance.now() - clickStart);
    const after = getPageLinks();
    currentTitle = after.title;
    currentUrl = after.url;

    history.push({
      hop: hopCount,
      link: chosenArticle,
      jevLatency,
      navTime,
      title: currentTitle,
      url: currentUrl,
    });

    console.log(`-> Landed on: "${currentTitle}" (${currentUrl}) [nav: ${navTime}ms]`);
  }

  const totalDuration = Math.round((performance.now() - startTime) / 1000);
  console.log('\n====================================================');
  console.log('=== Game Summary ===');
  console.log(`Total Hops: ${history.length - 1}`);
  console.log(`Total Elapsed Time: ${totalDuration}s`);
  console.log('Path Traversed:');
  for (const h of history) {
    if (h.hop === 0) {
      console.log(` [0] Start: ${h.title}`);
    } else {
      console.log(` [${h.hop}] -> Clicked "${h.link}" (JEV: ${h.jevLatency || 0}ms, Nav: ${h.navTime}ms) => "${h.title}"`);
    }
  }
  console.log('====================================================');

  fs.writeFileSync('artifacts/wikipedia-game-results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    startPage: history[0].title,
    targetPage: currentTitle,
    hopsCount: history.length - 1,
    totalDurationSeconds: totalDuration,
    history,
  }, null, 2));
}

runWikipediaLinkGame().catch(err => {
  console.error('Wikipedia game failed:', err);
  process.exit(1);
});
