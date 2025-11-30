# MrLyrics - YouTube Lyrics Video Generator

Generate pixelated, Minecraft-style lyrics videos from YouTube videos with synchronized transcripts.

## Features

- 🎵 Extract transcripts from YouTube videos
- 🎤 Download audio from YouTube videos
- 🎬 Generate pixelated lyrics videos with:
  - Black background
  - White text
  - Pixelated/Minecraft-style fonts
  - Synchronized lyrics with audio

## Prerequisites

- Node.js 18+
- FFmpeg installed on your system
- yt-dlp installed on your system (for downloading YouTube audio)

### Installing FFmpeg

**macOS:**

```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**Windows:**
Download from [FFmpeg website](https://ffmpeg.org/download.html) and add to PATH.

### Installing yt-dlp

**macOS:**

```bash
brew install yt-dlp
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install yt-dlp
```

**Windows:**
Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) or install via pip:

```bash
pip install yt-dlp
```

## Installation

```bash
npm install
```

**Note for pnpm users:** If you encounter canvas build errors, you may need to manually build canvas:

```bash
# Install native dependencies (macOS)
brew install cairo pango libpng jpeg giflib

# Install node-gyp
pnpm add -D node-gyp

# Manually build canvas
cd node_modules/.pnpm/canvas@*/node_modules/canvas && npm run install
```

## Usage

```bash
npm run dev <youtube-url>
```

Or after building:

```bash
npm run build
npm start <youtube-url>
```

### Options

- `-o, --output <path>` - Output video path (default: `output/lyrics-video.mp4`)
- `-w, --width <number>` - Video width in pixels (default: `1920`)
- `-h, --height <number>` - Video height in pixels (default: `1080`)
- `-f, --font-size <number>` - Font size in pixels (default: `80`)

### Examples

```bash
# Basic usage (use a video with subtitles/CC enabled)
npm run dev "https://www.youtube.com/watch?v=VIDEO_ID"

# Custom output path
npm run dev "https://www.youtube.com/watch?v=VIDEO_ID" -o my-video.mp4

# Custom dimensions and font size
npm run dev "https://www.youtube.com/watch?v=VIDEO_ID" -w 1280 -h 720 -f 60
```

**Important:** The video must have subtitles/closed captions (CC) enabled. You can check by:

- Looking for the "CC" button on the YouTube video player
- Checking if the video has auto-generated or manual subtitles
- Most music videos and popular content have transcripts available

## How It Works

1. **Transcript Extraction**: Fetches the transcript/subtitles from the YouTube video
2. **Audio Download**: Downloads the audio track from the YouTube video
3. **Frame Generation**: Creates individual video frames with pixelated text for each transcript segment
4. **Video Assembly**: Combines all frames with the audio track using FFmpeg

## Output

The generated video will have:

- Black background (`#000000`)
- White text (`#FFFFFF`)
- Pixelated monospace font (Minecraft-style)
- Synchronized lyrics matching the audio timing

## Troubleshooting

- **"No transcript available"**:
  - The video doesn't have subtitles/closed captions enabled
  - Try a different video - look for the "CC" button on YouTube videos
  - Most music videos, popular content, and educational videos have transcripts
  - You can filter YouTube search results by "Subtitles/CC" to find videos with transcripts
- **"Found 0 transcript items"**: Same as above - the video needs to have subtitles enabled.
- **FFmpeg errors**: Make sure FFmpeg is installed and in your PATH.
- **Audio download fails**:
  - Make sure yt-dlp is installed: `brew install yt-dlp` (macOS) or check installation
  - YouTube may have rate limits. Wait a few minutes and try again.
  - Some videos may be restricted or unavailable in your region.

## License

MIT
