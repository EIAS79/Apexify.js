# New Video Features - Implementation Summary

## 🎬 Feature 1: Create Video from Frames/Images

### **Overview**
Allows users to extract frames from a video, edit them using `createImage()` and `createText()`, and then compile them back into a video.

### **Usage**

```typescript
// Step 1: Extract frames from video
const frames = await painter.createVideo({
  source: './input.mp4',
  extractFrames: {
    times: [0, 1, 2, 3, 4, 5], // Extract at specific times
    outputFormat: 'png'
  }
});
// Returns: Array of Buffers

// Step 2: Edit frames using createImage/createText
const editedFrames: Buffer[] = [];
for (const frameBuffer of frames) {
  // Create canvas from frame
  const canvas = await painter.createCanvas({
    width: 1920,
    height: 1080,
    customBg: { source: frameBuffer, inherit: true }
  });

  // Add text overlay
  const edited = await painter.createText({
    text: 'My Custom Text',
    x: 100,
    y: 100,
    fontSize: 48,
    color: '#ffffff'
  }, canvas.buffer);

  editedFrames.push(edited);
}

// Step 3: Compile edited frames back into video
await painter.createVideo({
  source: './input.mp4', // Source is required but not used for this operation
  createFromFrames: {
    frames: editedFrames, // Array of Buffers or file paths
    outputPath: './output.mp4',
    fps: 30, // Frames per second
    format: 'mp4',
    quality: 'high',
    resolution: { width: 1920, height: 1080 } // Optional
  }
});
```

### **Options**

```typescript
createFromFrames?: {
  frames: Array<string | Buffer>;  // Required: Array of image paths or buffers
  outputPath: string;              // Required: Output video file path
  fps?: number;                     // Optional: Frames per second (default: 30)
  format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv'; // Optional: Output format (default: 'mp4')
  quality?: 'low' | 'medium' | 'high' | 'ultra';   // Optional: Quality preset (default: 'medium')
  bitrate?: number;                 // Optional: Custom bitrate in kbps
  resolution?: { width: number; height: number }; // Optional: Output resolution (auto-detected from first frame if not specified)
}
```

### **How It Works**
1. Accepts array of image paths or Buffers
2. Saves all frames to temporary directory with sequential naming (`frame-000000.png`, `frame-000001.png`, etc.)
3. Uses FFmpeg's `image2` demuxer with pattern matching to create video
4. Automatically detects frame dimensions from first frame if resolution not specified
5. Cleans up temporary files after processing

### **Example Workflow**

```typescript
// Complete workflow: Extract → Edit → Compile
const painter = new ApexPainter();

// 1. Extract frames at specific intervals
const frames = await painter.createVideo({
  source: './video.mp4',
  extractFrames: {
    interval: 1000, // Every 1 second
    outputFormat: 'png'
  }
});

// 2. Edit each frame
const editedFrames = await Promise.all(
  frames.map(async (framePath) => {
    // Load frame as canvas background
    const canvas = await painter.createCanvas({
      width: 1920,
      height: 1080,
      customBg: { source: framePath, inherit: true }
    });

    // Add text
    const withText = await painter.createText({
      text: `Frame ${frames.indexOf(framePath) + 1}`,
      x: 50,
      y: 50,
      fontSize: 32,
      color: '#ff0000',
      bold: true
    }, canvas.buffer);

    // Add image overlay
    const final = await painter.createImage({
      source: './logo.png',
      x: 1600,
      y: 900,
      width: 200,
      height: 100
    }, withText);

    return final;
  })
);

// 3. Compile back to video
await painter.createVideo({
  source: './video.mp4',
  createFromFrames: {
    frames: editedFrames,
    outputPath: './edited-video.mp4',
    fps: 30,
    quality: 'high'
  }
});
```

---

## 🔇 Feature 2: Partial Audio Muting

### **Overview**
Allows users to mute audio for specific time ranges in a video, not just the entire video.

### **Usage**

```typescript
// Mute audio from 7-13 seconds in a 20-second video
await painter.createVideo({
  source: './video.mp4',
  mute: {
    outputPath: './muted-video.mp4',
    ranges: [
      { start: 7, end: 13 }  // Mute from 7 to 13 seconds
    ]
  }
});

// Multiple mute ranges
await painter.createVideo({
  source: './video.mp4',
  mute: {
    outputPath: './muted-video.mp4',
    ranges: [
      { start: 5, end: 10 },   // Mute 5-10 seconds
      { start: 15, end: 20 }    // Mute 15-20 seconds
    ]
  }
});

// Full mute (original behavior - no ranges specified)
await painter.createVideo({
  source: './video.mp4',
  mute: {
    outputPath: './silent-video.mp4'
    // No ranges = mute entire video
  }
});
```

