import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { ApexPainter } from "../dist/cjs";

const outDir = join(__dirname, "audio-synth-output");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const painter = new ApexPainter();

const laser = painter.createAudio.preset("laser");
const customSound = {
  layers: [
    {
      waveform: "sawtooth" as const,
      frequency: 300,
      frequencyEnd: 1200,
      duration: 0.25,
      gain: 0.4,
      vibrato: { depth: 20, rate: 8 },
    },
    {
      waveform: "noise" as const,
      duration: 0.08,
      delay: 0.18,
      gain: 0.2,
      filter: { type: "highpass" as const, cutoff: 1500 },
    },
  ],
};
const custom = painter.createAudio.synth(customSound);

const seq = painter.createAudio.sequence({
  events: [
    { at: 0, preset: "coin" },
    { at: 0.2, preset: "explosionSmall", gain: 0.8 },
    { at: 0.5, preset: "powerup" },
  ],
  tail: 0.2,
});

const mixed = painter.createAudio.mix([laser, custom], { masterGain: 0.9 });

const composed = painter.createAudio.compose({
  duration: 1.2,
  clips: [
    { at: 0, preset: "laser", gain: 0.35, transpose: 0, quality: "bright" },
    { at: 0.05, preset: "explosionSmall", gain: 0.5, pitch: 1.1, fadeIn: 0.01 },
    { at: 0.35, sound: customSound, gain: 0.4, speed: 1.05, noise: 0.04 },
    { at: 0.5, preset: "coin", gain: 0.45, detune: 30 },
  ],
});

async function main() {
  await painter.createAudio.save(laser, join(outDir, "laser.wav"));
  await painter.createAudio.save(custom, join(outDir, "custom.wav"));
  await painter.createAudio.save(seq, join(outDir, "sequence.wav"));
  await painter.createAudio.save(mixed, join(outDir, "mixed.wav"));
  await painter.createAudio.save(composed, join(outDir, "composed.wav"));
  console.log("audio-synth smoke OK:", painter.createAudio.listPresets().length, "presets");
  console.log("Wrote WAV files to", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
