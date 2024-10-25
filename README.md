# indexer

This codebase is a proof-of-concept of building large-scale workflows with [Cloudflare Workflows](https://developers.cloudflare.com/workflows/). It's built with [Cloudflare Workers](https://workers.cloudflare.com/), [Cloudflare D1](https://developers.cloudflare.com/d1/), and [Hono](https://honojs.dev/).

By providing a list of sitemaps, this workflow will crawl your site and make indexing requests to Google Search Console (_see the disclaimer below before trying this on your production sites_).

> [!WARNING]  
> This repo is only provided as a reference. [Indexing via this method may lead to penalties from Google!](https://www.searchenginejournal.com/google-adds-spam-warning-to-indexing-api-documentation/526839/)

This project is a proof-of-concept showing workflows. Some docs are available regarding running the project below. That being said, I don't recommend that you run this in production due to Google cracking down on this process.

## Usage

After setup, you can make requests to check various aspects of the workflow:

```sh
# All requests require an auth token
# xh --bearer my-token
$ xh https://<your-domain>.workers.dev/sites # List all sites
$ xh https://<your-domain>.workers.dev/urls  # List all known URLs (and index status)
$ xh POST https://<your-domain>.workers.dev/ # Start the indexing workflow
```

By default, the workflow will run every 10 minutes using a [scheduled trigger](https://developers.cloudflare.com/workers/platform/cron-triggers/).

The workflow will try and index 100 URLs at a time. This means that it will index up to 14,440 URLs each day. This should be enough to cover most sites, but you can adjust the number of URLs or other parameters in the codebase if you have more URLs.

## Setup

### Google Cloud

1. Setup a Google Cloud account
2. Create a new project
3. Enable the Indexing API
4. Create a new service account
5. Create a new JSON key and download it

### Set up application

1. Clone this repository
2. Install dependencies: `npm install`
3. Deploy: `npm run deploy`
4. Create a new D1 database: `npx wrangler d1 create index_db`
5. Update bindings in `wrangler.toml`
6. Provide an auth token: `npx wrangler secret put AUTH_TOKEN`
7. Set up Google env vars


```sh
echo "service-account-email@project-id.iam.gserviceaccount.com" | npx wrangler secret put GOOGLE_EMAIL
cat ~/Downloads/key.json | npx wrangler secret put GOOGLE_PRIVATE_KEY
```

### Set up Google Search Console

1. Create a new Google Search Console account
2. Create a new property
3. Add the service account email as an owner of the property (**this is required!**)
