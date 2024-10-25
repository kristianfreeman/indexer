-- Migration number: 0001 	 2024-10-25T15:19:42.315Z

DROP TABLE IF EXISTS sites;
DROP TABLE IF EXISTS urls;
DROP INDEX IF EXISTS idx_urls_site_id;
DROP INDEX IF EXISTS idx_urls_last_index_submitted;

CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sitemap_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  last_index_submitted TIMESTAMP
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id)
);  

CREATE INDEX idx_urls_site_id ON urls(site_id);
CREATE INDEX idx_urls_last_index_submitted ON urls(last_index_submitted);