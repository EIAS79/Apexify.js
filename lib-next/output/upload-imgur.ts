import { ImgurClient } from "imgur";
import { base64 } from "./buffer-encoding";

export interface ImgurCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

function fromEnvironment(): Partial<ImgurCredentials> {
  return {
    clientId: process.env.IMGUR_CLIENT_ID,
    clientSecret: process.env.IMGUR_CLIENT_SECRET,
    accessToken: process.env.IMGUR_ACCESS_TOKEN,
    refreshToken: process.env.IMGUR_REFRESH_TOKEN,
  };
}

function requireImgurCredentials(explicit?: Partial<ImgurCredentials>): ImgurCredentials {
  const merged = { ...fromEnvironment(), ...explicit };
  const missing = (Object.entries(merged) as Array<[keyof ImgurCredentials, string | undefined]>)
    .filter(([, value]) => typeof value !== "string" || value.length === 0)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `output.url: Imgur credentials are required (${missing.join(", ")}). ` +
        "Pass them explicitly or configure IMGUR_CLIENT_ID, IMGUR_CLIENT_SECRET, " +
        "IMGUR_ACCESS_TOKEN, and IMGUR_REFRESH_TOKEN."
    );
  }

  return merged as ImgurCredentials;
}

/**
 * Upload a PNG buffer to Imgur and return its public link.
 * Credentials may be passed explicitly; environment variables are only a convenience fallback.
 * Apexify.js never contains credential defaults and never logs credential values.
 */
export async function url(
  buffer: Buffer,
  credentials?: Partial<ImgurCredentials>
): Promise<string> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("output.url: a non-empty Buffer is required.");
  }

  const client = new ImgurClient(requireImgurCredentials(credentials));
  const response = await client.upload({ image: base64(buffer), type: "base64" });
  return response.data.link;
}
