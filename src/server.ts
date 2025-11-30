import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { YouTubeExtractor } from './youtube-extractor.js';
import { VideoGenerator } from './video-generator.js';
import { VideoConfig, TranscriptItem } from './types.js';

const app = express();
const server = createServer(app);
const outputDir = join(process.cwd(), 'output');

app.use(cors());
app.use(express.json());
app.use(express.static(join(process.cwd(), 'public')));

// Serve output directory at root to allow /{videoId}/audio.webm and /{videoId}/frames/...
app.use(express.static(outputDir));

// State management
interface ProjectState {
  videoId: string;
  url: string;
  status: 'idle' | 'downloading' | 'generating' | 'completed' | 'error';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  error?: string;
  config?: VideoConfig;
  selectedLanguages?: string[];
}

const projects = new Map<string, ProjectState>();
let activeProject: string | null = null;

const extractor = new YouTubeExtractor();

// Ensure directories exist
if (!existsSync(outputDir)) {
  await mkdir(outputDir, { recursive: true });
}

// API Endpoints

// Initialize project - Get video info and available languages
app.post('/api/init', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const videoId = extractor.extractVideoId(url);
    const languages = await extractor.getAvailableLanguages(url);

    // Initialize state if not exists
    if (!projects.has(videoId)) {
      projects.set(videoId, {
        videoId,
        url,
        status: 'idle',
        progress: 0,
        currentFrame: 0,
        totalFrames: 0
      });
    }

    activeProject = videoId;
    res.json({ videoId, languages, state: projects.get(videoId) });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Configure project
app.post('/api/configure', async (req, res) => {
  try {
    const { videoId, languages, config } = req.body;
    const project = projects.get(videoId);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.selectedLanguages = languages;
    project.config = config || {
      width: 1920,
      height: 1080,
      fps: 30,
      fontSize: 48,
      textColor: '#FFFFFF',
      backgroundColor: '#000000'
    };

    // Save config to disk
    const projectDir = join(outputDir, videoId);
    if (!existsSync(projectDir)) {
      await mkdir(projectDir, { recursive: true });
    }
    await writeFile(join(projectDir, 'config.json'), JSON.stringify(project, null, 2));

    res.json({ success: true, state: project });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Start/Resume generation
app.post('/api/start', async (req, res) => {
  const { videoId } = req.body;
  const project = projects.get(videoId);

  if (!project || !project.selectedLanguages) {
    return res.status(400).json({ error: 'Project not configured' });
  }

  if (project.status === 'generating' || project.status === 'downloading') {
    return res.json({ message: 'Already running', state: project });
  }

  // Start background process
  generateVideo(project).catch(err => {
    console.error('Generation error:', err);
    project.status = 'error';
    project.error = err.message;
  });

  res.json({ success: true, message: 'Started', state: project });
});

// Get status
app.get('/api/status', (req, res) => {
  const videoId = req.query.videoId as string || activeProject;
  if (!videoId || !projects.has(videoId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(projects.get(videoId));
});

// Get latest frame for preview
app.get('/api/preview/latest', (req, res) => {
  const videoId = req.query.videoId as string || activeProject;
  if (!videoId || !projects.has(videoId)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const project = projects.get(videoId);
  res.json({ 
    frame: project?.currentFrame || 0,
    total: project?.totalFrames || 0
  });
});

// Background generation task
async function generateVideo(project: ProjectState) {
  const projectDir = join(outputDir, project.videoId);
  const framesDir = join(projectDir, 'frames');
  const audioPath = join(projectDir, 'audio.webm'); // Changed to webm
  
  if (!existsSync(projectDir)) await mkdir(projectDir, { recursive: true });
  if (!existsSync(framesDir)) await mkdir(framesDir, { recursive: true });

  try {
    // 1. Download Transcript
    project.status = 'downloading';
    project.progress = 10;
    
    const transcript = await extractor.downloadTranscript(project.url, project.selectedLanguages!);
    
    // Validate transcript
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript available for this video. The video may not have captions/subtitles.');
    }
    
    console.log(`✅ Got ${transcript.length} transcript items`);
    
    // 2. Download Audio
    project.progress = 30;
    await extractor.downloadAudio(project.url, audioPath);
    
    // 3. Generate Frames
    project.status = 'generating';
    project.progress = 40;
    
    const generator = new VideoGenerator(project.config!);
    
    await generator.generateFrames(
      transcript,
      framesDir,
      project.config!.fps,
      (frameNum, total, path) => {
        project.currentFrame = frameNum;
        project.totalFrames = total;
        project.progress = 40 + Math.floor((frameNum / total) * 50);
      }
    );

    // 4. Create Video (Optional, can be separate step)
    // For now, we just mark as completed when frames are done
    project.status = 'completed';
    project.progress = 100;

  } catch (error) {
    project.status = 'error';
    project.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}

export class Server {
  start(port: number = 3000) {
    server.listen(port, () => {
      console.log(`🚀 Server running at http://localhost:${port}`);
    });
  }
}
