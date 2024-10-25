-- Migration number: 0002 	 2024-10-25T17:31:28.542Z
CREATE UNIQUE INDEX idx_site_url ON urls(site_id, url);