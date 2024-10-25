// h/t https://github.com/niemal/seo-auto-index/blob/main/src/google.ts for implementation

import google from "googleapis";

export default async function publishUpdatedToGoogle(
  url: string,
  clientEmail: string,
  privateKey: string
) {
  if (!clientEmail || !privateKey) {
    throw new Error("Missing Google credentials from .env file.");
  }

  const jwtClient = new google.Auth.JWT(
    clientEmail,
    undefined,
    privateKey.replace(/(\\|\\\\)n/g, "\n"),
    ["https://www.googleapis.com/auth/indexing"],
    undefined
  );

  const tokens = await jwtClient.authorize();
  const options = {
    url: "https://indexing.googleapis.com/v3/urlNotifications:publish",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    auth: { bearer: tokens.access_token ?? "" },
    json: {
      url: url,
      type: "URL_UPDATED",
    },
  };

  const resp = await fetch(options.url, {
    method: options.method,
    headers: options.headers,
    body: JSON.stringify(options.json),
  });

  const body = await resp.json();

  if (resp.status !== 200) {
    console.error(
      `[${new Date().toISOString()}] [${url}] Failed to push to google. Status: ${resp.status}. Body: ${JSON.stringify(
        body
      )}`
    );
    return false;
  } else {
    console.log(
      `[${new Date().toISOString()}] [${url}] Successfully pushed to google. Status: ${resp.status}. Body: ${JSON.stringify(
        body
      )}`
    );
    return true;
  }
}