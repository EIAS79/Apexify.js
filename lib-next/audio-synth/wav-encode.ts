/** Strict RIFF/WAVE PCM16 encoder/decoder used by procedural audio and video integration. */

import { ApexifyDecodeError, ApexifyInputError } from "../runtime/errors";
import { assertAudioResourceLimits, assertWithinLimit } from "../runtime/limits";
import { PCM16_BYTES_PER_SAMPLE } from "./constants";

export interface WavPcm16Info {
  sampleRate: number;
  channels: 1 | 2;
  dataOffset: number;
  dataBytes: number;
  sampleCount: number;
  frameCount: number;
  durationSeconds: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: 16;
}

function decodeError(message: string, details?: Readonly<Record<string, unknown>>): ApexifyDecodeError {
  return new ApexifyDecodeError(`decodeWav: ${message}`, { details });
}

function requireRange(buffer: Buffer, offset: number, bytes: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || offset < 0 || bytes < 0 || offset + bytes > buffer.length) {
    throw decodeError(`truncated ${label}.`, { offset, bytes, bufferBytes: buffer.length });
  }
}

/** Inspect a strict PCM16 RIFF/WAVE without allocating decoded sample storage. Unknown chunks and legal odd-byte padding are supported. */
export function inspectWavPcm16(wav: Buffer): WavPcm16Info {
  if (!Buffer.isBuffer(wav)) throw decodeError("input must be a Buffer.");
  if (wav.length < 12) throw decodeError("header is too short.");
  if (wav.toString("ascii", 0, 4) !== "RIFF") throw decodeError("missing RIFF signature.");
  if (wav.toString("ascii", 8, 12) !== "WAVE") throw decodeError("RIFF container is not WAVE.");

  const declaredRiffSize = wav.readUInt32LE(4);
  const riffEnd = declaredRiffSize + 8;
  if (!Number.isSafeInteger(riffEnd) || riffEnd < 12 || riffEnd !== wav.length) {
    throw decodeError("RIFF size does not match the buffer length.", { declaredRiffSize, bufferBytes: wav.length });
  }

  let cursor = 12;
  let format: { channels: 1 | 2; sampleRate: number; byteRate: number; blockAlign: number; bitsPerSample: 16 } | undefined;
  let data: { offset: number; bytes: number } | undefined;

  while (cursor < riffEnd) {
    if (cursor + 8 > riffEnd) throw decodeError("truncated chunk header.", { cursor });
    const id = wav.toString("ascii", cursor, cursor + 4);
    const size = wav.readUInt32LE(cursor + 4);
    const payloadOffset = cursor + 8;
    const payloadEnd = payloadOffset + size;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > riffEnd) throw decodeError(`chunk ${JSON.stringify(id)} exceeds RIFF bounds.`, { size, cursor });

    if (id === "fmt ") {
      if (format) throw decodeError("multiple fmt chunks are not supported.");
      if (size < 16) throw decodeError("fmt chunk is shorter than 16 bytes.");
      requireRange(wav, payloadOffset, 16, "fmt chunk");
      const audioFormat = wav.readUInt16LE(payloadOffset);
      const channelsRaw = wav.readUInt16LE(payloadOffset + 2);
      const sampleRate = wav.readUInt32LE(payloadOffset + 4);
      const byteRate = wav.readUInt32LE(payloadOffset + 8);
      const blockAlign = wav.readUInt16LE(payloadOffset + 12);
      const bitsPerSample = wav.readUInt16LE(payloadOffset + 14);
      if (audioFormat !== 1) throw decodeError(`unsupported WAV format ${audioFormat}; only integer PCM format 1 is supported.`);
      if (channelsRaw !== 1 && channelsRaw !== 2) throw decodeError("only mono or stereo PCM is supported.", { channels: channelsRaw });
      if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw decodeError("invalid sample rate.", { sampleRate });
      assertWithinLimit("maxAudioSampleRate", sampleRate);
      if (bitsPerSample !== 16) throw decodeError(`unsupported bit depth ${bitsPerSample}; only PCM16 is supported.`);
      const channels = channelsRaw as 1 | 2;
      const expectedBlockAlign = channels * PCM16_BYTES_PER_SAMPLE;
      const expectedByteRate = sampleRate * expectedBlockAlign;
      if (blockAlign !== expectedBlockAlign) throw decodeError("invalid block alignment.", { blockAlign, expectedBlockAlign });
      if (byteRate !== expectedByteRate) throw decodeError("invalid byte rate.", { byteRate, expectedByteRate });
      format = { channels, sampleRate, byteRate, blockAlign, bitsPerSample: 16 };
    } else if (id === "data") {
      if (data) throw decodeError("multiple data chunks are not supported.");
      data = { offset: payloadOffset, bytes: size };
    }

    const paddedEnd = payloadEnd + (size & 1);
    if (paddedEnd > riffEnd) throw decodeError(`odd-sized chunk ${JSON.stringify(id)} is missing its pad byte.`);
    cursor = paddedEnd;
  }

  if (!format) throw decodeError("missing fmt chunk.");
  if (!data) throw decodeError("missing data chunk.");
  if (data.bytes === 0) throw decodeError("zero-length PCM data is not supported.");
  if (data.bytes % format.blockAlign !== 0) throw decodeError("PCM data does not contain complete audio frames.", { dataBytes: data.bytes, blockAlign: format.blockAlign });
  requireRange(wav, data.offset, data.bytes, "data chunk");

  const frameCount = data.bytes / format.blockAlign;
  const sampleCount = frameCount * format.channels;
  const durationSeconds = frameCount / format.sampleRate;
  assertAudioResourceLimits({ durationSeconds, sampleRate: format.sampleRate, channels: format.channels });
  assertWithinLimit("maxAudioBytes", sampleCount * Float32Array.BYTES_PER_ELEMENT);
  return {
    sampleRate: format.sampleRate,
    channels: format.channels,
    dataOffset: data.offset,
    dataBytes: data.bytes,
    sampleCount,
    frameCount,
    durationSeconds,
    byteRate: format.byteRate,
    blockAlign: format.blockAlign,
    bitsPerSample: 16,
  };
}

