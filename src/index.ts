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

    sites.forEach(site => {
      console.log(`Checking ${site.name}`);
      if (site.updated_at < oneDayAgo.toISOString()) {
        return;
      }

      step.do(`add URLs for ${site.name}`, async () => {
        console.log(`Adding URLs for ${site.name}`);
        let allUrls: string[] = []

        const parseSitemap = async (sitemapUrl: string) => {
          const resp = await fetch(sitemapUrl);
          console.log(`Fetched ${sitemapUrl}`);
          if (resp.status !== 200) return;

          const sitemap = await resp.text();

          const urls = sitemap.match(/<loc>(.*)<\/loc>/g);
          if (!urls) return;

          for (let url of urls) {
            if (url.endsWith('.xml')) {
              const sitemapUrl = new URL(url);
              await parseSitemap(sitemapUrl.href);
            } else {
              const validatedUrl = new URL(url);
              allUrls.push(validatedUrl.href)
            }
          }
        }

        await parseSitemap(site.sitemap_url);

        console.log(`Found ${allUrls.length} URLs for ${site.name}`);

        for (let url of allUrls) {
          const validatedUrl = new URL(url);

          const query = `
          insert into urls (site_id, url) values (?, ?)
          on conflict (site_id, url) do nothing
          `

          await this.env.DATABASE
            .prepare(query)
            .bind(site.id, validatedUrl.href)
            .run();
        }
      })
    })

    const urls = await step.do('get URLs to index', async () => {
      const resp = await this.env.DATABASE.prepare("select * from urls").all()
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    let url = new URL(req.url);

    if (url.pathname.startsWith('/favicon')) {
      return Response.json({}, { status: 404 });
    }

    const headers = req.headers
    const authHeader = headers.get('Authorization')

    if (authHeader) {
      const [type, token] = authHeader.split(' ')
      if (type !== 'Bearer') {
        return Response.json({}, { status: 401 })
      }

      if (token !== env.AUTH_TOKEN) {
        return Response.json({}, { status: 401 })
      }

      const id = url.searchParams.get('id')

      if (id) {
        const instance = await env.INDEXING_WORKFLOW.get(id)
        return Response.json({
          id: instance.id,
          details: await instance.status(),
        })
      }

      // Spawn a new instance and return the ID and status
      let instance = await env.INDEXING_WORKFLOW.create();
      return Response.json({
        id: instance.id,
        details: await instance.status(),
      });
    } else {
      return Response.json({}, { status: 401 });
    }
  },
};
