const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // Launch the browser maximized
  const browser = await chromium.launch({ 
    headless: false, 
    args: ['--start-maximized'] 
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  const url = 'https://old.isa.int/eventss';
  console.log(`Navigating to ${url}...`);
  
  // Wait until the network is mostly idle to ensure the base page is loaded
  await page.goto(url, { waitUntil: 'networkidle' });
  console.log('Waiting an extra 10 seconds for iframes and heavy content...');
  await page.waitForTimeout(10000); 

  const tabsToScrape = ['Upcoming Events', 'Past Events', 'ISA Webinars'];

  for (const tabName of tabsToScrape) {
    console.log(`\n======================================`);
    console.log(`Processing tab: ${tabName}`);
    console.log(`======================================`);

    try {
      // Click the specific tab
      const tabLocator = page.getByText(tabName, { exact: true }).first();
      await tabLocator.click();

      // Wait for the active tab content to switch/render
      await page.waitForTimeout(4000);

      // Scroll a few times to ensure any lazy-loaded iframes/images trigger
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(500);
      }

      // Scrape ALL data using the exact DOM structure
      const scrapedData = await page.evaluate(() => {
        const events = [];
        const cards = document.querySelectorAll('.blog-card');

        cards.forEach(card => {
          const dateText = card.querySelector('h1')?.innerText.trim() || '';

          if (!dateText || dateText.toLowerCase().includes('data not found')) {
            return; 
          }

          const titleText = card.querySelector('h2')?.innerText.trim() || 'No title';
          const locationText = card.querySelector('p')?.innerText.trim() || 'No location';

          const linkElement = card.querySelector('a');
          const pageLink = linkElement ? linkElement.getAttribute('href') : null;

          let imageUrl = null;
          const photoElement = card.querySelector('.photo');
          if (photoElement && photoElement.style.backgroundImage) {
            const bgImage = photoElement.style.backgroundImage;
            imageUrl = bgImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
          }

          let videoUrl = null;
          const iframeElement = card.querySelector('iframe');
          if (iframeElement) {
            videoUrl = iframeElement.getAttribute('src');
          }

          if (titleText !== 'No title') {
            events.push({
              title: titleText,
              date: dateText,
              location: locationText,
              link: pageLink,
              image: imageUrl,
              video: videoUrl
            });
          }
        });

        const uniqueEventsMap = new Map();
        events.forEach(event => {
            uniqueEventsMap.set(event.title + '_' + event.date, event);
        });
        
        return Array.from(uniqueEventsMap.values());
      });

      console.log(`Found ${scrapedData.length} events on the main page. Now fetching detail pages...`);

      // Open a second tab for the detail pages
      const detailPage = await context.newPage();

      for (let i = 0; i < scrapedData.length; i++) {
        const event = scrapedData[i];
        event.viewCtaLink = null; 

        if (event.link) {
          try {
            console.log(`  [${i + 1}/${scrapedData.length}] Checking details for: ${event.title.substring(0, 40)}...`);
            
            await detailPage.goto(event.link, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // 1. Scroll down slightly to simulate human behavior and trigger lazy loading
            await detailPage.mouse.wheel(0, 800);

            // 2. Add the 5-second delay to prevent server blocking/rate-limiting
            console.log('    --> Waiting 5 seconds before scraping the detail page...');
            await detailPage.waitForTimeout(5000);

            // Look for the specific CTA button
            const ctaLocator = detailPage.locator('.cta-side-bar a.cta-btn');
            
            // If the element exists, grab its href
            if (await ctaLocator.count() > 0) {
              event.viewCtaLink = await ctaLocator.first().getAttribute('href');
            }
          } catch (err) {
            console.error(`  --> Failed to load detail page for ${event.link}:`, err.message);
          }
        }
      }
      
      // Close the secondary tab when done with this category
      await detailPage.close();

      // Format the filename
      const fileName = `${tabName.replace(/\s+/g, '_').toLowerCase()}.json`;

      // Write to JSON
      fs.writeFileSync(fileName, JSON.stringify(scrapedData, null, 2), 'utf-8');
      console.log(`\nSuccessfully saved ${scrapedData.length} fully enriched events to ${fileName}`);

    } catch (error) {
      console.error(`Failed to process tab "${tabName}":`, error.message);
    }
  }

  console.log('\nScraping complete. Closing browser.');
  await browser.close();
})();