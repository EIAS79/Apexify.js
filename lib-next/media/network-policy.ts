import dns from "node:dns/promises";
import net from "node:net";
import type { NetworkRuntimeConfig } from "../runtime/config";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyRemoteFetchError } from "../runtime/errors";

export interface ValidatedRemoteTarget {
  url: URL;
  addresses: readonly string[];
  trusted: boolean;
}

interface Ipv4Range { base: number; mask: number; label: string }

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipv4Range(cidr: string, label: string): Ipv4Range {
  const [address, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: ipv4ToInt(address) & mask, mask, label };
}

const BLOCKED_IPV4 = [
  ipv4Range("0.0.0.0/8", "current-network/reserved"),
  ipv4Range("10.0.0.0/8", "private"),
  ipv4Range("100.64.0.0/10", "shared-address-space"),
  ipv4Range("127.0.0.0/8", "loopback"),
  ipv4Range("169.254.0.0/16", "link-local"),
  ipv4Range("172.16.0.0/12", "private"),
  ipv4Range("192.0.0.0/24", "protocol-assignment"),
  ipv4Range("192.0.2.0/24", "documentation"),
  ipv4Range("192.88.99.0/24", "deprecated-6to4-relay"),
  ipv4Range("192.168.0.0/16", "private"),
  ipv4Range("198.18.0.0/15", "benchmark"),
  ipv4Range("198.51.100.0/24", "documentation"),
  ipv4Range("203.0.113.0/24", "documentation"),
  ipv4Range("224.0.0.0/4", "multicast"),
  ipv4Range("240.0.0.0/4", "reserved"),
];

function normalizeIpv6(ip: string): bigint {
  const zoneIndex = ip.indexOf("%");
  const address = zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip;
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const v4 = ipv4ToInt(address.slice(lastColon + 1));
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    return normalizeIpv6(`${address.slice(0, lastColon)}:${hi}:${lo}`);
  }
  const [leftRaw, rightRaw = ""] = address.split("::");
  const left = leftRaw ? leftRaw.split(":").filter(Boolean) : [];
  const right = rightRaw ? rightRaw.split(":").filter(Boolean) : [];
  if (!address.includes("::") && left.length !== 8) throw new Error("Invalid IPv6 address");
  const missing = 8 - left.length - right.length;
  const parts = [...left, ...new Array(Math.max(0, missing)).fill("0"), ...right];
  if (parts.length !== 8) throw new Error("Invalid IPv6 address");
  let out = 0n;
  for (const part of parts) {
    const value = Number.parseInt(part || "0", 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error("Invalid IPv6 address");
    out = (out << 16n) | BigInt(value);
  }
  return out;
}

function ipv6InCidr(ip: bigint, base: bigint, prefix: number): boolean {
  if (prefix === 0) return true;
  const shift = 128n - BigInt(prefix);
  return (ip >> shift) === (base >> shift);
}

const BLOCKED_IPV6: Array<{ base: bigint; prefix: number; label: string }> = [
  { base: normalizeIpv6("::"), prefix: 128, label: "unspecified" },
  { base: normalizeIpv6("::1"), prefix: 128, label: "loopback" },
  { base: normalizeIpv6("::ffff:0:0"), prefix: 96, label: "ipv4-mapped" },
  { base: normalizeIpv6("64:ff9b::"), prefix: 96, label: "well-known-nat64" },
  { base: normalizeIpv6("64:ff9b:1::"), prefix: 48, label: "local-use-translation" },
  { base: normalizeIpv6("100::"), prefix: 64, label: "discard-only" },
  // IETF protocol-assignment space includes Teredo, benchmarking and ORCHID
  // ranges. Treat it as non-public by default rather than maintaining a brittle
  // allow-by-exception list of protocol-specific subranges.
  { base: normalizeIpv6("2001::"), prefix: 23, label: "protocol-assignment" },
  { base: normalizeIpv6("2001:db8::"), prefix: 32, label: "documentation" },
  { base: normalizeIpv6("2002::"), prefix: 16, label: "6to4" },
  { base: normalizeIpv6("3fff::"), prefix: 20, label: "documentation" },
  { base: normalizeIpv6("5f00::"), prefix: 16, label: "reserved-segment-routing" },
  { base: normalizeIpv6("fc00::"), prefix: 7, label: "unique-local" },
  { base: normalizeIpv6("fe80::"), prefix: 10, label: "link-local" },
  { base: normalizeIpv6("ff00::"), prefix: 8, label: "multicast" },
];

