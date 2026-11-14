FROM node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f
WORKDIR /app
# Go/Chisel uses the OS trust store; Node's bundled fetch roots are insufficient.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
# Official v1.12.0 Linux amd64 artifact, verified before decompression. No runtime download.
RUN node --input-type=module -e "import{createHash}from'node:crypto';import{gunzipSync}from'node:zlib';import{writeFileSync}from'node:fs';const r=await fetch('https://github.com/jpillora/chisel/releases/download/v1.12.0/chisel_1.12.0_linux_amd64.gz');if(!r.ok)throw Error('download');const b=Buffer.from(await r.arrayBuffer());if(createHash('sha256').update(b).digest('hex')!=='f3f180f1d93aa72cce4e6386f98cc06569a0146fbd65eb4423cf83e6434bcfe6')throw Error('digest');writeFileSync('/app/chisel',gunzipSync(b),{mode:0o755});"
COPY reverse-client.mjs reverse-connector.mjs ./
USER node
CMD ["sh", "-c", "ulimit -n 256 && exec node --max-old-space-size=64 reverse-client.mjs"]
