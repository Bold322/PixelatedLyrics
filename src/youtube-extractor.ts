import { existsSync } from 'fs';
import { mkdir, readFile, readdir, unlink } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TranscriptItem } from './types.js';

const execPromise = promisify(exec);

/** yt-dlp flags used on every invocation: avoid update checks (CI/Docker) and playlist expansion */
const YT_DLP_COMMON = '--no-playlist --no-update';

/** BCP-47-ish track ids from yt-dlp (e.g. en, zh-Hans, pt-PT-mn); rejects stderr warning lines mistaken for rows */
const SUBTITLE_LANG_CODE_RE = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

export class YouTubeExtractor {
  private ytDlpPath: string;

  constructor() {
    this.ytDlpPath = 'yt-dlp'; // Assumes yt-dlp is in PATH
  }

  /**
   * Parses the combined stdout/stderr of `yt-dlp --list-subs`.
   * Section headers vary by locale/version; we match stable substrings.
   */
  private parseListSubsOutput(raw: string): { code: string; name: string; isAuto: boolean }[] {
    const languages: { code: string; name: string; isAuto: boolean }[] = [];
    const seenCodes = new Set<string>();
    const lines = raw.split('\n');

    let parsingManualSubs = false;
    let parsingAutoCaptions = false;

    const isTableHeaderLine = (line: string): boolean => {
      const parts = line.trim().split(/\s+/);
      return parts.length >= 2 && parts[0] === 'Language' && parts[1] === 'Name';
    };

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('available subtitles') && !lower.includes('automatic')) {
        parsingManualSubs = true;
        parsingAutoCaptions = false;
        continue;
      }
      if (lower.includes('available automatic captions')) {
        parsingManualSubs = false;
        parsingAutoCaptions = true;
        continue;
      }

      if (!parsingManualSubs && !parsingAutoCaptions) {
        continue;
      }

      if (isTableHeaderLine(line) || line.trim() === '' || line.trim().startsWith('--')) {
        continue;
      }

      const parts = line.trim().split(/\s{2,}/);
      if (parts.length < 2) {
        continue;
      }

