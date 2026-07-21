import { app, shell } from "electron";
import * as path from "node:path";
import { spawn } from "node:child_process";

export async function screenshot(filename?: string): Promise<string> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const fname = filename
    ? filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.png$/i, "") + ".png"
    : `screenshot_${timestamp}.png`;

  const filePath = path.join(app.getPath("desktop"), fname);
  const escaped = filePath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
    "$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
    `$bmp.Save('${escaped}')`,
    "$g.Dispose()",
    "$bmp.Dispose()",
  ].join("; ");

  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return new Promise<string>((resolve) => {
    const ps = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
      "-NonInteractive", "-EncodedCommand", encoded,
    ], { stdio: "pipe" });

    ps.on("close", async (code) => {
      if (code === 0) {
        await shell.openPath(filePath);
        resolve(`Screenshot "${fname}" salvo na Área de Trabalho.`);
      } else {
        resolve("Não consegui capturar a tela.");
      }
    });
    ps.on("error", () => resolve("Não consegui capturar a tela."));
  });
}
