import * as cheerio from 'cheerio';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth'
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import publishUpdatedToGoogle from './google';

type Site = {
  id: number;
  name: string;
  sitemap_url: string;
  created_at: string;
  updated_at: string;
};

type URL = {
  id: number;
  site_id: number;
  url: string;
  last_index_submitted: string;
  created_at: string;
  updated_at: string;
};

type Env = {
  AUTH_TOKEN: string;
  DATABASE: D1Database;
  GOOGLE_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  INDEXING_WORKFLOW: Workflow;
};

export class IndexingWorkflow extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sites = await step.do('get all sites', async () => {
      console.log('Getting all sites');
      const resp = await this.env.DATABASE.prepare("select * from sites").all()
      return resp.results as Site[]
    });

    await Promise.all(sites.map(async site => {
      console.log(`Checking ${site.name}`);

      if (site.updated_at < oneDayAgo.toISOString()) {
        return;
      }

      const urls = await step.do(`find URLs for ${site.name}`, async () => {
        console.log(`Adding URLs for ${site.name}`);
        let allUrls: string[] = []

        const parseSitemap = async (sitemapUrl: string) => {
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
              console.log(`Found URL: ${url}`);
              const validatedUrl = new URL(url);
              allUrls.push(validatedUrl.href)
            }
          }
        }

        await parseSitemap(site.sitemap_url);

        console.log(`Found ${allUrls.length} URLs for ${site.name}`);
        return allUrls;
      })

      for (let url of urls) {
        step.do(`upsert ${site.name} ${url}`, async () => {
          const validatedUrl = new URL(url);

          const query = `
          insert into urls (site_id, url) values (?, ?)
          on conflict (site_id, url) do nothing
          `

          await this.env.DATABASE
            .prepare(query)
            .bind(site.id, validatedUrl.href)
            .run();
        })
      }
    }))

    const urls = await step.do('get 100 URLs to index', async () => {
      // Get 100 URLs that haven't been indexed in the last 24 hours
      // Since this runs every 10 min, it will work through
      // 100 * (1440 min / 10 min) = 14440 URLs
      // You can tweak these parameters if you have more URLs
      const query = `
        select * from urls
        order by updated_at desc
        limit 100
        where last_index_submitted < ?
      `

      const resp = await this.env.DATABASE
        .prepare(query)
        .bind(oneDayAgo.toISOString())
        .all()

      console.log(`Found ${resp.results.length} URLs to index`);
      return resp.results as URL[]
    });

    urls.forEach(url => {
      if (url.last_index_submitted < oneDayAgo.toISOString()) {
        return;
      }

      step.do(`index ${url.url}`, async () => {
        console.log(`Indexing ${url.url}`);
        const success = await publishUpdatedToGoogle(
          url.url,
          this.env.GOOGLE_EMAIL,
          this.env.GOOGLE_PRIVATE_KEY
        );

        if (success) {
          const query = `
          update urls set last_index_submitted = ? where id = ?
          `
          await this.env.DATABASE
            .prepare(query)
            .bind(new Date().toISOString(), url.id)
            .run()
          console.log(`Successfully indexed ${url.url}`);
        } else {
          console.error(`Failed to index ${url.url}`);
        }
      })
    })
  }
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', bearerAuth({
  verifyToken: async (token: string, c) => {
    return token === c.env.AUTH_TOKEN;
  }
}));

app.get('/sites', async c => {
  try {
    const sites = await c.env.DATABASE
      .prepare("select * from sites")
      .all()
    return c.json(sites.results as Site[])
  } catch (err: any) {
    return c.text(err.toString())
  }
});

app.get('/urls', async c => {
  const urls = await c.env.DATABASE.prepare("select * from urls").all()
  return c.json(urls.results as URL[])
});

app.post('/', async c => {
  let instance = await c.env.INDEXING_WORKFLOW.create();
  return c.json({
    id: instance.id,
    details: await instance.status(),
  });
})

app.get('/:id', async (c) => {
  const id = c.req.param('id')

  if (id) {
    const instance = await c.env.INDEXING_WORKFLOW.get(id)
    return c.json({
      id: instance.id,
      details: await instance.status(),
    })
  } else {
    c.json({}, 404)
  }
});

const scheduled = (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
  ctx.waitUntil(env.INDEXING_WORKFLOW.create())
}

export default {
  fetch: app.fetch,
  scheduled: scheduled
};
