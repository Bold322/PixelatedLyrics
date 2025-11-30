import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { TranscriptItem, VideoConfig } from './types.js';
import { existsSync } from 'fs';

export class VideoGenerator {
  private config: VideoConfig;
  private canvas: any;
  private ctx: CanvasRenderingContext2D;

  constructor(config: VideoConfig) {
    this.config = config;
    this.canvas = createCanvas(config.width, config.height);
    this.ctx = this.canvas.getContext('2d');
    this.setupPixelatedRendering();
  }

  /**
   * Sets up pixelated rendering context
   */
  private setupPixelatedRendering(): void {
    // Disable anti-aliasing for pixelated effect
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'center';
  }

  /**
   * Renders text with pixelated effect using Pixelify Sans font
   */
  private renderPixelatedText(text: string, x: number, y: number, fontSize: number): void {
    // Set font - using Pixelify Sans for pixelated look
    // Note: Canvas doesn't support web fonts directly, so we'll use a system fallback
    // For best results, install Pixelify Sans font on the system
    // Fallback to monospace if font not available
    this.ctx.font = `bold ${fontSize}px "Pixelify Sans", "Courier New", monospace`;
    this.ctx.fillStyle = this.config.textColor;
    
    // Draw text multiple times with slight offset for bold pixelated effect
    this.ctx.fillText(text, x, y);
    this.ctx.fillText(text, x + 1, y);
    this.ctx.fillText(text, x, y + 1);
  }

  /**
   * Renders a frame with lyrics
   */
  /**
   * Renders a frame with lyrics
   */
  private renderFrame(textLines: string[]): Buffer {
    // Clear canvas with black background
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, this.config.width, this.config.height);

    if (!textLines || textLines.length === 0 || textLines.every(t => !t || t.trim() === '')) {
      return this.canvas.toBuffer('image/png');
    }

    // Calculate layout for multiple languages
    const totalLanguages = textLines.length;
    const spacing = this.config.height / (totalLanguages + 1);
    
    textLines.forEach((text, langIndex) => {
      if (!text || text.trim() === '') return;

      // Split text into lines if too long
      const maxCharsPerLine = Math.floor(this.config.width / (this.config.fontSize * 0.6));
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxCharsPerLine) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);

      // Render up to 2 lines per language to save space
      const maxDisplayLines = 2;
      const displayLines = lines.slice(0, maxDisplayLines);

      const lineHeight = this.config.fontSize * 1.2;
      const totalBlockHeight = displayLines.length * lineHeight;
      
      // Center this language block around its vertical center point
      // If 1 lang: center of screen
      // If 2 langs: 1/3 and 2/3 of screen
      // If 3 langs: 1/4, 2/4, 3/4 of screen
      const centerY = spacing * (langIndex + 1);
      const startY = centerY - (totalBlockHeight / 2) + (lineHeight / 2);

      displayLines.forEach((line, lineIndex) => {
        const y = startY + lineIndex * lineHeight;
        // Use slightly smaller font for secondary languages if desired, 
        // but for now keeping same size or maybe slightly smaller for 2nd/3rd langs
        const fontSize = langIndex === 0 ? this.config.fontSize : this.config.fontSize * 0.8;
        this.renderPixelatedText(line, this.config.width / 2, y, fontSize);
      });
    });

    return this.canvas.toBuffer('image/png');
  }

  /**
   * Generates video frames from transcript with live preview
   */
  async generateFrames(
    transcript: TranscriptItem[],
    framesDir: string,
    fps: number,
    onFrameGenerated?: (frameNumber: number, totalFrames: number, framePath: string) => void
  ): Promise<{ totalFrames: number; duration: number }> {
    const frameDuration = 1000 / fps; // milliseconds per frame
    
    // Calculate total duration
    const lastItem = transcript[transcript.length - 1];
    const totalDuration = lastItem.offset + lastItem.duration;
    const totalFrames = Math.ceil(totalDuration / frameDuration);

    // Create a map of frame number to transcript item
    const frameToItem = new Map<number, TranscriptItem>();
    
    for (const item of transcript) {
      const startFrame = Math.floor(item.offset / frameDuration);
      const endFrame = Math.ceil((item.offset + item.duration) / frameDuration);
      
      for (let frame = startFrame; frame < endFrame; frame++) {
        if (!frameToItem.has(frame) || frameToItem.get(frame)!.offset < item.offset) {
          frameToItem.set(frame, item);
        }
      }
    }

    // Generate frames sequentially with progress updates
    for (let frameNumber = 0; frameNumber < totalFrames; frameNumber++) {
      const item = frameToItem.get(frameNumber);
      const textLines = item ? item.text : [];
      
      const framePath = join(framesDir, `frame_${String(frameNumber + 1).padStart(8, '0')}.png`);
      
      // Resume capability: Check if frame already exists
      // We could also check file size to ensure it's not empty/corrupt
      if (existsSync(framePath)) {
        // Skip generation but still notify progress
        if (onFrameGenerated) {
          onFrameGenerated(frameNumber + 1, totalFrames, framePath);
        }
        continue;
      }

      const frameBuffer = this.renderFrame(textLines);
      
      await writeFile(framePath, frameBuffer);
      
      // Call callback for preview/progress updates
      if (onFrameGenerated) {
        onFrameGenerated(frameNumber + 1, totalFrames, framePath);
      }
    }
    
    return { totalFrames, duration: totalDuration };
  }

  /**
   * Combines frames and audio into final video
   */
  async createVideo(
    framesDir: string,
    audioPath: string,
    outputPath: string,
    fps: number,
    totalFrames: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const framePattern = join(framesDir, 'frame_%08d.png');
      
      ffmpeg()
        .input(framePattern)
        .inputOptions([
          `-framerate ${fps}`,
          `-start_number 1`,
          '-pattern_type sequence'
        ])
        .input(audioPath)
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          `-r ${fps}`,
          '-preset medium',
          '-crf 23'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command: ' + commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            process.stdout.write(`\r⏳ Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('\n');
          resolve(outputPath);
        })
        .on('error', (error) => {
          reject(new Error(`FFmpeg error: ${error.message}`));
        })
        .run();
    });
  }
}

