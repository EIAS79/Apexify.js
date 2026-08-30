import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { NetworkPolicyConfig } from "../runtime/config";
import { ApexifyRemoteFetchError } from "../runtime/errors";

export type IpClassification =
  | "public"
  | "loopback"
  | "private"
  | "link-local"
  | "carrier-grade-nat"
  | "multicast"
  | "documentation"
  | "reserved"
  | "unspecified";

export interface ResolvedNetworkTarget {
  url: URL;
  address: string;
  family: 4 | 6;
  trusted: boolean;
}

export type DnsLookup = (hostname: string) => Promise<ReadonlyArray<{ address: string; family: number }>>;

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
}

function normalizeIpInput(address: string): string {
  const unwrapped = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  return unwrapped.split("%", 1)[0];
}

function ipv4ToInt(address: string): number | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return undefined;
    value = (value * 256 + octet) >>> 0;
  }
  return value >>> 0;
}

function ipv4InCidr(address: string, base: string, prefix: number): boolean {
  const value = ipv4ToInt(address);
  const baseValue = ipv4ToInt(base);
  if (value === undefined || baseValue === undefined) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function expandEmbeddedIpv4(address: string): string {
  if (!address.includes(".")) return address;
  const lastColon = address.lastIndexOf(":");
  if (lastColon === -1) return address;
  const ipv4 = address.slice(lastColon + 1);
  const value = ipv4ToInt(ipv4);
  if (value === undefined) return address;
  const hi = ((value >>> 16) & 0xffff).toString(16);
  const lo = (value & 0xffff).toString(16);
  return `${address.slice(0, lastColon)}:${hi}:${lo}`;
}

function ipv6ToBigInt(input: string): bigint | undefined {
  const address = expandEmbeddedIpv4(normalizeIpInput(input).toLowerCase());
  if (isIP(address) !== 6) return undefined;
  const pieces = address.split("::");
  if (pieces.length > 2) return undefined;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (pieces.length === 1 && missing !== 0)) return undefined;
  const hextets = pieces.length === 2
    ? [...left, ...new Array<string>(missing).fill("0"), ...right]
    : left;
  if (hextets.length !== 8) return undefined;
  let value = 0n;
  for (const hextet of hextets) {
    if (!/^[0-9a-f]{1,4}$/i.test(hextet)) return undefined;
    value = (value << 16n) | BigInt(Number.parseInt(hextet, 16));
  }
  return value;
}

function ipv6InCidr(address: string, base: string, prefix: number): boolean {
  const value = ipv6ToBigInt(address);
  const baseValue = ipv6ToBigInt(base);
  if (value === undefined || baseValue === undefined) return false;
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (baseValue >> shift);
}

function classifyIpv4(address: string): IpClassification {
  if (ipv4InCidr(address, "0.0.0.0", 8)) return "unspecified";
  if (ipv4InCidr(address, "10.0.0.0", 8)) return "private";
  if (ipv4InCidr(address, "100.64.0.0", 10)) return "carrier-grade-nat";
  if (ipv4InCidr(address, "127.0.0.0", 8)) return "loopback";
  if (ipv4InCidr(address, "169.254.0.0", 16)) return "link-local";
  if (ipv4InCidr(address, "172.16.0.0", 12)) return "private";
  if (ipv4InCidr(address, "192.168.0.0", 16)) return "private";
  if (ipv4InCidr(address, "192.0.2.0", 24)) return "documentation";
  if (ipv4InCidr(address, "198.51.100.0", 24)) return "documentation";
  if (ipv4InCidr(address, "203.0.113.0", 24)) return "documentation";
  if (ipv4InCidr(address, "224.0.0.0", 4)) return "multicast";
  if (ipv4InCidr(address, "240.0.0.0", 4)) return "reserved";
  if (ipv4InCidr(address, "192.0.0.0", 24)) return "reserved";
  if (ipv4InCidr(address, "192.88.99.0", 24)) return "reserved";
  if (ipv4InCidr(address, "198.18.0.0", 15)) return "reserved";
  return "public";
}