### **Options**

```typescript
mute?: {
  outputPath: string;                                    // Required: Output video file path
  ranges?: Array<{ start: number; end: number }>;       // Optional: Time ranges to mute (in seconds)
                                                         // If not specified, mutes entire video
}
```

### **How It Works**
1. If no `ranges` specified: Uses `-an` flag to remove all audio (fast, lossless)
2. If `ranges` specified: Uses FFmpeg's `volume` filter with `enable` condition to mute specific time ranges
3. Preserves video stream without re-encoding (`-c:v copy`)
4. Audio is processed to apply volume changes at specified times

### **Technical Details**

**Full Mute** (no ranges):
```bash
ffmpeg -i input.mp4 -c copy -an output.mp4
```
- Fast, lossless (no re-encoding)
- Removes entire audio stream

**Partial Mute** (with ranges):
```bash
ffmpeg -i input.mp4 -af "volume=enable='between(t,7,13)':volume=0" -c:v copy output.mp4
```
- Re-encodes audio to apply volume changes
- Video stream is copied (no re-encoding)
- Multiple ranges are combined with comma-separated filters

### **Example Use Cases**

```typescript
// Remove background music from specific scene
await painter.createVideo({
  source: './movie.mp4',
  mute: {
    outputPath: './movie-no-music.mp4',
    ranges: [
      { start: 120, end: 180 }  // Mute music during dialogue scene
    ]
  }
});

// Create video with multiple silent segments
await painter.createVideo({
  source: './presentation.mp4',
  mute: {
    outputPath: './presentation-muted.mp4',
    ranges: [
      { start: 10, end: 15 },   // Mute during slide transition
      { start: 45, end: 50 },   // Mute during Q&A
      { start: 90, end: 95 }    // Mute during outro
    ]
  }
});

// Remove audio from entire video (backward compatible)
await painter.createVideo({
  source: './video.mp4',
  mute: {
    outputPath: './silent.mp4'
  }
});
```

---

## 🔧 Implementation Details

### **File Locations**
- **Type Definitions**: `lib/Canvas/ApexPainter.ts` (lines 2230-2242)
- **Handler**: `lib/Canvas/ApexPainter.ts` (line 2467)
- **Methods**:
  - `#createVideoFromFrames()`: lines 4276-4460
  - `#muteVideo()`: lines 4146-4224 (updated)

### **Dependencies**
- **FFmpeg**: Required for both features
- **@napi-rs/canvas**: Used for image dimension detection in `createFromFrames`

### **Error Handling**
- Validates frame array is not empty
- Validates frame files exist
- Handles dimension detection failures
- Automatic cleanup of temporary files
- Comprehensive error messages

### **Performance Considerations**

**createFromFrames**:
- Sequential frame processing (may be slow for many frames)
- Temporary file creation (disk I/O)
- FFmpeg encoding (CPU intensive)
- 10-minute timeout for large sequences

**Partial Mute**:
- Full mute: Very fast (copy operation)
- Partial mute: Slower (audio re-encoding required)
- Video stream not re-encoded (preserves quality)

---

## ✅ Testing Recommendations

### **createFromFrames**
1. Test with Buffers vs file paths
2. Test with different frame counts (1, 10, 100, 1000)
3. Test with different resolutions
4. Test with different FPS values
5. Test error handling (missing frames, invalid paths)

### **Partial Mute**
1. Test with single range
2. Test with multiple ranges
3. Test with overlapping ranges
4. Test with ranges at video start/end
5. Test full mute (no ranges)
6. Test with videos without audio

---

## 📝 Notes

- Both features maintain backward compatibility
- `createFromFrames` requires `source` parameter but doesn't use it (for API consistency)
- Partial mute uses audio filtering which requires re-encoding (slower than full mute)
- Frame sequence directory is automatically cleaned up
- All temporary files are removed after processing

---

## 🎬 Feature 3: Replace Video Segments

### **Overview**
Allows users to replace a specific time segment in a video with a segment from another video or with edited frames. This combines cutting and merging operations.

### **Usage**

```typescript
// Replace segment with segment from another video
await painter.createVideo({
  source: './main-video.mp4',
  replaceSegment: {
    replacementVideo: './replacement-video.mp4',
    replacementStartTime: 5,      // Start at 5 seconds in replacement video
    replacementDuration: 3,         // Take 3 seconds (default: same as target duration)
    targetStartTime: 10,           // Replace from 10 seconds in main video
    targetEndTime: 13,             // Replace until 13 seconds in main video
    outputPath: './output.mp4'
  }
});

// Replace segment with edited frames
const editedFrames = [buffer1, buffer2, buffer3, ...]; // Frames edited with createImage/createText

await painter.createVideo({
  source: './main-video.mp4',
  replaceSegment: {
    replacementFrames: editedFrames,
    replacementFps: 30,             // FPS for replacement frames
    targetStartTime: 10,
    targetEndTime: 13,
    outputPath: './output.mp4'
  }
});
```

