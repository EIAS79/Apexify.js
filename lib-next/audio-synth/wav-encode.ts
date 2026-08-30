/** Minimal PCM WAV encoder/decoder for internally generated 16-bit audio. */

import { ApexifyInputError } from "../runtime/errors";
import { assertAudioResourceLimits, assertWithinLimit } from "../runtime/limits";

export interface WavPcm16Info {
  sampleRate: number;
  channels: 1 | 2;
  dataOffset: number;
  dataBytes: number;
  sampleCount: number;
  frameCount: number;
  durationSeconds: number;
}

/** Inspect a PCM16 WAV without allocating decoded sample storage. */
export function inspectWavPcm16(wav: Buffer): WavPcm16Info {
  if (!Buffer.isBuffer(wav) || wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new ApexifyInputError("decodeWav: not a RIFF WAV buffer.");
  }
  if (wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new ApexifyInputError("decodeWav: RIFF container is not WAVE.");
  }

  const channelsRaw = wav.readUInt16LE(22);
  if (channelsRaw !== 1 && channelsRaw !== 2) {
    throw new ApexifyInputError("decodeWav: only mono or stereo PCM is supported.");
  }
  const channels = channelsRaw as 1 | 2;
  const sampleRate = wav.readUInt32LE(24);
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new ApexifyInputError("decodeWav: invalid sample rate.");
  }
  assertWithinLimit("maxAudioSampleRate", sampleRate);

  let cursor = 12;
  while (cursor + 8 <= wav.length) {
    const chunk = wav.toString("ascii", cursor, cursor + 4);
    const declaredSize = wav.readUInt32LE(cursor + 4);
    const payloadOffset = cursor + 8;
    if (chunk === "data") {
      const dataBytes = Math.min(declaredSize, Math.max(0, wav.length - payloadOffset));
      const sampleCount = Math.floor(dataBytes / 2);
      if (sampleCount === 0 || sampleCount % channels !== 0) {
        throw new ApexifyInputError("decodeWav: PCM data must contain complete audio frames.");
      }
      const frameCount = sampleCount / channels;
      const durationSeconds = frameCount / sampleRate;
      assertAudioResourceLimits({ durationSeconds, sampleRate, channels });
      return {
        sampleRate,
        channels,
        dataOffset: payloadOffset,
        dataBytes: sampleCount * 2,
        sampleCount,
        frameCount,
        durationSeconds,
      };
    }
    const next = payloadOffset + declaredSize + (declaredSize % 2);
    if (!Number.isSafeInteger(next) || next <= cursor) {
      throw new ApexifyInputError("decodeWav: invalid chunk size.");
    }
    cursor = next;
  }
  throw new ApexifyInputError("decodeWav: missing data chunk.");
}

export function encodeWavPcm16(
  samples: Float32Array,
  sampleRate: number,
  channels: 1 | 2
): Buffer {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new ApexifyInputError("encodeWav: samples must be a non-empty Float32Array.");
  }
  if (channels !== 1 && channels !== 2) throw new ApexifyInputError("encodeWav: channels must be 1 or 2.");
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new ApexifyInputError("encodeWav: sampleRate must be a positive integer.");
  if (samples.length % channels !== 0) throw new ApexifyInputError("encodeWav: sample count must contain complete frames.");
  assertWithinLimit("maxAudioSampleRate", sampleRate);

  const numFrames = samples.length / channels;
  const durationSeconds = numFrames / sampleRate;
  assertAudioResourceLimits({ durationSeconds, sampleRate, channels });
  const dataSize = samples.length * 2;
  assertWithinLimit("maxAudioBytes", 44 + dataSize);

  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    buffer.writeInt16LE(Math.round(int16), offset);
    offset += 2;
  }
  return buffer;
}

/** Decode 16-bit PCM WAV (PCM format 1) to float -1..1. */
export function decodeWavPcm16(wav: Buffer): {
  samples: Float32Array;
  sampleRate: number;
  channels: 1 | 2;
} {
  const info = inspectWavPcm16(wav);
  // inspectWavPcm16 enforces decoded Float32 memory before this allocation.
  const samples = new Float32Array(info.sampleCount);
  for (let i = 0; i < info.sampleCount; i++) {
    samples[i] = wav.readInt16LE(info.dataOffset + i * 2) / 0x8000;
  }
  return { samples, sampleRate: info.sampleRate, channels: info.channels };
}
