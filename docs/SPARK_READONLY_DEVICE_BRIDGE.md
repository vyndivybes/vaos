# SPARK desktop ↔ VAOS Jarvis (read-only v1)

This is an explicitly commissioned device bridge, **not** a browser login and **not** an authorization to run VAOS missions or PC commands.

## Provisioning

In the Cloudflare Worker environment, configure:
- `VAOS_SPARK_BRIDGE_CONTROL=read-only-v1`
- `VAOS_SPARK_DEVICE_ID=spark-windows-1` (choose a unique lowercase device name)
- `VAOS_SPARK_BRIDGE_TOKEN` as a Cloudflare encrypted secret: a strong random string of at least 32 characters, **never checked into Git**.

Configure the same device ID and token on the SPARK machine as `SPARK_JARVIS_DEVICE_ID` and `SPARK_JARVIS_TOKEN`. Set `SPARK_JARVIS_URL` to the authoritative HTTPS Worker origin. Do not put these values in Electron, HTML, browser storage, repository settings, or chat logs.

Rotate the secret on both sides to revoke old clients. Disable the bridge by removing the control flag or secret. For now, **one paired device** is supported.

## Contract

`POST /api/spark-bridge` over HTTPS, JSON request `{version:1,requestId:UUID,deviceId,operation:"ask",question}` with `Authorization: Bearer <device-secret>`. No browser Origin allowed. The server returns only an answer, observation/hold status, source authority, source coverage, and exact correlation ID. Missing sources return HOLD; remote responses cannot authorize actions.

Reads use the existing VYNDI signed bridge and mission ledger only. Never infer financial totals from sampled rows.

## Acceptance

Run `node --test apps/web/api/spark-bridge.test.mjs`, then the normal VAOS web suite/lint. Do not activate production until both repos pass, required secrets are configured and a real read-only request passes using a valid VYNDI source. This release does not implement streaming, autonomous mission dispatch, or remote desktop control.
