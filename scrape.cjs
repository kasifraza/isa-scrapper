const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://old.isa.int/medias';
const OUTPUT = path.join(__dirname, 'isa_media_data.json');
const SCROLL_DELAY = 2000;
const MAX_SCROLLS = 100;

const TABS = [
  { param: 'press_release', label: 'Press Releases', containerId: 'press-release', type: 'cards' },
  { param: 'media_coverage', label: 'Media Coverage', containerId: 'media-coverage', type: 'cards' },
  { param: 'newsletter', label: 'Newsletters', containerId: 'newsletter', type: 'newsletters' },
];

// Initialize JSON file
fs.writeFileSync(OUTPUT, '[\n', 'utf8');
let firstItemWritten = false;

function appendToJson(item) {
  const prefix = firstItemWritten ? ',\n' : '';
  fs.appendFileSync(OUTPUT, prefix + JSON.stringify(item, null, 2), 'utf8');
  firstItemWritten = true;
}

function finalizeJson() {
  fs.appendFileSync(OUTPUT, '\n]', 'utf8');
  console.log(`\n✅ Data written to ${OUTPUT}`);
}

async function waitForContainerVisible(page, containerId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const visible = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && el.querySelectorAll('a[href], .card').length > 0;
    }, containerId);
    if (visible) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function extractItems(page, tabType) {
  return page.evaluate((type) => {
    const items = [];
    
    if (type === 'cards') {
      const containers = ['press-release', 'media-coverage'];
      let cards = [];
      for (const id of containers) {
        const el = document.getElementById(id);
        if (el && window.getComputedStyle(el).display !== 'none') {
          cards = el.querySelectorAll('.card');
          break;
        }
      }
      
      cards.forEach((card) => {
        const link = card.querySelector('a');
        const img = card.querySelector('img');
        const dateEl = card.querySelector('.date-text');
        const titleEl = card.querySelector('.card-text p, .card-text');
        if (!link) return;
        
        let title = '';
        if (titleEl) {
          const p = titleEl.querySelector('p');
          title = p ? p.textContent.trim() : titleEl.textContent.trim();
        } else {
          title = link.textContent.trim();
        }
        // Clean up whitespace
        title = title.replace(/\s+/g, ' ').trim();
        
        items.push({
          title,
          url: link.href,
          date: dateEl ? dateEl.textContent.trim() : '',
          imgSrc: img ? img.src : ''
        });
      });
    } else if (type === 'newsletters') {
      const nl = document.getElementById('newsletter');
      if (!nl) return items;
      
      // Newsletter structure:
      // .card-pdf > .pdf-icon > a[href]+ p
      const cardPdfs = nl.querySelectorAll('.card-pdf');
      cardPdfs.forEach((card) => {
        const link = card.querySelector('a[href*=".pdf"]');
        const titlePara = card.querySelector('p');
        if (!link) return;
        
        const title = titlePara ? titlePara.textContent.trim().replace(/\s+/g, ' ') : '';
        const img = link.querySelector('img');
        
        items.push({
          title,
          url: link.href,
          date: '',
          imgSrc: img ? img.src : ''
        });
      });
      
      // Fallback for any extra PDF links not in .card-pdf
      if (cardPdfs.length === 0) {
        const pdfLinks = nl.querySelectorAll('a[href*=".pdf"]');
        const seenUrls = new Set();
        pdfLinks.forEach((link) => {
          if (seenUrls.has(link.href)) return;
          seenUrls.add(link.href);
          const grandParent = link.parentElement?.parentElement;
          const titlePara = grandParent ? grandParent.querySelector('p') : null;
          const title = titlePara ? titlePara.textContent.trim().replace(/\s+/g, ' ') : '';
          const img = link.querySelector('img');
          items.push({ title, url: link.href, date: '', imgSrc: img ? img.src : '' });
        });
      }
    }
    
    return items;
  }, tabType);
}

async function scrapeTab(page, tab) {
  console.log(`\n========== Scraping: ${tab.label} ==========`);
  
  // Click the tab
  await page.evaluate((param) => {
    const tabs = document.querySelectorAll('a[onclick*="media_data"]');
    for (const t of tabs) {
      if (t.getAttribute('onclick')?.includes(`'${param}'`)) {
        t.click();
        return;
      }
    }
    const idx = ['press_release', 'media_coverage', 'newsletter'];
    const i = idx.indexOf(param);
    if (i >= 0 && tabs[i]) tabs[i].click();
  }, tab.param);
  
  await page.waitForTimeout(2000);
  
  const loaded = await waitForContainerVisible(page, tab.containerId);
  if (!loaded) {
    console.log(`  ⚠️ Container #${tab.containerId} not visible, retrying click...`);
    await page.evaluate((param) => {
      const tabs = document.querySelectorAll('a[onclick*="media_data"]');
      const idx = ['press_release', 'media_coverage', 'newsletter'];
      const i = idx.indexOf(param);
      if (i >= 0 && tabs[i]) tabs[i].click();
    }, tab.param);
    await page.waitForTimeout(3000);
  }
  
  const seenKeys = new Set();
  let totalExtracted = 0;
  let previousCount = 0;
  let noChangeStreak = 0;
  
  for (let scrollRound = 0; scrollRound < MAX_SCROLLS; scrollRound++) {
    const items = await extractItems(page, tab.type);
    
    let newItemsInRound = 0;
    for (const item of items) {
      const key = item.url;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        appendToJson({ tab: tab.label, ...item });
        newItemsInRound++;
        totalExtracted++;
      }
    }
    
    console.log(`  Round ${scrollRound + 1}: ${items.length} items visible, ${newItemsInRound} new, ${totalExtracted} total unique`);
    
    if (items.length === previousCount) {
      noChangeStreak++;
    } else {
      noChangeStreak = 0;
    }
    previousCount = items.length;
    
    if (noChangeStreak >= 3) {
      console.log(`  Stabilized for 3 rounds. Done with ${tab.label}.`);
      break;
    }
    
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(SCROLL_DELAY);
  }
  
  console.log(`✅ ${tab.label}: ${totalExtracted} items scraped`);
  return totalExtracted;
}

async function main() {
  console.log('🚀 Starting ISA Media scraper...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1470, height: 956 } });
  const page = await context.newPage();
  
  console.log(`🌐 Navigating to ${URL}...`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('  Page loaded');
  
  let totalItems = 0;
  
  try {
    for (const tab of TABS) {
      const count = await scrapeTab(page, tab);
      totalItems += count;
    }
    finalizeJson();
    console.log(`\n📊 Total items: ${totalItems}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    finalizeJson();
  } finally {
    await browser.close();
    console.log('  Done');
  }
}

main();
