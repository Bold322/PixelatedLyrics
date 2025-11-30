import { YoutubeTranscript } from 'youtube-transcript';
import { existsSync } from 'fs';
import { mkdir, readFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TranscriptItem } from './types.js';

const execPromise = promisify(exec);

export class YouTubeExtractor {
  private ytDlpPath: string;

  constructor() {
    this.ytDlpPath = 'yt-dlp'; // Assumes yt-dlp is in PATH
  }

  /**
   * Normalizes YouTube URL by removing escape characters and fixing format
   */
  private normalizeUrl(url: string): string {
    // Remove escape characters that might be added by shell
    let normalized = url.replace(/\\/g, '');
    
    // Ensure proper URL format
    if (!normalized.includes('youtube.com') && !normalized.includes('youtu.be')) {
      // It might be just a video ID
      if (normalized.length === 11) {
        return `https://www.youtube.com/watch?v=${normalized}`;
      }
      throw new Error('Invalid YouTube URL format');
    }
    
    return normalized;
  }

  /**
   * Extracts video ID from YouTube URL
   */
  extractVideoId(url: string): string {
    // Normalize URL first to handle escaped characters
    const normalizedUrl = this.normalizeUrl(url);
    const match = normalizedUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (!match || !match[1]) {
      throw new Error(`Invalid YouTube URL: ${url}`);
    }
    return match[1];
  }

