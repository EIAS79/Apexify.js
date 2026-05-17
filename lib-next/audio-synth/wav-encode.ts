/**
 * Minimal PCM WAV encoder/decoder for internally generated 16-bit audio.
 */

export function encodeWavPcm16(
  samples: Float32Array,
  sampleRate: number,
  channels: 1 | 2
): Buffer {
  const numFrames = samples.length / channels;
  const dataSize = numFrames * channels * 2;
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
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("decodeWav: not a RIFF WAV buffer.");
  }
  const channels = wav.readUInt16LE(22) as 1 | 2;
  const sampleRate = wav.readUInt32LE(24);
  let dataOffset = 12;
  while (dataOffset + 8 <= wav.length) {
    const chunk = wav.toString("ascii", dataOffset, dataOffset + 4);
    const size = wav.readUInt32LE(dataOffset + 4);
    if (chunk === "data") {
      dataOffset += 8;
      const dataEnd = Math.min(wav.length, dataOffset + size);
      const sampleCount = Math.floor((dataEnd - dataOffset) / 2);
      const samples = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = wav.readInt16LE(dataOffset + i * 2) / 0x8000;
      }
      return { samples, sampleRate, channels };
    }
    dataOffset += 8 + size + (size % 2);
  }
  throw new Error("decodeWav: missing data chunk.");
}
