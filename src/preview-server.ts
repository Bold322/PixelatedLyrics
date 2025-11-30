import { createServer } from 'http';
import { readFile, readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

export class PreviewServer {
  private server: any;
  private port: number;
  private framesDir: string;
  private audioPath: string | null = null;
  private isRunning: boolean = false;

  constructor(framesDir: string, port: number = 3000, audioPath?: string) {
    this.framesDir = framesDir;
    this.port = port;
    this.audioPath = audioPath || null;
  }

  /**
   * Starts the preview server
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          const url = req.url || '/';
          
          if (url === '/' || url === '/index.html') {
            // Serve the HTML preview page
            const html = await this.getPreviewHTML();
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          } else if (url.startsWith('/frames/')) {
            // Serve frame images
            const framePath = join(this.framesDir, url.replace('/frames/', ''));
            
            if (existsSync(framePath) && extname(framePath) === '.png') {
              const image = await readFile(framePath);
              res.writeHead(200, { 
                'Content-Type': 'image/png',
                'Cache-Control': 'no-cache'
              });
              res.end(image);
            } else {
              res.writeHead(404);
              res.end('Frame not found');
            }
          } else if (url === '/audio') {
            // Serve audio file
            if (this.audioPath && existsSync(this.audioPath)) {
              const audio = await readFile(this.audioPath);
              const ext = extname(this.audioPath).toLowerCase();
              const contentType = 
                ext === '.m4a' ? 'audio/mp4' :
                ext === '.webm' ? 'audio/webm' :
                ext === '.opus' ? 'audio/opus' :
                ext === '.mp3' ? 'audio/mpeg' :
                ext === '.ogg' ? 'audio/ogg' :
                'audio/mpeg';
              
              res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
                'Accept-Ranges': 'bytes'
              });
              res.end(audio);
            } else {
              res.writeHead(404);
              res.end('Audio not found');
            }
          } else if (url === '/latest-frame') {
            // API endpoint to get the latest frame number
            const latestFrame = await this.getLatestFrame();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ frame: latestFrame }));
          } else if (url === '/frame-at-time') {
            // API endpoint to get frame number at a specific time (in seconds)
            const urlParams = new URL(req.url || '', `http://localhost:${this.port}`).searchParams;
            const time = parseFloat(urlParams.get('time') || '0');
            const fps = 30; // Should match the video FPS
            const frameNumber = Math.floor(time * fps) + 1; // +1 because frames start at 1
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ frame: frameNumber }));
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (error) {
          res.writeHead(500);
          res.end('Server error');
        }
      });

      this.server.listen(this.port, () => {
        this.isRunning = true;
        const url = `http://localhost:${this.port}`;
        resolve(url);
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          // Port in use, try next port
          this.port++;
          this.start().then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Gets the latest frame number
   */
  private async getLatestFrame(): Promise<number> {
    try {
      const files = await readdir(this.framesDir);
      const frameFiles = files
        .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
        .map(f => {
          const match = f.match(/frame_(\d+)\.png/);
          return match ? parseInt(match[1]) : 0;
        })
        .sort((a, b) => b - a);
      
      return frameFiles[0] || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Generates the HTML preview page
   */
  private async getPreviewHTML(): Promise<string> {
    const latestFrame = await this.getLatestFrame();
    const hasAudio = this.audioPath && existsSync(this.audioPath);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MrLyrics - Frame Preview</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: "Pixelify Sans", sans-serif;
            color: #fff;
            overflow: hidden;
        }
        .container {
            text-align: center;
            position: relative;
            width: 100%;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #frameImage {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
        }
        .info {
            position: fixed;
            top: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.5);
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 14px;
            font-family: "Pixelify Sans", sans-serif;
            font-weight: 600;
            z-index: 1000;
            pointer-events: none;
        }
        .time-display {
            position: fixed;
            bottom: 30px;
            right: 30px;
            font-size: 48px;
            font-weight: 700;
            text-shadow: 2px 2px 0 #000;
            z-index: 1000;
            pointer-events: none;
        }
        /* Hide audio element but keep it functional */
        audio {
            position: absolute;
            opacity: 0;
            pointer-events: none;
        }
        .loading {
            color: #888;
        }
        .controls-hint {
            position: fixed;
            bottom: 20px;
            left: 20px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="info">
            <div>Frame: <span id="frameNumber">${latestFrame}</span></div>
            <div>Status: <span id="status">Loading...</span></div>
        </div>
        
        <div class="time-display" id="timeDisplay">00:00</div>
        
        <div class="controls-hint">
            Space: Play/Pause | ←/→: Seek 5s
        </div>

        ${hasAudio ? `
        <audio id="audioPlayer" autoplay>
            <source src="/audio" type="audio/mpeg">
        </audio>
        ` : ''}
        
        <img id="frameImage" src="/frames/frame_${String(latestFrame).padStart(8, '0')}.png" 
             alt="Frame preview" 
             onerror="this.style.display='none'; document.getElementById('status').textContent='Waiting for frames...';">
    </div>
    
    <script>
        let currentFrame = ${latestFrame};
        const fps = 30; // Should match video FPS
        
        const audioPlayer = document.getElementById('audioPlayer');
        const img = document.getElementById('frameImage');
        const frameNumEl = document.getElementById('frameNumber');
        const statusEl = document.getElementById('status');
        const timeDisplay = document.getElementById('timeDisplay');
        
        // Image cache for preloading
        const imageCache = new Map();
        const PRELOAD_COUNT = 60; // Preload 2 seconds ahead
        
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return \`\${mins.toString().padStart(2, '0')}:\${secs.toString().padStart(2, '0')}\`;
        }

        function preloadFrames(startFrame) {
            for (let i = 1; i <= PRELOAD_COUNT; i++) {
                const frameNum = startFrame + i;
                if (!imageCache.has(frameNum)) {
                    const preloadImg = new Image();
                    preloadImg.src = '/frames/frame_' + String(frameNum).padStart(8, '0') + '.png';
                    imageCache.set(frameNum, preloadImg);
                    
                    // Cleanup old cache
                    if (imageCache.size > PRELOAD_COUNT * 2) {
                        const keys = Array.from(imageCache.keys()).sort((a, b) => a - b);
                        if (keys.length > 0 && keys[0] < startFrame - 10) {
                            imageCache.delete(keys[0]);
                        }
                    }
                }
            }
        }

        function updateFrame(frameNum) {
            frameNumEl.textContent = frameNum;
            
            const frameUrl = '/frames/frame_' + String(frameNum).padStart(8, '0') + '.png';
            
            // Check cache first
            if (imageCache.has(frameNum) && imageCache.get(frameNum).complete) {
                img.src = imageCache.get(frameNum).src;
                statusEl.textContent = 'Synced (Cached)';
            } else {
                img.src = frameUrl;
                statusEl.textContent = 'Synced';
            }
            
            img.style.display = 'block';
            
            img.onerror = function() {
                statusEl.textContent = 'Waiting...';
            };
            
            // Trigger preload for next frames
            preloadFrames(frameNum);
        }
        
        function syncFrameWithAudio() {
            if (audioPlayer) {
                const currentTime = audioPlayer.currentTime;
                timeDisplay.textContent = formatTime(currentTime);
                
                if (!audioPlayer.paused) {
                    const frameNumber = Math.floor(currentTime * fps) + 1;
                    if (frameNumber !== currentFrame) {
                        currentFrame = frameNumber;
                        updateFrame(currentFrame);
                    }
                }
            } else {
                // If no audio, check for latest generated frame
                // Throttle fetch to avoid spamming
                if (Date.now() % 500 < 20) { 
                    fetch('/latest-frame')
                        .then(res => res.json())
                        .then(data => {
                            if (data.frame > currentFrame) {
                                currentFrame = data.frame;
                                updateFrame(currentFrame);
                            }
                        });
                }
            }
            
            requestAnimationFrame(syncFrameWithAudio);
        }
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (!audioPlayer) return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    if (audioPlayer.paused) audioPlayer.play();
                    else audioPlayer.pause();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    audioPlayer.currentTime += 5;
                    // Reset cache on seek to avoid showing old frames
                    imageCache.clear();
                    preloadFrames(Math.floor(audioPlayer.currentTime * fps) + 1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    audioPlayer.currentTime -= 5;
                    imageCache.clear();
                    preloadFrames(Math.floor(audioPlayer.currentTime * fps) + 1);
                    break;
            }
        });
        
        // Start loop
        requestAnimationFrame(syncFrameWithAudio);
        
        if (audioPlayer) {
            // Preload initial frames
            preloadFrames(1);
            
            audioPlayer.addEventListener('seeked', () => {
                const frame = Math.floor(audioPlayer.currentTime * fps) + 1;
                currentFrame = frame;
                updateFrame(frame);
            });
        }
        
        // Initial load
        updateFrame(currentFrame);
    </script>
</body>
</html>`;
  }

  /**
   * Stops the preview server
   */
  stop(): void {
    if (this.server && this.isRunning) {
      this.server.close();
      this.isRunning = false;
    }
  }
}

