'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function clone(buffer) { return Buffer.from(buffer); }
function expectDecode(buffer, pattern) {
  assert.throws(() => api.inspectWavPcm16(buffer), (error) => {
    assert.equal(error.code, 'APEXIFY_DECODE');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}
function setRiffSize(buffer) { buffer.writeUInt32LE(buffer.length - 8, 4); return buffer; }

api.resetApexifyRuntimeConfig();

const samples = new Float32Array([-1, -0.5, 0, 0.5, 1]);
const wav = api.encodeWavPcm16(samples, 8000, 1);
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.readUInt32LE(4), wav.length - 8);
assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
assert.equal(wav.readUInt32LE(16), 16);
assert.equal(wav.readUInt16LE(20), 1);
assert.equal(wav.readUInt16LE(22), 1);
assert.equal(wav.readUInt32LE(24), 8000);
assert.equal(wav.readUInt32LE(28), 16000);
assert.equal(wav.readUInt16LE(32), 2);
assert.equal(wav.readUInt16LE(34), 16);
assert.equal(wav.toString('ascii', 36, 40), 'data');
assert.equal(wav.readUInt32LE(40), 10);
assert.deepEqual([44, 46, 48, 50, 52].map((offset) => wav.readInt16LE(offset)), [-32768, -16384, 0, 16384, 32767]);

const decoded = api.decodeWavPcm16(wav);
assert.equal(decoded.sampleRate, 8000);
assert.equal(decoded.channels, 1);
assert.deepEqual(Array.from(decoded.samples).map((v) => Number(v.toFixed(6))), [-1, -0.5, 0, 0.5, Number((32767 / 32768).toFixed(6))]);

const stereoSilence = api.encodeWavPcm16(new Float32Array(200), 48_000, 2);
const stereoInfo = api.inspectWavPcm16(stereoSilence);
assert.equal(stereoInfo.channels, 2);
assert.equal(stereoInfo.frameCount, 100);
assert.equal(stereoInfo.blockAlign, 4);
assert.equal(stereoInfo.byteRate, 192_000);

// Unknown chunk with odd-size padding before fmt must be skipped safely.
const junkPayload = Buffer.from([1, 2, 3]);
const junkHeader = Buffer.alloc(8);
junkHeader.write('JUNK', 0, 'ascii');
junkHeader.writeUInt32LE(junkPayload.length, 4);
const withJunk = setRiffSize(Buffer.concat([wav.subarray(0, 12), junkHeader, junkPayload, Buffer.from([0]), wav.subarray(12)]));
assert.equal(api.inspectWavPcm16(withJunk).sampleCount, 5);

// fmt/data order is not assumed.
const reordered = setRiffSize(Buffer.concat([wav.subarray(0, 12), wav.subarray(36), wav.subarray(12, 36)]));
assert.equal(api.inspectWavPcm16(reordered).sampleCount, 5);

expectDecode(Buffer.alloc(0), /too short/);
const wrongRiff = clone(wav); wrongRiff.write('NOPE', 0, 'ascii'); expectDecode(wrongRiff, /RIFF/);
const wrongWave = clone(wav); wrongWave.write('NOPE', 8, 'ascii'); expectDecode(wrongWave, /WAVE/);
const wrongRiffSize = clone(wav); wrongRiffSize.writeUInt32LE(wrongRiffSize.length + 100, 4); expectDecode(wrongRiffSize, /RIFF size/);

const unsupportedFormat = clone(wav); unsupportedFormat.writeUInt16LE(3, 20); expectDecode(unsupportedFormat, /unsupported WAV format/);
const unsupportedBits = clone(wav); unsupportedBits.writeUInt16LE(24, 34); expectDecode(unsupportedBits, /unsupported bit depth/);
const badChannels = clone(wav); badChannels.writeUInt16LE(3, 22); expectDecode(badChannels, /mono or stereo/);
const zeroRate = clone(wav); zeroRate.writeUInt32LE(0, 24); expectDecode(zeroRate, /sample rate/);
const badByteRate = clone(wav); badByteRate.writeUInt32LE(1234, 28); expectDecode(badByteRate, /byte rate/);
const badAlign = clone(wav); badAlign.writeUInt16LE(4, 32); expectDecode(badAlign, /block alignment/);

const oversizedFmt = clone(wav); oversizedFmt.writeUInt32LE(0xffffffff, 16); expectDecode(oversizedFmt, /exceeds RIFF bounds/);
const oversizedData = clone(wav); oversizedData.writeUInt32LE(0xffffffff, 40); expectDecode(oversizedData, /exceeds RIFF bounds/);
const partialFrame = clone(wav); partialFrame.writeUInt32LE(9, 40); expectDecode(partialFrame, /complete audio frames/);

const fmtOnly = setRiffSize(Buffer.from(wav.subarray(0, 36)));
expectDecode(fmtOnly, /missing data/);
const dataOnly = setRiffSize(Buffer.concat([wav.subarray(0, 12), wav.subarray(36)]));
expectDecode(dataOnly, /missing fmt/);

const truncatedFmt = Buffer.alloc(20);
truncatedFmt.write('RIFF', 0); truncatedFmt.writeUInt32LE(12, 4); truncatedFmt.write('WAVE', 8); truncatedFmt.write('fmt ', 12); truncatedFmt.writeUInt32LE(16, 16);
expectDecode(truncatedFmt, /exceeds RIFF bounds/);

const oddNoPad = Buffer.alloc(23);
oddNoPad.write('RIFF', 0); oddNoPad.writeUInt32LE(15, 4); oddNoPad.write('WAVE', 8); oddNoPad.write('JUNK', 12); oddNoPad.writeUInt32LE(3, 16); oddNoPad.set([1, 2, 3], 20);
expectDecode(oddNoPad, /pad byte/);

assert.throws(() => api.encodeWavPcm16(new Float32Array(), 44100, 1), /non-empty/);
assert.throws(() => api.encodeWavPcm16(new Float32Array([NaN]), 44100, 1), /finite/);
assert.throws(() => api.encodeWavPcm16(new Float32Array([0]), 0, 1), /positive integer/);

console.log('phase9-wav: RIFF headers, PCM conversion, chunk-order independence, unknown chunks, and malformed-input rejection passed.');