function classifyIpv6(address: string): IpClassification {
  const value = ipv6ToBigInt(address);
  if (value === undefined) return "reserved";
  if (value === 0n) return "unspecified";
  if (value === 1n) return "loopback";
  if (ipv6InCidr(address, "::ffff:0:0", 96)) {
    const embedded = Number(value & 0xffffffffn) >>> 0;
    return classifyIpv4(`${(embedded >>> 24) & 255}.${(embedded >>> 16) & 255}.${(embedded >>> 8) & 255}.${embedded & 255}`);
  }
  if (ipv6InCidr(address, "fc00::", 7)) return "private";
  if (ipv6InCidr(address, "fe80::", 10)) return "link-local";
  if (ipv6InCidr(address, "ff00::", 8)) return "multicast";
  if (ipv6InCidr(address, "2001:db8::", 32) || ipv6InCidr(address, "3fff::", 20)) return "documentation";
  if (
    ipv6InCidr(address, "100::", 64) ||
    ipv6InCidr(address, "64:ff9b::", 96) ||
    ipv6InCidr(address, "64:ff9b:1::", 48) ||
    ipv6InCidr(address, "2001::", 23) ||
    ipv6InCidr(address, "2002::", 16)
  ) return "reserved";
  return ipv6InCidr(address, "2000::", 3) ? "public" : "reserved";
}

export function classifyIpAddress(address: string): IpClassification {
  const normalized = normalizeIpInput(address);
  const family = isIP(normalized);
  if (family === 4) return classifyIpv4(normalized);
  if (family === 6) return classifyIpv6(normalized);
  return "reserved";
}

export function redactUrl(value: string | URL): string {
  try {
    const url = typeof value === "string" ? new URL(value) : new URL(value.toString());
    return `${url.protocol}//${url.host}/<redacted>`;
  } catch {
    return "<redacted-url>";
  }
}

export function isTrustedHostname(hostname: string, trustedHosts: readonly string[]): boolean {
  const normalized = normalizeHostname(hostname);
  return trustedHosts.some((entry) => {
    const trusted = normalizeHostname(entry);
    if (trusted.startsWith("*.")) {
      const suffix = trusted.slice(1);
      return normalized.endsWith(suffix) && normalized.length > suffix.length;
    }
    return normalized === trusted;
  });
}

function assertUrlShape(url: URL, policy: Readonly<NetworkPolicyConfig>): void {
  const redacted = redactUrl(url);
  if (!policy.allowedProtocols.includes(url.protocol as "http:" | "https:")) {
    throw new ApexifyRemoteFetchError(`Remote URL protocol is not allowed: ${url.protocol}`, {
      url: redacted,
      details: { reason: "PROTOCOL_BLOCKED" },
    });
  }
  if (url.username || url.password) {
    throw new ApexifyRemoteFetchError("Remote URLs containing credentials are not allowed.", {
      url: redacted,
      details: { reason: "URL_CREDENTIALS_BLOCKED" },
    });
  }
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new ApexifyRemoteFetchError("Remote URL hostname is required.", {
      url: redacted,
      details: { reason: "HOSTNAME_REQUIRED" },
    });
  }
  if (!policy.allowPrivateNetwork && !isTrustedHostname(hostname, policy.trustedHosts)) {
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      throw new ApexifyRemoteFetchError("Localhost destinations are blocked by network policy.", {
        url: redacted,
        details: { reason: "LOCALHOST_BLOCKED" },
      });
    }
  }
}

async function defaultLookup(hostname: string): Promise<ReadonlyArray<{ address: string; family: number }>> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export async function resolveNetworkTarget(
  input: string | URL,
  policy: Readonly<NetworkPolicyConfig>,
  lookup: DnsLookup = defaultLookup
): Promise<ResolvedNetworkTarget> {
  const url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  assertUrlShape(url, policy);
  const hostname = normalizeHostname(url.hostname);
  const trusted = policy.allowPrivateNetwork || isTrustedHostname(hostname, policy.trustedHosts);
  const literalFamily = isIP(hostname);
  const resolved = literalFamily ? [{ address: hostname, family: literalFamily }] : await lookup(hostname);
  if (resolved.length === 0) {
    throw new ApexifyRemoteFetchError("Remote hostname resolved to no addresses.", {
      url: redactUrl(url),
      retryable: true,
      details: { reason: "DNS_EMPTY" },
    });
  }

  const usable: Array<{ address: string; family: 4 | 6 }> = [];
  for (const candidate of resolved) {
    if (candidate.family !== 4 && candidate.family !== 6) continue;
    const classification = classifyIpAddress(candidate.address);
    if (!trusted && classification !== "public") {
      throw new ApexifyRemoteFetchError(`Remote destination is blocked by network policy (${classification}).`, {
        url: redactUrl(url),
        details: { reason: "IP_BLOCKED", classification, family: candidate.family },
      });
    }
    usable.push({ address: candidate.address, family: candidate.family });
  }
  if (usable.length === 0) {
    throw new ApexifyRemoteFetchError("Remote hostname did not resolve to a usable IPv4/IPv6 address.", {
      url: redactUrl(url),
      details: { reason: "DNS_NO_USABLE_ADDRESS" },
    });
  }
  return { url, address: usable[0].address, family: usable[0].family, trusted };
}
