# Benchmarks

Local measurements. Not a capture from the live server.

```bash
npm run benchmark
```

Writes `benchmarks/latest.json` and prints the same object.

Fields:

- `protocol` : `encodeInputCmd` / `encodeFireCmd` sizes, plus `JSON.stringify` UTF-8 bytes of the same objects
- `bandwidth` : 60 Hz input payload, plus a separate RFC 6455 framing estimate
- `prediction` : `LocalPlayer.reconcileWithServer` against a local `PhysicsWorld`, delayed ack at 0 / 50 / 100 / 150 ms
- `serverTick` : 1 / 4 / 8 capsules on this machine, no Colyseus

`bandwidth.payloadBytesPerSec` is application payload only. `estimatedWsAppPlusFramingBytesPerSec` adds a 6-byte masked-frame estimate. Neither includes TLS, TCP, IP, or Colyseus wrappers.

`prediction` and `serverTick` are local synthetic harnesses. They are not a browser client against a Colyseus room, and they are not a production load test.