export interface IpClassification {
  blocked: boolean;
  reason?: string;
}

export function classifyIpAddress(address: string): IpClassification {
  const version = net.isIP(address);
  if (version === 4) {
    const value = ipv4ToInt(address);
    const match = BLOCKED_IPV4.find((range) => (value & range.mask) === range.base);
    return match ? { blocked: true, reason: match.label } : { blocked: false };
  }
  if (version === 6) {
    const value = normalizeIpv6(address);
    const mapped = BLOCKED_IPV6.find((range) => ipv6InCidr(value, range.base, range.prefix));
    if (mapped?.label === "ipv4-mapped") {
      const v4 = Number(value & 0xffffffffn) >>> 0;
      const dotted = `${(v4 >>> 24) & 255}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`;
      const nested = classifyIpAddress(dotted);
      return nested.blocked ? { blocked: true, reason: `ipv4-mapped:${nested.reason}` } : { blocked: false };
    }
    return mapped ? { blocked: true, reason: mapped.label } : { blocked: false };
  }
  return { blocked: true, reason: "invalid-address" };
}

export function redactUrl(value: string | URL): string {
  try {
    const url = value instanceof URL ? new URL(value.toString()) : new URL(value);
    if (url.username) url.username = "[redacted]";
    if (url.password) url.password = "[redacted]";
    if (url.search) url.search = "?[redacted]";
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function hostMatchesAllowlist(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((entry) => {
    const allowed = entry.toLowerCase().replace(/\.$/, "");
    return host === allowed || (allowed.startsWith("*.") && host.endsWith(allowed.slice(1)) && host !== allowed.slice(2));
  });
}

export async function validateRemoteTarget(
  input: string | URL,
  config: NetworkRuntimeConfig = getDefaultApexifyRuntimeConfig().network
): Promise<ValidatedRemoteTarget> {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch (cause) {
    throw new ApexifyRemoteFetchError("Remote media URL is invalid.", { cause });
  }
  if (!config.allowedProtocols.includes(url.protocol as "http:" | "https:")) {
    throw new ApexifyRemoteFetchError(`Remote media protocol is not allowed: ${url.protocol}`, { requestUrl: redactUrl(url) });
  }
  if (url.username || url.password) {
    throw new ApexifyRemoteFetchError("Credentials embedded in remote media URLs are not allowed.", { requestUrl: redactUrl(url) });
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    if (!(config.trustedNetworkAccess && hostMatchesAllowlist(hostname, config.allowedHosts))) {
      throw new ApexifyRemoteFetchError("Remote media target is local and blocked by network policy.", { requestUrl: redactUrl(url) });
    }
  }

  const trusted = config.trustedNetworkAccess && hostMatchesAllowlist(hostname, config.allowedHosts);
  let addresses: string[];
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      addresses = [...new Set(records.map((record) => record.address))];
    } catch (cause) {
      throw new ApexifyRemoteFetchError("Remote media DNS resolution failed.", { requestUrl: redactUrl(url), cause });
    }
  }
  if (addresses.length === 0) {
    throw new ApexifyRemoteFetchError("Remote media hostname resolved to no addresses.", { requestUrl: redactUrl(url) });
  }
  if (!trusted) {
    for (const address of addresses) {
      const classification = classifyIpAddress(address);
      if (classification.blocked) {
        throw new ApexifyRemoteFetchError(`Remote media target resolved to a blocked ${classification.reason ?? "non-public"} address.`, {
          requestUrl: redactUrl(url),
          details: { addressClass: classification.reason },
        });
      }
    }
  }
  return { url, addresses, trusted };
}
