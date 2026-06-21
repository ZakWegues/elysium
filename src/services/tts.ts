import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getConfig } from "../main/config";

export async function synthesize(text: string): Promise<Buffer> {
  const cfg = getConfig();
  const tts = new MsEdgeTTS();
  await tts.setMetadata(cfg.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  return new Promise<Buffer>((resolve, reject) => {
    const stream = tts.toStream(text);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: unknown) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    });
    stream.on("close", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