  /**
   * Gets available subtitle languages for a video (manual subtitles only, not auto-generated)
   */
  async getAvailableLanguages(videoUrl: string): Promise<{ code: string; name: string }[]> {
    console.log('📝 Fetching available subtitles...');
    const normalizedUrl = this.normalizeUrl(videoUrl);
    
    try {
      // Add --no-playlist to avoid processing entire playlists
      // Increase maxBuffer to handle large subtitle lists
      const { stdout } = await execPromise(
        `${this.ytDlpPath} --list-subs --no-playlist "${normalizedUrl}"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
      );
      
      const languages: { code: string; name: string }[] = [];
      const lines = stdout.split('\n');
      
      let parsingManualSubs = false;
      let parsingAutoCaptions = false;
      
      for (const line of lines) {
        // Check for section headers
        if (line.includes('Available subtitles')) {
          parsingManualSubs = true;
          parsingAutoCaptions = false;
          continue;
        }
        if (line.includes('Available automatic captions')) {
          parsingManualSubs = false;
          parsingAutoCaptions = true;
          continue;
        }
        
        // Only parse manual subtitles, skip auto captions
        if (parsingManualSubs && !parsingAutoCaptions) {
          if (line.includes('Language') && line.includes('Name')) {
            continue;
          }
          
          if (line.trim() !== '' && !line.startsWith('--')) {
            const parts = line.trim().split(/\s{2,}/);
            if (parts.length >= 2) {
              languages.push({
                code: parts[0],
                name: parts[1]
              });
            }
          }
        }
      }
      
      console.log(`✅ Found ${languages.length} manual subtitle languages`);
      return languages;
    } catch (error) {
      console.warn('⚠️ Failed to list subtitles with yt-dlp:', error);
      return [];
    }
  }

  /**
   * Downloads transcript for selected languages
   */
  async downloadTranscript(videoUrl: string, selectedLanguages: string[]): Promise<TranscriptItem[]> {
    console.log(`📝 Downloading transcript for languages: ${selectedLanguages.join(', ')}...`);
    const normalizedUrl = this.normalizeUrl(videoUrl);
    
    const tempDir = join(process.cwd(), 'temp_subs');
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    const transcripts: { lang: string; items: TranscriptItem[] }[] = [];

    // Download each selected language (manual subtitles only)
    for (const lang of selectedLanguages) {
      try {
        const outputPath = join(tempDir, `sub_${lang}`);
        // Clean up previous files
        if (existsSync(`${outputPath}.vtt`)) {
          await unlink(`${outputPath}.vtt`);
        }

        // Use --write-sub for manual subtitles only (not --write-auto-sub)
        await execPromise(`${this.ytDlpPath} --write-sub --sub-lang ${lang} --skip-download --no-playlist --output "${outputPath}" "${normalizedUrl}"`);
        
        // yt-dlp might append language code to filename
        const files = await readdir(tempDir);
        const vttFile = files.find(f => f.startsWith(`sub_${lang}`) && f.endsWith('.vtt'));
        
        if (vttFile) {
          const vttContent = await readFile(join(tempDir, vttFile), 'utf-8');
          const items = this.parseVTT(vttContent);
          transcripts.push({ lang, items });
          console.log(`  - Fetched ${lang}: ${items.length} lines`);
        } else {
          console.warn(`  ⚠️ Failed to fetch ${lang} (file not found)`);
        }
      } catch (error) {
        console.warn(`  ⚠️ Failed to fetch ${lang}`, error);
      }
    }

    if (transcripts.length === 0) {
      console.warn('⚠️ No manual subtitles found for this video.');
      console.warn('💡 This video does not have manually uploaded captions/subtitles.');
      console.warn('💡 Only videos with manual subtitles (not auto-generated) are supported.');
      return [];
    }

    // Merge transcripts
    // Use the first language as the base for timing
    const baseTranscript = transcripts[0];
    const mergedItems: TranscriptItem[] = baseTranscript.items.map(item => ({
      text: [item.text[0]], // Initialize with base language text
      offset: item.offset,
      duration: item.duration
    }));

    // Add other languages
    for (let i = 1; i < transcripts.length; i++) {
      const currentLang = transcripts[i];
      
      // For each item in base transcript, find matching item in current lang
      for (let j = 0; j < mergedItems.length; j++) {
        const baseItem = mergedItems[j];
        const baseMid = baseItem.offset + (baseItem.duration / 2);
        
        // Find item that overlaps with the midpoint of base item
        const match = currentLang.items.find(item => 
          baseMid >= item.offset && baseMid <= (item.offset + item.duration)
        );
        
        if (match && match.text && match.text.length > 0) {
          mergedItems[j].text.push(match.text[0]);
        } else {
          mergedItems[j].text.push(''); // Empty string if no match
        }
      }
    }

    return mergedItems;
  }

  private parseVTT(vttContent: string): TranscriptItem[] {
    const items: TranscriptItem[] = [];
    const lines = vttContent.split('\n');
    
    const timeRegex = /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      const timeMatch = line.match(timeRegex);
      if (timeMatch) {
        // Parse start time
        const startH = parseInt(timeMatch[1]);
        const startM = parseInt(timeMatch[2]);
        const startS = parseInt(timeMatch[3]);
        const startMs = parseInt(timeMatch[4]);
        
        const currentStart = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;
        
        // Parse end time
        const endH = parseInt(timeMatch[5]);
        const endM = parseInt(timeMatch[6]);
        const endS = parseInt(timeMatch[7]);
        const endMs = parseInt(timeMatch[8]);
        
        const currentEnd = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;
        
        // Next line(s) are text until empty line
        let textLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '') {
          // Remove VTT tags like <c.colorCCCCCC>...</c> or <b>...</b>
          const cleanLine = lines[j].replace(/<[^>]*>/g, '').trim();
          if (cleanLine) textLines.push(cleanLine);
          j++;
        }
        
        if (textLines.length > 0) {
          items.push({
            text: [textLines.join(' ')], // Store as single string in array initially
            offset: currentStart,
            duration: currentEnd - currentStart
          });
        }
        
        i = j;
      }
    }
    
    return items;
  }

  async downloadAudio(videoUrl: string, outputPath: string): Promise<string> {
    console.log('🎤 Downloading audio...');
    const normalizedUrl = this.normalizeUrl(videoUrl);
    
    // Change output path to .webm since we're not converting
    const webmPath = outputPath.replace(/\.(mp3|m4a)$/, '.webm');
    
    // Check if file exists
    if (existsSync(webmPath)) {
      console.log('✅ Audio already exists, skipping download');
      return webmPath;
    }

    try {
      // Download audio in webm format without conversion (no ffmpeg needed)
      // Use --no-playlist to avoid downloading entire playlists
      await execPromise(
        `${this.ytDlpPath} -f bestaudio --no-playlist --output "${webmPath}" "${normalizedUrl}"`
      );
      console.log('✅ Audio downloaded');
      return webmPath;
    } catch (error) {
      console.error('❌ Failed to download audio:', error);
      throw error;
    }
  }

  // Legacy method for backward compatibility
  async getTranscript(videoUrl: string): Promise<TranscriptItem[]> {
    const available = await this.getAvailableLanguages(videoUrl);
    const preferred = ['mn', 'en', 'ja', 'ko', 'ru'];
    const selected: string[] = [];
    
    // Select up to 3 languages
    for (const pref of preferred) {
      if (selected.length >= 3) break;
      const match = available.find(l => l.code.startsWith(pref));
      if (match && !selected.includes(match.code)) {
        selected.push(match.code);
      }
    }
    
    if (selected.length < 3) {
      for (const lang of available) {
        if (selected.length >= 3) break;
        if (!selected.includes(lang.code)) {
          selected.push(lang.code);
        }
      }
    }
    
    return this.downloadTranscript(videoUrl, selected);
  }
}
