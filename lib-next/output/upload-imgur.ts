import { ImgurClient } from "imgur";
import { base64 } from "./buffer-encoding";

function getImgurConfig(): {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
} {
  const clientId = process.env.IMGUR_CLIENT_ID ?? "cd66e7c46e15b4e";
  const clientSecret = process.env.IMGUR_CLIENT_SECRET ?? "14a6adf67597a7b2db5e535a09c24843470fc70b";
  const accessToken = process.env.IMGUR_ACCESS_TOKEN ?? "ad06eacb7c7228d8f482d2db20f490d649f58e52";
  const refreshToken = process.env.IMGUR_REFRESH_TOKEN ?? "57fd64eeca315fcd25584fbbde91950bf17a7f5e";

  if (!clientId || !clientSecret || !accessToken || !refreshToken) {
    throw new Error(
      "url(): set IMGUR_CLIENT_ID, IMGUR_CLIENT_SECRET, IMGUR_ACCESS_TOKEN, and IMGUR_REFRESH_TOKEN (Imgur API credentials are no longer embedded in the library)."
    );
  }

  return { clientId, clientSecret, accessToken, refreshToken };
}

/** Uploads a PNG buffer to Imgur and returns the public link. Requires Imgur env vars. */
export async function url(buffer: Buffer): Promise<string> {
  const creds = getImgurConfig();
  const client = new ImgurClient(creds);

  const response = await client.upload({
    image: base64(buffer),
    type: "base64",
  });

  return response.data.link;
}
