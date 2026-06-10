#!/usr/bin/env node
/**
 * analyze.cjs - Group and analyze scraped ISA media data
 * 
 * Reads isa_media_data.json, produces:
 *   1. grouped_data.json  - multi-dimension grouped data + summary stats
 *   2. Console report     - human-readable analysis output
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'isa_media_data.json');
const OUTPUT = path.join(__dirname, 'grouped_data.json');

// ---------- helpers ----------

function parseYear(dateStr) {
  if (!dateStr) return 'Unknown';
  const m = dateStr.match(/(\d{4})/);
  return m ? m[1] : 'Unknown';
}

function parseMonth(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\w{3})\s/);
  return m ? m[1] : null;
}

function parseMonthYear(dateStr) {
  if (!dateStr) return 'Unknown';
  const m = dateStr.match(/^(\w{3}\s\d{2},\s\d{4})$/);
  return m ? m[1] : null;
}

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------- main ----------

function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const data = raw;

  // ── 1. Per-tab breakdown ──
  const byTab = {};
  data.forEach(d => {
    if (!byTab[d.tab]) byTab[d.tab] = [];
    byTab[d.tab].push(d);
  });

  const tabSummary = Object.fromEntries(
    Object.entries(byTab).map(([tab, items]) => [tab, {
      count: items.length,
      withDate: items.filter(i => i.date).length,
      sampleUrls: items.slice(0, 3).map(i => i.url)
    }])
  );

  // ── 2. By year ──
  const byYear = {};
  data.forEach(d => {
    const y = parseYear(d.date);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(d);
  });
  const yearCounts = Object.fromEntries(
    Object.entries(byYear)
      .filter(([y]) => y !== '1970' && y !== 'Unknown')
      .map(([y, items]) => [y, items.length])
  );

  // Also track 1970/unparseable separately
  const unparseableCount = (byYear['1970'] || []).length;
  const unknownCount = (byYear['Unknown'] || []).length;

  // ── 3. By month (across all years) ──
  const byMonth = {};
  data.forEach(d => {
    const m = parseMonth(d.date);
    if (m) {
      if (!byMonth[m]) byMonth[m] = 0;
      byMonth[m]++;
    }
  });
  const monthSorted = MONTH_ORDER.map(m => [m, byMonth[m] || 0]);

  // ── 4. By month-year (date strings from page) ──
  const byMonthYear = {};
  data.forEach(d => {
    const my = parseMonthYear(d.date);
    if (my && !my.includes('1970')) {
      if (!byMonthYear[my]) byMonthYear[my] = [];
      byMonthYear[my].push(d);
    }
  });
  const monthYearCounts = Object.fromEntries(
    Object.entries(byMonthYear).map(([my, items]) => [my, items.length])
  );

  // ── 5. Media coverage: top domains ──
  const domainCount = {};
  data.filter(d => d.tab === 'Media Coverage').forEach(d => {
    try {
      const host = new URL(d.url).hostname;
      domainCount[host] = (domainCount[host] || 0) + 1;
    } catch { /* skip */ }
  });
  const topDomains = Object.entries(domainCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([d, c]) => ({ domain: d, count: c }));

  // ── 6. Coverage by country/region (via domain TLD heuristics) ──
  const regionMap = {
    'india': ['economictimes.indiatimes.com','energy.economictimes.indiatimes.com','www.livemint.com',
      'www.thehindubusinessline.com','www.hindustantimes.com','www.business-standard.com',
      'timesofindia.indiatimes.com','indianexpress.com','www.saurenergy.com',
      'www.energetica-india.net','www.aninews.in','www.businessworld.in',
      'government.economictimes.indiatimes.com','www.cnbctv18.com','www.republicworld.com',
      'www.daijiworld.com','solarquarter.com','renewablewatch.in','www.energywatch.in',
      'www.pv-magazine-india.com','sundayguardianlive.com','thedailyguardian.com',
      'www.climateandcapitalmedia.com','powerline.net.in','www.opis.com'],
    'global-news': ['apnews.com','www.bloomberg.com','www.newsweek.com','www.abc.es',
      'www.euronews.com','es.euronews.com','fr.euronews.com','pt.euronews.com',
      'www.aljazeera.net','www.infobae.com','www.eldiario.es','www.milenio.com',
      'www.plenglish.com','www.prensa-latina.cu'],
    'bangladesh': ['www.bssnews.net','www.tbsnews.net','unb.com.bd','www.dhakapost.com','bnngpt.com'],
    'ghana': ['ghanaiantimes.com.gh','atinkaonline.com','onlinetimesgh.com','mobile.ghanaweb.com',
      'www.africanewsgh.net','thebftonline.com','www.africa-press.net'],
    'sri-lanka': ['www.sundayobserver.lk','corpcom.lk','www.ft.lk','www.newswire.lk','www.dailymirror.lk'],
    'ethiopia': ['capitalethiopia.com','www.ena.et','www.fanabc.com'],
    'fiji': ['edition.fijitimes.com.fj','www.fbcnews.com.fj'],
    'guyana': ['www.stabroeknews.com','guyanachronicle.com'],
    'portugal': ['cnnportugal.iol.pt','ovilaverdense.pt'],
    'azerbaijan': ['news.az','dareakogun.com','hicginewsagency.com','azertag.az'],
    'egypt': ['www.sis.gov.eg'],
    'france': ['www.agenceecofin.com','ecomnewsafrique.com','www.afrik21.africa',
      'zoom-eco.net','www.radiookapi.net','nouvelles-dujour.com','mbote.cd',
      'lobservateur.info','www.temoignages.re','congoprofond.net','fnh.ma',
      'www.medefinternational.fr'],
    'dominican-republic': ['hoy.com.do'],
    'china': ['www.china.org.cn','j.eastday.com'],
    'jamaica': ['www.jamaicaobserver.com','antiguaobserver.com'],
    'bangladesh': ['www.bssnews.net','www.tbsnews.net','unb.com.bd','www.dhakapost.com','bnngpt.com'],
    'turkiye': ['www.yenisafak.com'],
    'syria': ['www.syriahr.com'],
    'djibouti': ['www.adi.dj'],
    'spain': ['www.elnortedecastilla.es','www.solarnews.es','mundostartups.com','www.abc.es'],
    'uruguay': ['www.elpais.com.uy'],
  };

  const regionCounts = {};
  Object.entries(regionMap).forEach(([region, domains]) => {
    regionCounts[region] = domains.reduce((sum, d) => sum + (domainCount[d] || 0), 0);
  });
  // remaining domains go to "other"
  const mappedDomains = new Set(Object.values(regionMap).flat());
  const otherCount = Object.entries(domainCount)
    .filter(([d]) => !mappedDomains.has(d))
    .reduce((sum, [, c]) => sum + c, 0);
  regionCounts['other'] = otherCount;

  const topRegions = Object.entries(regionCounts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => ({ region: r.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), count: c }));

  // ── 7. Date quality assessment ──
  const datesQuality = {
    validDates: data.filter(d => d.date && !d.date.includes('1970') && d.date !== 'Invalid Date').length,
    unparseable: unparseableCount + unknownCount,
    noDate: data.filter(d => !d.date).length,
    renderingErrors: data.filter(d => d.title.includes('Invalid Date')).length
  };

  // ── Build grouped output ──
  const grouped = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'https://old.isa.int/medias',
      totalItems: data.length,
      scrapeDate: '2026-06-11'
    },
    summary: {
      totalItems: data.length,
      tabs: tabSummary,
      dateQuality: datesQuality
    },
    breakdowns: {
      byTab: Object.fromEntries(
        Object.entries(byTab).map(([tab, items]) => [
          tab,
          {
            count: items.length,
            items: items.map(({ tab: _, ...rest }) => rest)
          }
        ])
      ),
      byYear: yearCounts,
      byMonth: Object.fromEntries(monthSorted),
      byMonthYear: Object.keys(monthYearCounts).length > 0 ? monthYearCounts : undefined
    },
    mediaCoverageAnalysis: {
      totalSources: Object.keys(domainCount).length,
      topDomains: topDomains,
      byRegion: topRegions
    }
  };

  // Write grouped JSON
  fs.writeFileSync(OUTPUT, JSON.stringify(grouped, null, 2), 'utf8');
  console.log(`✅ Grouped data written to ${OUTPUT}\n`);

  // ── Console Report ──
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     ISA Media Data — Analysis Report         ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nTotal items scraped: ${data.length}`);
  console.log(`Source: https://old.isa.int/medias`);

  console.log(`\n── Breakdown by tab ──`);
  Object.entries(tabSummary).forEach(([tab, s]) => {
    console.log(`  ${tab.padEnd(20)} ${String(s.count).padStart(4)} items`);
  });

  console.log(`\n── Breakdown by year (valid dates) ──`);
  Object.entries(yearCounts)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .forEach(([year, count]) => {
      console.log(`  ${year.padEnd(6)} ${String(count).padStart(4)} items`);
    });

  console.log(`\n── Media Coverage: Top 10 Sources ──`);
  topDomains.slice(0, 10).forEach(({ domain, count }) => {
    console.log(`  ${domain.padEnd(45)} ${String(count).padStart(3)} articles`);
  });

  console.log(`\n── Media Coverage: By Region ──`);
  topRegions.slice(0, 10).forEach(({ region, count }) => {
    console.log(`  ${region.padEnd(20)} ${String(count).padStart(3)} mentions`);
  });

  console.log(`\n── Date Quality ──`);
  console.log(`  Valid dates:        ${datesQuality.validDates}`);
  console.log(`  Unparseable dates:  ${datesQuality.unparseable}`);
  console.log(`  No date (nl):       ${datesQuality.noDate}`);
  console.log(`  Rendering errors:   ${datesQuality.renderingErrors}`);

  console.log(`\n📦 Output files:`);
  console.log(`  1. ${INPUT}       (raw scraped data)`);
  console.log(`  2. ${OUTPUT}  (grouped + analysis)`);
  console.log('');
}

main();