      const code = parts[0];
      if (!code || code === 'Language' || code === 'live_chat' || !SUBTITLE_LANG_CODE_RE.test(code)) {
        continue;
      }

      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        languages.push({
          code,
          name: parts[1],
          isAuto: parsingAutoCaptions
        });
      }
    }

    return languages;
  }

  /**
   * Fallback when --list-subs text parsing yields nothing (output shape changes, buffering, etc.).
   * Uses metadata JSON: manual tracks in `subtitles`, auto in `automatic_captions`.
   */
  private async getAvailableLanguagesFromMetadataJson(videoUrl: string): Promise<{ code: string; name: string; isAuto: boolean }[]> {
    const { stdout, stderr } = await execPromise(
      `${this.ytDlpPath} --skip-download --dump-single-json ${YT_DLP_COMMON} "${videoUrl}"`,
      { maxBuffer: 50 * 1024 * 1024 }
    );
    if (stderr.trim()) {
      console.warn(stderr.trim());
    }
    const blob = stdout;
    const start = blob.indexOf('{');
    const end = blob.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new Error('yt-dlp metadata: no JSON object in output');
    }
    const data = JSON.parse(blob.slice(start, end + 1)) as {
      subtitles?: Record<string, Array<{ name?: string }>>;
      automatic_captions?: Record<string, Array<{ name?: string }>>;
    };

    const languages: { code: string; name: string; isAuto: boolean }[] = [];
    const seenCodes = new Set<string>();

    const addLang = (code: string, name: string, isAuto: boolean): void => {
      if (code === 'live_chat' || seenCodes.has(code)) {
        return;
      }
      seenCodes.add(code);
      languages.push({ code, name, isAuto });
    };

    for (const [code, tracks] of Object.entries(data.subtitles ?? {})) {
      if (code === 'live_chat') {
        continue;
      }
      const name = tracks?.[0]?.name?.trim() || code;
      addLang(code, name, false);
    }

    for (const [code, tracks] of Object.entries(data.automatic_captions ?? {})) {
      const name = tracks?.[0]?.name?.trim() || code;
      addLang(code, name, true);
    }

    return languages;
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
   * Gets available subtitle languages for a video (both manual and auto-generated)
   */
  async getAvailableLanguages(videoUrl: string): Promise<{ code: string; name: string; isAuto: boolean }[]> {
    console.log('📝 Fetching available subtitles...');
    const normalizedUrl = this.normalizeUrl(videoUrl);

    const logResult = (languages: { code: string; name: string; isAuto: boolean }[], source: string): void => {
      const manual = languages.filter((l) => !l.isAuto).length;
      const auto = languages.filter((l) => l.isAuto).length;
      console.log(`✅ Found ${languages.length} subtitle languages (${manual} manual, ${auto} auto) via ${source}`);
    };

    try {
      // Subtitle tables are on stdout; stderr holds progress/warnings and must not be parsed as rows.
      const { stdout, stderr } = await execPromise(
        `${this.ytDlpPath} --list-subs ${YT_DLP_COMMON} "${normalizedUrl}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      if (stderr.trim()) {
        console.warn(stderr.trim());
      }
      let languages = this.parseListSubsOutput(stdout);

      if (languages.length === 0) {
        console.log('📝 List-subs text empty; trying metadata JSON...');
        languages = await this.getAvailableLanguagesFromMetadataJson(normalizedUrl);
        logResult(languages, 'metadata JSON');
      } else {
        logResult(languages, 'list-subs');
      }
      return languages;
    } catch (error) {
      console.warn('⚠️ list-subs failed, trying metadata JSON:', error);
      try {
        const languages = await this.getAvailableLanguagesFromMetadataJson(normalizedUrl);
        logResult(languages, 'metadata JSON fallback');
        return languages;
      } catch (fallbackErr) {
        console.warn('⚠️ Subtitle discovery failed:', fallbackErr);
        return [];
      }
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

        // Try manual subtitles first, then auto-generated if not available
        try {
          await execPromise(`${this.ytDlpPath} --write-sub --sub-lang ${lang} --skip-download ${YT_DLP_COMMON} --output "${outputPath}" "${normalizedUrl}"`);
        } catch (error) {
          // If manual subtitle fails, try auto-generated captions
          console.log(`  Trying auto-generated captions for ${lang}...`);
          await execPromise(`${this.ytDlpPath} --write-auto-sub --sub-lang ${lang} --skip-download ${YT_DLP_COMMON} --output "${outputPath}" "${normalizedUrl}"`);
        }
        
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

  /**
   * Downloads audio for the video. Prefers DASH/WebM bestaudio; if googlevideo returns HTTP 403
   * (common when YouTube withholds direct URLs for DASH audio / SABR), falls back to a
   * progressive MP4 (e.g. format 18) which still carries AAC in an MP4 the browser can play.
   */
  async downloadAudio(videoUrl: string, outputPath: string): Promise<string> {
    console.log('🎤 Downloading audio...');
    const normalizedUrl = this.normalizeUrl(videoUrl);

    const dir = dirname(outputPath);
    const stem = basename(outputPath, extname(outputPath));
    const webmPath = join(dir, `${stem}.webm`);
    const mp4Path = join(dir, `${stem}.mp4`);

    if (existsSync(webmPath)) {
      console.log('✅ Audio already exists, skipping download');
      return webmPath;
    }
    if (existsSync(mp4Path)) {
      console.log('✅ Audio already exists, skipping download');
      return mp4Path;
    }

    const downloadDashAudio = async (): Promise<void> => {
      await execPromise(
        `${this.ytDlpPath} -f bestaudio ${YT_DLP_COMMON} --output "${webmPath}" "${normalizedUrl}"`
      );
    };

    try {
      await downloadDashAudio();
      console.log('✅ Audio downloaded (DASH/WebM)');
      return webmPath;
    } catch (firstError) {
      console.warn(
        '⚠️ DASH bestaudio failed (often HTTP 403 on audio-only streams). Trying progressive MP4...',
        firstError instanceof Error ? firstError.message : firstError
      );
      if (existsSync(webmPath)) {
        await unlink(webmPath).catch(() => undefined);
      }
    }

    try {
      await execPromise(
        `${this.ytDlpPath} -f "18/best[ext=mp4][acodec!=none][vcodec!=none]" ${YT_DLP_COMMON} --output "${mp4Path}" "${normalizedUrl}"`
      );
      console.log('✅ Audio downloaded (progressive MP4, AAC)');
      return mp4Path;
    } catch (error) {
      if (existsSync(mp4Path)) {
        await unlink(mp4Path).catch(() => undefined);
      }
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
