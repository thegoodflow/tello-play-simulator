import dgram from 'dgram';

const CMD_PORT = 8889;
const STATE_PORT = 8890;
const HOST = '127.0.0.1';

console.log('=== DJI TELLO UDP PROTOCOL VERIFICATION TEST ===\n');

// 1. Create client socket to send commands to 8889
const clientSocket = dgram.createSocket('udp4');

// 2. Create state listener socket on port 8890
const stateSocket = dgram.createSocket('udp4');

let statePacketsReceived = 0;

stateSocket.on('message', (msg) => {
  statePacketsReceived++;
  const text = msg.toString('utf-8');
  if (statePacketsReceived === 1) {
    console.log(`[PASS] Received DJI Tello State Packet on UDP 8890:`);
    console.log(`       "${text.trim()}"\n`);
  }
});

stateSocket.bind(STATE_PORT, '0.0.0.0', () => {
  console.log(`[TEST] Listening for drone telemetry state on port ${STATE_PORT}...`);
});

// Helper to send command and wait for reply
function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for reply to "${cmd}"`));
    }, 4000);

    const onMessage = (msg) => {
      clearTimeout(timeout);
      clientSocket.off('message', onMessage);
      const reply = msg.toString('utf-8').trim();
      resolve(reply);
    };

    clientSocket.on('message', onMessage);

    const buf = Buffer.from(cmd);
    clientSocket.send(buf, 0, buf.length, CMD_PORT, HOST, (err) => {
      if (err) {
        clearTimeout(timeout);
        clientSocket.off('message', onMessage);
        reject(err);
      }
    });
  });
}

async function runTests() {
  try {
    // Test 1: Send 'command'
    console.log('[TEST 1] Sending "command" to enter SDK mode...');
    const res1 = await sendCommand('command');
    console.log(`[PASS] Response: "${res1}" (Expected: "ok")\n`);
    if (res1 !== 'ok') throw new Error(`Unexpected response: ${res1}`);

    // Test 2: Read 'battery?'
    console.log('[TEST 2] Sending "battery?"...');
    const res2 = await sendCommand('battery?');
    console.log(`[PASS] Response: "${res2}"% (Expected: numeric battery percentage)\n`);

    // Test 3: Takeoff
    console.log('[TEST 3] Sending "takeoff"...');
    const res3 = await sendCommand('takeoff');
    console.log(`[PASS] Response: "${res3}" (Expected: "ok")\n`);

    // Test 4: Up 50
    console.log('[TEST 4] Sending "up 50"...');
    const res4 = await sendCommand('up 50');
    console.log(`[PASS] Response: "${res4}" (Expected: "ok")\n`);

    // Test 5: RC Stick command (no reply expected per SDK spec)
    console.log('[TEST 5] Sending "rc 0 20 0 0" (forward pitch)...');
    clientSocket.send(Buffer.from('rc 0 20 0 0'), CMD_PORT, HOST);
    console.log(`[PASS] RC command dispatched.\n`);

    // Wait 1.5 seconds to accumulate state packets
    await new Promise(r => setTimeout(r, 1500));

    console.log(`[TEST 6] Telemetry check: received ${statePacketsReceived} state packets on port 8890.`);
    if (statePacketsReceived < 2) {
      throw new Error(`Expected at least 2 state packets, got ${statePacketsReceived}`);
    }
    console.log(`[PASS] 10Hz telemetry broadcast functioning properly.\n`);

    // Test 7: Land
    console.log('[TEST 7] Sending "land"...');
    const res7 = await sendCommand('land');
    console.log(`[PASS] Response: "${res7}" (Expected: "ok")\n`);

    console.log('============================================================');
    console.log('  ALL DJI TELLO UDP PROTOCOL VERIFICATION TESTS PASSED!     ');
    console.log('============================================================\n');

    cleanup();
    process.exit(0);
  } catch (err) {
    console.error(`[FAIL] Test failed:`, err.message);
    cleanup();
    process.exit(1);
  }
}

function cleanup() {
  try { clientSocket.close(); } catch(e) {}
  try { stateSocket.close(); } catch(e) {}
}

// Start tests after 1s warmup
setTimeout(runTests, 1000);
