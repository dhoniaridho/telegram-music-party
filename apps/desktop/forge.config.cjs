module.exports = {
  packagerConfig: {
    asar: true,
    prune: false,
    derefSymlinks: true,
    ignore: [
      /^\/node_modules\/\@electron-forge(?:\/|$)/,
      /^\/node_modules\/electron(?:\/|$)/,
    ],
    extraResource: ["generated/assets", "generated/server"],
    name: "Music Party",
    appBundleId: "com.dhoniaridho.musicparty",
    executableName: "music-party",
    darwinDarkModeSupport: true,
  },
  rebuildConfig: {},
  makers: [
    { name: "@electron-forge/maker-squirrel", config: { name: "music_party" } },
    { name: "@electron-forge/maker-dmg", config: { format: "ULFO" } },
    { name: "@electron-forge/maker-deb", config: { options: { maintainer: "Doni", homepage: "https://party.dhoniaridho.com" } } },
    { name: "@electron-forge/maker-zip", platforms: ["darwin", "linux", "win32"] },
  ],
};
