import { spawn } from 'child_process';

export class VideoStreamer {
  constructor(options = {}) {
    this.videoPort = options.videoPort || 11111;
    this.ffmpegProcess = null;
    this.isActive = false;
    this.clientIp = null;
  }

  start(clientIp) {
    if (this.isActive) {
      if (this.clientIp === clientIp) return;
      this.stop();
    }

    this.clientIp = clientIp || '127.0.0.1';
    this.isActive = true;

    console.log(`[Video Streamer] Starting H.264 video stream to ${this.clientIp}:${this.videoPort}...`);

    try {
      // Spawn ffmpeg to generate simulated 720p 30fps H.264 video stream matching DJI Tello's 960x720 30fps camera
      const args = [
        '-re',
        '-f', 'lavfi',
        '-i', 'testsrc=size=960x720:rate=30,drawtext=text=\'DJI TELLO SIMULATOR FPV 720P\':x=(w-text_w)/2:y=30:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6,drawtext=text=\'%{localtime\\:%H\\\\\\:%M\\\\\\:%S}\':x=(w-text_w)/2:y=650:fontsize=20:fontcolor=green:box=1:boxcolor=black@0.6',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-b:v', '2M',
        '-f', 'h264',
        `udp://${this.clientIp}:${this.videoPort}?pkt_size=1400`
      ];

      this.ffmpegProcess = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

      this.ffmpegProcess.stderr.on('data', (data) => {
        // Suppress verbose ffmpeg logs unless debug needed
      });

      this.ffmpegProcess.on('error', (err) => {
        console.warn(`[Video Streamer] FFmpeg spawn error: ${err.message}. Video streaming may be unavailable.`);
        this.isActive = false;
      });

      this.ffmpegProcess.on('exit', (code, signal) => {
        console.log(`[Video Streamer] Stream process exited (code: ${code}, signal: ${signal})`);
        this.isActive = false;
        this.ffmpegProcess = null;
      });
    } catch (e) {
      console.warn(`[Video Streamer] Failed to initialize ffmpeg:`, e);
      this.isActive = false;
    }
  }

  stop() {
    if (!this.isActive && !this.ffmpegProcess) return;
    console.log(`[Video Streamer] Stopping video stream.`);
    this.isActive = false;
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill('SIGINT');
      } catch (e) {}
      this.ffmpegProcess = null;
    }
  }
}