### **Options**

```typescript
replaceSegment?: {
  // Option 1: Replace with segment from another video
  replacementVideo?: string | Buffer;      // Video to take replacement segment from
  replacementStartTime?: number;           // Start time in replacement video (default: 0)
  replacementDuration?: number;            // Duration of replacement (default: same as target duration)
  
  // Option 2: Replace with frames/images
  replacementFrames?: Array<string | Buffer>; // Array of frames to use as replacement
  replacementFps?: number;                    // FPS for replacement frames (default: 30)
  
  // Target segment to replace (required)
  targetStartTime: number;                  // Start time in main video to replace
  targetEndTime: number;                     // End time in main video to replace
  outputPath: string;                       // Output video file path
}
```

### **How It Works**
1. **Cut main video into 3 parts**:
   - Part 1: Before target segment (0 to `targetStartTime`)
   - Part 2: Target segment to replace (`targetStartTime` to `targetEndTime`)
   - Part 3: After target segment (`targetEndTime` to end)

2. **Create replacement segment**:
   - **From video**: Extract segment from replacement video
   - **From frames**: Compile frames into video using `createFromFrames`

3. **Merge parts**: Concatenate Part 1 + Replacement + Part 3

### **Complete Workflow Example**

```typescript
// 1. Extract frames from main video at specific times
const frames = await painter.createVideo({
  source: './main-video.mp4',
  extractFrames: {
    times: [10, 10.5, 11, 11.5, 12, 12.5, 13], // Extract frames from 10-13 seconds
    outputFormat: 'png'
  }
});

// 2. Edit frames with createImage/createText
const editedFrames = await Promise.all(
  frames.map(async (frameBuffer) => {
    const canvas = await painter.createCanvas({
      width: 1920,
      height: 1080,
      customBg: { source: frameBuffer, inherit: true }
    });
    
    const edited = await painter.createText({
      text: 'REPLACED SEGMENT',
      x: 100,
      y: 100,
      fontSize: 48,
      color: '#ff0000'
    }, canvas.buffer);
    
    return edited;
  })
);

// 3. Replace the segment in main video with edited frames
await painter.createVideo({
  source: './main-video.mp4',
  replaceSegment: {
    replacementFrames: editedFrames,
    replacementFps: 30,
    targetStartTime: 10,
    targetEndTime: 13,
    outputPath: './output.mp4'
  }
});
```

### **Use Cases**

```typescript
// Replace scene with different take
await painter.createVideo({
  source: './movie.mp4',
  replaceSegment: {
    replacementVideo: './alternate-take.mp4',
    replacementStartTime: 0,
    replacementDuration: 5,
    targetStartTime: 60,
    targetEndTime: 65,
    outputPath: './movie-edited.mp4'
  }
});

// Replace segment with frames from another video
await painter.createVideo({
  source: './video1.mp4',
  replaceSegment: {
    replacementVideo: './video2.mp4',
    replacementStartTime: 30,  // Take segment from 30-33 seconds of video2
    replacementDuration: 3,
    targetStartTime: 15,        // Replace 15-18 seconds in video1
    targetEndTime: 18,
    outputPath: './merged.mp4'
  }
});

// Replace with custom edited frames
const customFrames = [/* edited frames */];
await painter.createVideo({
  source: './video.mp4',
  replaceSegment: {
    replacementFrames: customFrames,
    replacementFps: 24,
    targetStartTime: 5,
    targetEndTime: 8,
    outputPath: './custom.mp4'
  }
});
```

### **Technical Details**

**Process Flow**:
1. Validate time ranges
2. Extract Part 1 (before segment) - uses `-c copy` for speed
3. Create replacement segment:
   - From video: `ffmpeg -ss X -t Y -c copy`
   - From frames: Uses `createFromFrames` internally
4. Extract Part 3 (after segment) - uses `-c copy` for speed
5. Concatenate: `ffmpeg -f concat -c copy`

**Performance**:
- Fast when using `-c copy` (no re-encoding)
- Slower when replacement is from frames (requires encoding)
- Preserves video quality for copied segments

**Limitations**:
- Replacement duration can differ from target duration
- Video codecs should match for best results
- Audio is preserved from all segments

---

*Implementation Date: 2024*  
*Library Version: 5.1.1*