interface WavEncodePlan { dataSize: number; outputBytes: number; }

function validateWavEncodeRequest(
  samples: Float32Array,
  sampleRate: number,
  channels: 1 | 2,
  scanFinite: boolean
): WavEncodePlan {
  if (!(samples instanceof Float32Array) || samples.length === 0) throw new ApexifyInputError("encodeWav: samples must be a non-empty Float32Array.");
  if (channels !== 1 && channels !== 2) throw new ApexifyInputError("encodeWav: channels must be 1 or 2.");
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new ApexifyInputError("encodeWav: sampleRate must be a positive integer.");
  if (samples.length % channels !== 0) throw new ApexifyInputError("encodeWav: sample count must contain complete frames.");
  assertWithinLimit("maxAudioSampleRate", sampleRate);

  const frameCount = samples.length / channels;
  const durationSeconds = frameCount / sampleRate;
  assertAudioResourceLimits({ durationSeconds, sampleRate, channels });
  const dataSize = samples.length * PCM16_BYTES_PER_SAMPLE;
  const outputBytes = 44 + dataSize;
  if (!Number.isSafeInteger(outputBytes) || 36 + dataSize > 0xffffffff) throw new ApexifyInputError("encodeWav: output exceeds RIFF/WAVE 32-bit size limits.");
  assertWithinLimit("maxAudioBytes", samples.byteLength + outputBytes);

  if (scanFinite) {
    for (let i = 0; i < samples.length; i += 1) {
      if (!Number.isFinite(samples[i])) throw new ApexifyInputError("encodeWav: samples must contain only finite values.", { details: { sampleIndex: i } });
    }
  }
  return { dataSize, outputBytes };
}

function encodeWavPcm16Body(
  samples: Float32Array,
  sampleRate: number,
  channels: 1 | 2,
  plan: WavEncodePlan
): Buffer {
  const { dataSize, outputBytes } = plan;
  const buffer = Buffer.alloc(outputBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * PCM16_BYTES_PER_SAMPLE, 28);
  buffer.writeUInt16LE(channels * PCM16_BYTES_PER_SAMPLE, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    const pcm = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    buffer.writeInt16LE(pcm, offset);
    offset += PCM16_BYTES_PER_SAMPLE;
  }
  return buffer;
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number, channels: 1 | 2): Buffer {
  return encodeWavPcm16Body(samples, sampleRate, channels, validateWavEncodeRequest(samples, sampleRate, channels, true));
}

/**
 * Trusted internal encoder for PCM that has already passed render/mix finite-sample checks.
 * Structural/resource validation remains in place, but the duplicate O(n) finite scan is skipped.
 */
export function encodeValidatedWavPcm16(samples: Float32Array, sampleRate: number, channels: 1 | 2): Buffer {
  return encodeWavPcm16Body(samples, sampleRate, channels, validateWavEncodeRequest(samples, sampleRate, channels, false));
}

/** Decode strict 16-bit integer PCM WAV to Float32 samples in [-1, 1). */
export function decodeWavPcm16(wav: Buffer): { samples: Float32Array; sampleRate: number; channels: 1 | 2 } {
  const info = inspectWavPcm16(wav);
  const decodedBytes = info.sampleCount * Float32Array.BYTES_PER_ELEMENT;
  assertWithinLimit("maxAudioBytes", wav.length + decodedBytes);
  const samples = new Float32Array(info.sampleCount);
  for (let i = 0; i < info.sampleCount; i += 1) samples[i] = wav.readInt16LE(info.dataOffset + i * PCM16_BYTES_PER_SAMPLE) / 0x8000;
  return { samples, sampleRate: info.sampleRate, channels: info.channels };
}
