import { spawn } from 'child_process';
import dgram from 'dgram';

export class VideoStreamer {
  constructor(options = {}) {
    this.videoPort = options.videoPort || 11111;
    this.ffmpegProcess = null;
    this.isActive = false;
    this.target = null; // { address, port }
    
    // Create a UDP socket to receive the hole-punch from the emulator and send packets back
    this.proxySocket = dgram.createSocket('udp4');
    
    this.proxySocket.on('message', (msg, rinfo) => {
      // Receive hole punch from emulator
      if (!this.target || this.target.address !== rinfo.address || this.target.port !== rinfo.port) {
        // We only care about hole-punch packets (length 1 byte) or just update target
        if (msg.length < 10) {
          console.log(`[Video Streamer] Received NAT hole-punch from emulator at ${rinfo.address}:${rinfo.port}`);
          this.target = { address: rinfo.address, port: rinfo.port };
        }
      }
    });
    
    this.proxySocket.on('error', (err) => {
      console.error(`[Video Streamer] proxySocket error:`, err);
    });
    
    this.proxySocket.bind(this.videoPort, '0.0.0.0', () => {
      console.log(`[Video Streamer] UDP Proxy listening on port ${this.videoPort} for NAT hole-punch`);
    });

    // Create a local socket to receive FFmpeg output
    this.ffmpegPort = this.videoPort + 1; // 11112
    this.ffmpegSocket = dgram.createSocket('udp4');
    
    this.ffmpegSocket.on('message', (msg, rinfo) => {
      // Forward FFmpeg packet to the emulator's NAT hole
      if (this.isActive && this.target) {
        this.proxySocket.send(msg, this.target.port, this.target.address);
      }
    });
    
    this.ffmpegSocket.bind(this.ffmpegPort, '127.0.0.1', () => {
      console.log(`[Video Streamer] Internal FFmpeg receiver listening on 127.0.0.1:${this.ffmpegPort}`);
    });
  }

  start(clientIp) {
    if (this.isActive) {
      this.stop();
    }

    this.isActive = true;
    
    // In emulator NAT, clientIp is often 127.0.0.1 (host loopback from QEMU)
    // We rely on the hole-punch to set the real target port.
    console.log(`[Video Streamer] Starting H.264 video stream. Waiting for hole-punch...`);

    try {
      const args = [
        '-re',
        '-f', 'lavfi',
        '-i', "testsrc=size=960x720:rate=30,drawtext=text='TELLO 3D SIMULATOR FPV 720P':x=(w-text_w)/2:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6",
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-profile:v', 'baseline',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-b:v', '2M',
        '-f', 'h264',
        `udp://127.0.0.1:${this.ffmpegPort}?pkt_size=1400`
      ];

      this.ffmpegProcess = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

      let loggedStarted = false;
      this.ffmpegProcess.stderr.on('data', (data) => {
        const str = data.toString();
        if (!loggedStarted && str.includes('Output #0')) {
          loggedStarted = true;
          console.log(`[Video Streamer] FFmpeg active. Proxying to emulator NAT hole if known.`);
        }
      });

      this.ffmpegProcess.on('error', (err) => {
        console.warn(`[Video Streamer] FFmpeg spawn error: ${err.message}.`);
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
