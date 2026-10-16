// scripts/fusiveis.cjs — afterPack do electron-builder (fase 23.2, blindagem).
//
// Os "fusíveis" do Electron são chaves gravadas no próprio ELYSIUM.exe. Desligados aqui, o app
// instalado deixa de servir de Node genérico para outro programa do mesmo usuário:
//   · RunAsNode: `ELYSIUM.exe` com ELECTRON_RUN_AS_NODE=1 rodaria qualquer script;
//   · NODE_OPTIONS e --inspect: injetariam código ou abririam o depurador no processo do app;
//   · só carregar o app de dentro do app.asar (nada de pasta `app` solta ao lado).
// A validação de integridade do asar fica de fora: o electron-builder 24 não grava o hash no
// executável do Windows, e com ela ligada o app não abriria.
const path = require("node:path");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

exports.default = async function fusiveis(contexto) {
  if (contexto.electronPlatformName !== "win32") return;
  const exe = path.join(contexto.appOutDir, `${contexto.packager.appInfo.productFilename}.exe`);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
  console.log("  • fusíveis do Electron aplicados");
};
