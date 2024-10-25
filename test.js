import * as cheerio from 'cheerio';

let allUrls = new Set()

const parseSitemap = async (sitemapUrl) => {
  const resp = await fetch(sitemapUrl);
  console.log(`Fetched ${sitemapUrl}: ${resp.status}`);

  if (resp.status !== 200) return;

  const sitemap = await resp.text();
  const $ = cheerio.load(sitemap);
  const urls = $('loc').map((i, el) => $(el).text()).get();
  if (!urls) return;
  console.log(`Found ${urls.length} URLs in sitemap`);

  for (let url of urls) {
    console.log(`Found URL: ${url}`);
    if (url.endsWith('.xml')) {
      console.log(`Found sitemap: ${url}`);
      const sitemapUrl = new URL(url);
      console.log("Starting inner sitemap parse");
      await parseSitemap(sitemapUrl.href);
    } else {
      const validatedUrl = new URL(url);
      allUrls.add(validatedUrl.href)
    }
  }
}

async function main() {
  const site = {
    name: 'kristianfreeman.com',
    sitemap_url: 'https://kristianfreeman.com/sitemap-index.xml',
  }

  console.log(`Adding URLs for ${site.name}`);
  await parseSitemap(site.sitemap_url);
  console.log(`Found ${allUrls.length} URLs for ${site.name}`);
}

main()